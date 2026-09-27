import { arredondar } from "../../core/src/dinheiro.js";
import { NOME_FATOR_DISC, ORDEM_FATORES_DISC, SEGMENTOS_DISC, TIPO_GRAFICO_DISC } from "./constantes.js";
import { perfisPorSerie } from "./series.js";
import { diferenciacaoPerfil, pontoNaRoda, projetarCircumplexo } from "./circumplexo.js";
import { responderDISC } from "./disc.js";

function pontosDe(percentuais) {
  return ORDEM_FATORES_DISC.map((fator) => ({
    fator,
    nome: NOME_FATOR_DISC[fator],
    valor: Number(percentuais?.[fator] ?? 0),
  }));
}

function grafico({ tipo, titulo, descricao, percentuais }) {
  return {
    tipo,
    titulo,
    descricao,
    escala: { minima: 0, maxima: 100, neutro: 50, unidade: "%" },
    pontos: pontosDe(percentuais),
  };
}

/**
 * Os três gráficos clássicos do DISC (Graph I / II / III do PPA), mais a roda do
 * circumplexo. A separação em série clara e escura é o que dá sentido ao
 * Graph I: sem ela, "pressão" seria só o espelho negativo do que a pessoa
 * escolheu, e o gráfico não diria nada além do Graph III.
 */
export function montarGraficosDISC({ resultado, instrumento, checagem = null, respostas = [] }) {
  if (!resultado) throw new Error("montarGraficosDISC exige o resultado de calcularDISC()");

  const checagemEfetiva = checagem ?? (instrumento ? responderDISC(instrumento, respostas) : { validas: [] });
  const series = instrumento ? perfisPorSerie(instrumento, checagemEfetiva) : { disponivel: false };
  const base = resultado.respondidas || resultado.totalQuestoes || 1;

  const autoimagem = series.disponivel ? series.claro.percentuais : resultado.percentuais;
  const pressao = series.disponivel ? series.escura.percentuais : resultado.percentuaisMenos;

  const graficos = {
    pressao: grafico({
      tipo: TIPO_GRAFICO_DISC.PRESSAO,
      titulo: "Graph I — sob pressão",
      descricao:
        "O que emerge quando a pessoa admite o próprio lado difícil. É o comportamento provável em crise, prazo estourado ou conflito — não o que ela mostra no dia bom.",
      percentuais: pressao,
    }),
    autoimagem: grafico({
      tipo: TIPO_GRAFICO_DISC.DECLARADO,
      titulo: "Graph II — autoimagem",
      descricao: "Como a pessoa se apresenta no trabalho. É o perfil declarado, o que ela reconhece como próprio.",
      percentuais: autoimagem,
    }),
    liquido: grafico({
      tipo: TIPO_GRAFICO_DISC.LIQUIDO,
      titulo: "Graph III — perfil líquido",
      descricao: "Diferença entre o que a pessoa busca e o que rejeita. É o perfil de trabalho consolidado.",
      percentuais: resultado.percentuaisLiquidos,
    }),
  };

  const mascara = ORDEM_FATORES_DISC.map((fator) => ({
    fator,
    nome: NOME_FATOR_DISC[fator],
    autoimagem: Number(autoimagem?.[fator] ?? 0),
    pressao: Number(pressao?.[fator] ?? 0),
    diferenca: arredondar(Number(autoimagem?.[fator] ?? 0) - Number(pressao?.[fator] ?? 0), 1),
  }));

  const magnitude = arredondar(
    mascara.reduce((soma, item) => soma + Math.abs(item.diferenca), 0) / ORDEM_FATORES_DISC.length,
    1
  );
  const nivel = magnitude >= 30 ? "ALTA" : magnitude >= 15 ? "MODERADA" : "BAIXA";
  const leituras = {
    ALTA:
      "Distância grande entre a autoimagem e o comportamento sob pressão. Duas leituras possíveis, e só a entrevista separa: adaptação forte ao ambiente atual (custo emocional alto) ou resposta orientada ao que a vaga espera.",
    MODERADA:
      "Diferença moderada entre o que a pessoa apresenta e o que admite sob pressão — variação normal entre contexto e disposição do dia.",
    BAIXA: "Pouca diferença entre autoimagem e comportamento sob pressão: a pessoa se descreve de forma consistente nos dois cenários.",
  };

  const projecao = projetarCircumplexo(resultado.liquido ?? {}, { base });
  const diferenciacao = diferenciacaoPerfil(resultado.percentuaisLiquidos ?? {});

  return {
    seriesDisponiveis: series.disponivel,
    motivoSeriesIndisponiveis: series.disponivel ? null : (series.motivo ?? null),
    graficos,
    barras: ORDEM_FATORES_DISC.map((fator) => ({
      fator,
      nome: NOME_FATOR_DISC[fator],
      pressao: Number(pressao?.[fator] ?? 0),
      autoimagem: Number(autoimagem?.[fator] ?? 0),
      liquido: Number(resultado.percentuaisLiquidos?.[fator] ?? 0),
    })),
    mascara: { porFator: mascara, magnitude, nivel, leitura: leituras[nivel] },
    roda: {
      tipo: TIPO_GRAFICO_DISC.RODA,
      titulo: "Roda do circumplexo",
      descricao: "Posição do perfil no círculo de 12 setores. A distância do centro indica a intensidade da preferência.",
      projecao,
      ponto: pontoNaRoda(projecao),
      diferenciacao,
      setores: SEGMENTOS_DISC.map((s) => ({ codigo: s.codigo, rotulo: s.rotulo, angulo: s.angulo })),
    },
  };
}

/**
 * Visão de time: vários perfis na mesma roda. Serve para o gestor ver
 * concentração de estilo antes de montar equipe — um time só de D briga, um
 * time só de S não decide. Não serve para ranquear pessoa.
 */
export function montarOverlayTime(perfis = []) {
  if (!Array.isArray(perfis)) throw new Error("montarOverlayTime exige uma lista de perfis");

  const pontos = [];
  const semPerfil = [];

  perfis.forEach((perfil, indice) => {
    const liquido = perfil?.resultado?.liquido ?? perfil?.liquido ?? {};
    const base = perfil?.resultado?.respondidas ?? perfil?.base ?? 1;
    const projecao = projetarCircumplexo(liquido, { base });
    const id = perfil?.id ?? `perfil-${indice + 1}`;

    if (!projecao.definido) {
      semPerfil.push({ id, nome: perfil?.nome ?? null, motivo: projecao.motivo });
      return;
    }

    pontos.push({
      id,
      nome: perfil?.nome ?? null,
      papel: perfil?.papel ?? null,
      perfil: perfil?.resultado?.perfil ?? perfil?.perfil ?? null,
      angulo: projecao.angulo,
      intensidade: projecao.intensidade,
      segmento: projecao.segmento.rotulo,
      ponto: pontoNaRoda(projecao),
    });
  });

  const contagem = new Map();
  for (const ponto of pontos) contagem.set(ponto.segmento, (contagem.get(ponto.segmento) ?? 0) + 1);

  const distribuicao = [...contagem.entries()]
    .map(([segmento, quantidade]) => ({ segmento, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.segmento.localeCompare(b.segmento));

  const dominantes = distribuicao.filter((d) => d.quantidade >= Math.max(2, Math.ceil(pontos.length * 0.5)));
  const ausentes = SEGMENTOS_DISC.map((s) => s.rotulo).filter((rotulo) => !contagem.has(rotulo));

  return {
    tipo: TIPO_GRAFICO_DISC.OVERLAY_TIME,
    titulo: "Mapa comportamental do time",
    pontos,
    semPerfil,
    distribuicao,
    observacoes: [
      ...(dominantes.length > 0
        ? [`Concentração em ${dominantes.map((d) => d.segmento).join(" e ")}: ${dominantes.map((d) => `${d.quantidade} de ${pontos.length}`).join(", ")}. Estilo concentrado reduz repertório de reação do time.`]
        : []),
      ...(ausentes.length > 0 && pontos.length >= 4
        ? [`Nenhuma pessoa nos segmentos ${ausentes.join(", ")}. Verificar se essa lacuna é real ou efeito do tamanho da amostra.`]
        : []),
      ...(semPerfil.length > 0
        ? [`${semPerfil.length} perfil(is) sem projeção (resposta ausente ou zerada) ficaram fora do mapa.`]
        : []),
      "Mapa de time descreve repertório coletivo. Não é instrumento de avaliação individual nem de desligamento.",
    ],
  };
}

/** Série de barras comparando o perfil medido com o perfil esperado da vaga. */
export function montarGraficoBenchmark(comparacao) {
  if (!comparacao) return null;
  return {
    tipo: TIPO_GRAFICO_DISC.BENCHMARK,
    titulo: "Perfil esperado da vaga × perfil medido",
    descricao:
      "Comparação de apoio. Aderência baixa é pergunta de entrevista, não motivo de recusa: estilo comportamental não prevê desempenho.",
    escala: { minima: 0, maxima: 100, unidade: "%" },
    pontos: comparacao.porFator.map((item) => ({
      fator: item.fator,
      nome: item.nome,
      esperado: item.esperado,
      medido: item.medido,
      aderencia: item.aderencia,
    })),
    score: comparacao.score,
    nivel: comparacao.nivel,
  };
}
