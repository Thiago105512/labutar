import { novoId } from "../../core/src/ids.js";
import { arredondar } from "../../core/src/dinheiro.js";
import { NIVEL_CONFIABILIDADE, STATUS_REVISAO, LIMITE_VALIDADE_DISC, RESSALVAS_DISC } from "./constantes.js";
import { calcularDISC, descreverPerfil, responderDISC } from "./disc.js";
import { calcularEscalaDISC, compararEscalaComForcada } from "./escala.js";
import { avaliarValidadeDISC } from "./validade.js";
import { perfisPorSerie } from "./series.js";
import { diferenciacaoPerfil, projetarCircumplexo } from "./circumplexo.js";
import { montarGraficosDISC } from "./graficos.js";
import { compararBenchmark, GUARDRAILS_BENCHMARK_DISC } from "./benchmark.js";

function agoraISO() {
  return new Date().toISOString();
}

function checarInstrumento(instrumento) {
  if (!instrumento || !Array.isArray(instrumento.questoes) || instrumento.questoes.length === 0) {
    throw new Error(
      "emitirLaudoDISC exige o instrumento com 'questoes': use criarInstrumentoDISC() ou criarAvaliacaoDISC()"
    );
  }
}

/**
 * Laudo DISC completo: resposta → validade → três perfis → escala normativa →
 * circumplexo → gráficos → aderência à vaga → ressalvas.
 *
 * Ordem importa. A validade vem antes do perfil porque perfil calculado sobre
 * resposta inválida é o erro mais caro deste módulo: parece técnico, tem gráfico
 * bonito e sustenta decisão sobre a vida de alguém. Se a resposta não presta, o
 * laudo diz isso na primeira linha e o campo `utilizavel` sai falso.
 *
 * `podeSustentarDecisaoSozinha` é `false` sempre, sem parâmetro para ligar.
 */
export function emitirLaudoDISC({
  instrumento,
  respostas = [],
  escalas = [],
  tempoPorQuestao = null,
  tempoTotalSegundos = null,
  benchmark = null,
  tenantId = null,
  vagaId = null,
  candidaturaId = null,
  candidatoId = null,
  aplicadoPor = null,
  agora = null,
  limites = LIMITE_VALIDADE_DISC,
} = {}) {
  checarInstrumento(instrumento);

  const checagem = responderDISC(instrumento, respostas);
  const resultado = calcularDISC(instrumento, respostas);
  const temEscala = Array.isArray(escalas) && escalas.length > 0;
  const escala = temEscala ? calcularEscalaDISC(instrumento, escalas) : null;

  const validade = avaliarValidadeDISC({
    instrumento,
    checagem,
    escala,
    tempoPorQuestao,
    tempoTotalSegundos,
    limites,
  });

  const series = perfisPorSerie(instrumento, checagem);
  const base = resultado.respondidas || 0;

  const autoimagem = series.disponivel
    ? { contagens: series.claro.contagens, percentuais: series.claro.percentuais, origem: "SERIE_CLARA" }
    : { contagens: resultado.bruto, percentuais: resultado.percentuais, origem: "TODAS_AS_QUESTOES" };

  const pressao = series.disponivel
    ? { contagens: series.escura.contagens, percentuais: series.escura.percentuais, origem: "SERIE_ESCURA" }
    : { contagens: resultado.menos, percentuais: resultado.percentuaisMenos, origem: "ESCOLHAS_MENOS" };

  const divergenciaMetodo = escala
    ? compararEscalaComForcada(escala, resultado.percentuaisLiquidos, limites.divergenciaMetodoMaxima)
    : null;

  const diferenciacao = diferenciacaoPerfil(resultado.percentuaisLiquidos);
  const graficos = montarGraficosDISC({ resultado, instrumento, checagem });
  const comparacao = benchmark ? compararBenchmark(benchmark, resultado) : null;
  const descricaoPerfil = resultado.perfil ? descreverPerfil(resultado.perfil) : null;

  const alertas = [...validade.alertas];
  if (!resultado.completo) {
    alertas.push(
      `Resposta incompleta: ${resultado.respondidas} de ${resultado.totalQuestoes} questões. Resultado parcial não descreve perfil.`
    );
  }
  if (divergenciaMetodo?.haDivergencia) {
    alertas.push(
      `Escolha forçada e escala de concordância divergem em ${divergenciaMetodo.divergencias
        .map((d) => `${d.fator} (${d.diferenca} pts)`)
        .join(", ")}. Métodos diferentes medindo o mesmo fator deveriam convergir: tratar como dúvida, não como perfil.`
    );
  }
  if (diferenciacao.nivel === "PLANO") {
    alertas.push(diferenciacao.leitura);
  }
  if (comparacao?.nivel === "BAIXA") {
    alertas.push(
      "Aderência baixa ao perfil esperado da vaga. Antes de usar isso contra o candidato, revisar se o benchmark da vaga foi bem definido."
    );
  }
  if (validade.confiabilidade === NIVEL_CONFIABILIDADE.INSUFICIENTE) {
    alertas.push(
      "Confiabilidade insuficiente: não emitir perfil para decisão. Reaplicar o instrumento, de preferência com orientação sobre tempo e atenção."
    );
  }

  const geradoEm = agora ?? agoraISO();

  return {
    id: novoId("LAUDO"),
    tipo: "LAUDO_DISC",
    instrumento: {
      codigo: instrumento.codigoInstrumento ?? null,
      versao: instrumento.versao ?? null,
      idioma: instrumento.idioma ?? null,
      totalQuestoes: instrumento.totalQuestoes ?? instrumento.questoes.length,
      totalDeclaracoes: instrumento.escala?.totalDeclaracoes ?? 0,
    },
    contexto: { tenantId, vagaId, candidaturaId, candidatoId, aplicadoPor },
    geradoEm,
    dataGeracao: String(geradoEm).slice(0, 10),
    resposta: {
      completa: checagem.completo,
      respondidas: checagem.respondidas,
      totalQuestoes: resultado.totalQuestoes,
      pendentes: checagem.pendentes,
      invalidas: checagem.invalidas,
      tempoTotalSegundos: tempoTotalSegundos,
      tempoMedioPorQuestao:
        checagem.respondidas > 0 && Number.isFinite(tempoTotalSegundos)
          ? arredondar(tempoTotalSegundos / checagem.respondidas, 1)
          : null,
    },
    validade,
    seriesDisponiveis: series.disponivel,
    perfis: {
      liquido: {
        contagens: resultado.liquido,
        percentuais: resultado.percentuaisLiquidos,
        fatorPredominante: resultado.fatorPredominante,
        fatorPredominanteNome: resultado.fatorPredominanteNome,
        perfil: resultado.perfil,
        perfilTitulo: resultado.perfilTitulo,
      },
      autoimagem,
      pressao,
      bruto: resultado.bruto,
      rejeitado: resultado.menos,
    },
    escala: escala
      ? {
          porFator: escala.porFator,
          extremidade: escala.extremidade,
          completo: escala.completo,
          respondidas: escala.respondidas,
          totalDeclaracoes: escala.totalDeclaracoes,
        }
      : null,
    divergenciaMetodo,
    circumplexo: {
      liquido: projetarCircumplexo(resultado.liquido, { base }),
      autoimagem: projetarCircumplexo(
        series.disponivel ? series.claro.contagens : resultado.bruto,
        { base: series.disponivel ? series.blocosClaro : base }
      ),
      pressao: projetarCircumplexo(
        series.disponivel ? series.escura.contagens : resultado.menos,
        { base: series.disponivel ? series.blocosEscuro : base }
      ),
    },
    diferenciacao,
    mascara: graficos.mascara,
    graficos,
    descricaoPerfil,
    benchmark: comparacao,
    alertas,
    utilizavel: validade.utilizavel && Boolean(resultado.perfil),
    podeSustentarDecisaoSozinha: false,
    revisaoHumana: {
      obrigatoria: true,
      status: STATUS_REVISAO.PENDENTE,
      revisorId: null,
      registradaEm: null,
      fundamentoLegal: "LGPD, art. 20 — direito à revisão de decisão automatizada",
    },
    guardrails: GUARDRAILS_BENCHMARK_DISC,
    ressalvas: [...(instrumento.ressalvas ?? RESSALVAS_DISC)],
  };
}

/**
 * Uma frase de resumo para o card do pipeline. Não inclui aderência nem
 * alerta de validade: esses números fora de contexto viram rótulo na cabeça do
 * recrutador antes de ele abrir o laudo.
 */
export function resumoLaudo(laudo) {
  if (!laudo?.utilizavel) {
    return "Perfil comportamental não disponível: resposta incompleta ou sem confiabilidade suficiente.";
  }
  const perfil = laudo.descricaoPerfil;
  if (!perfil) return "Perfil comportamental não disponível.";

  const intensidade = laudo.diferenciacao?.nivel === "MARCADO" ? "marcado" : laudo.diferenciacao?.nivel === "PLANO" ? "pouco diferenciado" : "moderado";
  return `${perfil.titulo} (perfil ${perfil.codigo}, ${intensidade}). Leitura de apoio: ${perfil.resumo}`;
}

/**
 * Marca o laudo como revisado por gente. Devolve uma cópia — o laudo emitido é
 * imutável, porque alterar laudo em vez de registrar a revisão é o que destrói a
 * trilha probatória em um processo.
 */
export function aplicarRevisaoHumana(laudo, revisao) {
  if (!laudo || laudo.tipo !== "LAUDO_DISC") {
    throw new Error("aplicarRevisaoHumana exige um laudo gerado por emitirLaudoDISC()");
  }
  if (!revisao || revisao.registro !== "REVISAO_HUMANA") {
    throw new Error("aplicarRevisaoHumana exige um registro de registrarRevisaoHumana()");
  }
  return {
    ...laudo,
    revisaoHumana: {
      ...laudo.revisaoHumana,
      obrigatoria: true,
      status: revisao.decisao === "DESCARTADO" ? STATUS_REVISAO.DESCARTADO : STATUS_REVISAO.REVISADO,
      revisorId: revisao.revisorId,
      decisao: revisao.decisao,
      fundamentacao: revisao.fundamentacao,
      registradaEm: revisao.em,
    },
    utilizavel: revisao.decisao === "DESCARTADO" ? false : laudo.utilizavel,
  };
}
