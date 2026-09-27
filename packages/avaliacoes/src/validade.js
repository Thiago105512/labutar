import { arredondar } from "../../core/src/dinheiro.js";
import { responderDISC } from "./disc.js";
import { calcularEscalaDISC } from "./escala.js";
import { perfisPorSerie } from "./series.js";
import { LIMITE_VALIDADE_DISC, NIVEL_CONFIABILIDADE, TIPO_PAR_CONSISTENCIA } from "./constantes.js";

function limitar(valor) {
  return Math.max(0, Math.min(100, arredondar(valor, 1)));
}

function porId(lista) {
  return new Map((lista ?? []).map((item) => [item.id, item]));
}

function ladosDasRespostas(checagem) {
  const lados = new Map();
  for (const resposta of checagem.validas) {
    lados.set(resposta.mais, "mais");
    lados.set(resposta.menos, "menos");
  }
  return lados;
}

/**
 * Índice de consistência pelos itens de controle. REPETIDA espera o mesmo lado
 * nas duas ocorrências; OPOSTA espera lados contrários. Só entram no índice os
 * pares com as duas pontas respondidas — par pela metade não diz nada e não
 * pode contar como acerto nem como erro.
 */
function componenteConsistencia(instrumento, checagem) {
  const alternativas = new Map();
  for (const questao of instrumento.questoes) {
    for (const alternativa of questao.alternativas) {
      if (alternativa.par) alternativas.set(alternativa.id, alternativa);
    }
  }

  const pares = new Map();
  for (const alternativa of alternativas.values()) {
    if (!pares.has(alternativa.par)) pares.set(alternativa.par, []);
    pares.get(alternativa.par).push(alternativa);
  }

  const lados = ladosDasRespostas(checagem);
  const contradicoes = [];
  let consistentes = 0;
  let avaliados = 0;

  for (const [par, itens] of pares) {
    if (itens.length !== 2) continue;
    const ladoA = lados.get(itens[0].id);
    const ladoB = lados.get(itens[1].id);
    if (!ladoA || !ladoB) continue;

    avaliados += 1;
    const tipoPar = itens[0].tipoPar ?? TIPO_PAR_CONSISTENCIA.REPETIDA;
    const coerente = tipoPar === TIPO_PAR_CONSISTENCIA.OPOSTA ? ladoA !== ladoB : ladoA === ladoB;
    if (coerente) {
      consistentes += 1;
    } else {
      contradicoes.push({
        par,
        tipoPar,
        itens: itens.map((item) => ({ alternativaId: item.id, texto: item.texto, lado: lados.get(item.id) })),
      });
    }
  }

  if (avaliados === 0) {
    return { score: null, indice: null, paresNoInstrumento: pares.size, paresAvaliados: 0, contradicoes: [] };
  }

  const indice = (consistentes / avaliados) * 100;
  return {
    score: limitar(indice),
    indice: arredondar(indice, 1),
    paresNoInstrumento: pares.size,
    paresAvaliados: avaliados,
    contradicoes,
  };
}

/**
 * Coerência entre a série clara e a série escura — o sinal de autoapresentação.
 *
 * Quem responde com atenção tende a reconhecer, na série de palavras difíceis,
 * o mesmo fator que reivindicou na série de palavras positivas: o lado luminoso
 * e o lado sombra do mesmo estilo andam juntos. Quando a pessoa se apresenta
 * como fortemente dominante e, ao mesmo tempo, não admite nenhum traço agressivo
 * ou autoritário, a distância entre as duas séries cresce — e isso é resposta
 * editada para a vaga, não perfil.
 *
 * Note o que este componente não é: não mede "bom caráter". Mede se as duas
 * metades do questionário contam a mesma história.
 */
function componenteCoerencia(instrumento, checagem, limites) {
  const series = perfisPorSerie(instrumento, checagem);
  if (!series.disponivel) {
    return { score: null, motivo: series.motivo };
  }
  if (series.divergencia === null) {
    return { score: null, motivo: "séries sem resposta suficiente para comparação" };
  }

  const excesso = Math.max(0, series.divergencia - limites.divergenciaSeriesMaxima);
  return {
    score: limitar(100 - excesso * 3),
    divergencia: series.divergencia,
    limite: limites.divergenciaSeriesMaxima,
    porFator: series.divergencias,
  };
}

/**
 * Telemetria de tempo. Quando o front-end não envia tempo por questão, o
 * componente sai `null` e o peso é redistribuído: ausência de dado não pode
 * virar punição, senão todo laudo de importação em lote nasceria "não confiável".
 */
function componenteVelocidade(instrumento, tempoPorQuestao, tempoTotalSegundos, limites) {
  const total = instrumento.questoes.length;

  if (tempoPorQuestao && typeof tempoPorQuestao === "object") {
    const tempos = Object.values(tempoPorQuestao).map(Number).filter((v) => Number.isFinite(v) && v >= 0);
    if (tempos.length === 0) return { score: null, motivo: "tempoPorQuestao vazio" };

    const rapidas = tempos.filter((t) => t < limites.segundosMinimosPorQuestao).length;
    const media = tempos.reduce((a, b) => a + b, 0) / tempos.length;
    return {
      score: limitar(100 - (rapidas / tempos.length) * 100),
      questoesCronometradas: tempos.length,
      questoesRapidas: rapidas,
      mediaSegundosPorQuestao: arredondar(media, 1),
      limiteSegundosPorQuestao: limites.segundosMinimosPorQuestao,
    };
  }

  if (Number.isFinite(tempoTotalSegundos) && tempoTotalSegundos > 0) {
    const minimo = Math.max(limites.tempoTotalMinimoSegundos, total * limites.segundosMinimosPorQuestao * 0.5);
    const score = tempoTotalSegundos >= minimo ? 100 : limitar((tempoTotalSegundos / minimo) * 100);
    return {
      score,
      tempoTotalSegundos: arredondar(tempoTotalSegundos, 1),
      minimoEsperadoSegundos: arredondar(minimo, 1),
      mediaSegundosPorQuestao: arredondar(tempoTotalSegundos / total, 1),
    };
  }

  return { score: null, motivo: "sem telemetria de tempo" };
}

function componenteExtremidade(escala, limites) {
  const indice = escala?.extremidade;
  if (indice === null || indice === undefined) return { score: null, motivo: "sem respostas na escala" };
  return {
    score: limitar(100 - Math.max(0, indice - limites.extremidadeMaxima) * 2),
    indice,
    limite: limites.extremidadeMaxima,
  };
}

/**
 * Viés de posição e resposta em série. Em 24 blocos com a mesma ordem de
 * fatores, marcar sempre a primeira coluna é padrão mecânico, não preferência —
 * e é o tipo de resposta que passa despercebido se ninguém olhar.
 */
function componentePadrao(instrumento, checagem, limites) {
  if (checagem.respondidas === 0) return { score: null, motivo: "sem respostas" };

  const questoes = porId(instrumento.questoes);
  const posicoes = [0, 0, 0, 0];
  const fatores = { D: 0, I: 0, S: 0, C: 0 };

  for (const resposta of checagem.validas) {
    const questao = questoes.get(resposta.questaoId);
    if (!questao) continue;
    const indice = questao.alternativas.findIndex((a) => a.id === resposta.mais);
    if (indice >= 0) posicoes[indice] += 1;
    const escolhida = questao.alternativas.find((a) => a.id === resposta.mais);
    if (escolhida) fatores[escolhida.fator] += 1;
  }

  const respondidas = checagem.respondidas;
  const piorPosicao = Math.max(...posicoes);
  const viesPosicao = (piorPosicao / respondidas) * 100;

  const [fatorRepetido, vezesRepetido] = Object.entries(fatores).sort((a, b) => b[1] - a[1])[0];
  const repeticao = (vezesRepetido / respondidas) * 100;

  const penalizar = (share) => (share >= limites.viesPosicaoMaxima ? limitar(100 - (share - limites.viesPosicaoMaxima) * 3) : 100);

  return {
    score: limitar(Math.min(penalizar(viesPosicao), penalizar(repeticao))),
    viesPosicao: arredondar(viesPosicao, 1),
    piorPosicao: posicoes.indexOf(piorPosicao) + 1,
    distribuicaoPosicoes: posicoes,
    fatorRepetido,
    repeticaoFator: arredondar(repeticao, 1),
    limite: limites.viesPosicaoMaxima,
  };
}

function agregar(componentes, pesos) {
  let somaPesos = 0;
  let somaPonderada = 0;
  for (const [nome, componente] of Object.entries(componentes)) {
    const peso = pesos[nome] ?? 0;
    if (!peso || componente.score === null || componente.score === undefined) continue;
    somaPesos += peso;
    somaPonderada += componente.score * peso;
  }
  if (somaPesos === 0) return null;
  return arredondar(somaPonderada / somaPesos, 1);
}

function nivelDe(indice, completo, cortes) {
  if (!completo || indice === null) return NIVEL_CONFIABILIDADE.INSUFICIENTE;
  if (indice >= cortes.alta) return NIVEL_CONFIABILIDADE.ALTA;
  if (indice >= cortes.media) return NIVEL_CONFIABILIDADE.MEDIA;
  if (indice >= cortes.baixa) return NIVEL_CONFIABILIDADE.BAIXA;
  return NIVEL_CONFIABILIDADE.INSUFICIENTE;
}

/**
 * Validade da resposta antes de qualquer leitura de perfil.
 *
 * Os líderes de mercado (Thomas PPA, Extended DISC, TTI) só entregam o laudo
 * acompanhado de um índice de confiabilidade, e é isso que separa ferramenta
 * séria de horóscopo corporativo: sem esse controle, resposta respondida em
 * 40 segundos vira "perfil" e vai parar na decisão de contratação.
 */
export function avaliarValidadeDISC({
  instrumento,
  respostas = [],
  escalas = [],
  checagem = null,
  escala = null,
  tempoPorQuestao = null,
  tempoTotalSegundos = null,
  limites = LIMITE_VALIDADE_DISC,
} = {}) {
  if (!instrumento || !Array.isArray(instrumento.questoes) || instrumento.questoes.length === 0) {
    throw new Error("avaliarValidadeDISC exige o instrumento: use criarInstrumentoDISC()");
  }

  const checagemEfetiva = checagem ?? responderDISC(instrumento, respostas);
  const escalaEfetiva = escala ?? (Array.isArray(escalas) && escalas.length > 0 ? calcularEscalaDISC(instrumento, escalas) : null);

  const componentes = {
    consistencia: componenteConsistencia(instrumento, checagemEfetiva),
    coerencia: componenteCoerencia(instrumento, checagemEfetiva, limites),
    velocidade: componenteVelocidade(instrumento, tempoPorQuestao, tempoTotalSegundos, limites),
    extremidade: componenteExtremidade(escalaEfetiva, limites),
    padrao: componentePadrao(instrumento, checagemEfetiva, limites),
  };

  const indice = agregar(componentes, limites.pesos);
  const completo = checagemEfetiva.completo && (escalaEfetiva ? escalaEfetiva.completo : true);
  const confiabilidade = nivelDe(indice, completo, limites.cortes);

  const alertas = [];
  if (!checagemEfetiva.completo) {
    alertas.push(`Escolha forçada incompleta: ${checagemEfetiva.pendentes.length} questão(ões) sem resposta.`);
  }
  if (checagemEfetiva.invalidas.length > 0) {
    alertas.push(`${checagemEfetiva.invalidas.length} resposta(s) malformada(s) descartada(s) do cálculo.`);
  }
  if (escalaEfetiva && !escalaEfetiva.completo) {
    alertas.push(`Escala de concordância incompleta: ${escalaEfetiva.pendentes.length} declaração(ões) sem resposta.`);
  }
  if (componentes.consistencia.indice !== null && componentes.consistencia.indice < limites.consistenciaMinima) {
    alertas.push(
      `Consistência de ${componentes.consistencia.indice}% nos itens de controle (mínimo ${limites.consistenciaMinima}%): ` +
        "a pessoa se contradisse entre palavras repetidas ou antônimas. Reaplicar antes de usar o resultado."
    );
  }
  if (componentes.coerencia.divergencia !== undefined && componentes.coerencia.divergencia > limites.divergenciaSeriesMaxima) {
    alertas.push(
      `Distância de ${componentes.coerencia.divergencia} pontos entre o perfil que a pessoa apresenta (série clara) e o que admite sob pressão (série escura), acima do limite de ${limites.divergenciaSeriesMaxima}. Possível resposta editada para a vaga: tratar como hipótese de entrevista, não como conclusão.`
    );
  }
  if (componentes.velocidade.score !== null && componentes.velocidade.score < 100) {
    alertas.push(
      componentes.velocidade.questoesRapidas !== undefined
        ? `${componentes.velocidade.questoesRapidas} questão(ões) respondida(s) em menos de ${limites.segundosMinimosPorQuestao}s.`
        : `Tempo total de ${componentes.velocidade.tempoTotalSegundos}s, abaixo do mínimo esperado de ${componentes.velocidade.minimoEsperadoSegundos}s.`
    );
  }
  if (componentes.extremidade.indice !== null && componentes.extremidade.indice > limites.extremidadeMaxima) {
    alertas.push(
      `${componentes.extremidade.indice}% das declarações marcadas nos extremos da escala (1 ou 5): perfil achatado de propósito ou sem leitura do enunciado.`
    );
  }
  if (componentes.padrao.score !== null && componentes.padrao.score < 100) {
    alertas.push(
      `Padrão mecânico de resposta: ${componentes.padrao.viesPosicao}% das escolhas "mais" na mesma posição (a ${componentes.padrao.priorPosicao}ª).`
    );
  }
  if (indice === null) {
    alertas.push("Nenhum componente de validade pôde ser calculado: confiabilidade não verificada.");
  }

  return {
    indice,
    confiabilidade,
    utilizavel: completo && confiabilidade !== NIVEL_CONFIABILIDADE.INSUFICIENTE,
    completo,
    componentes,
    alertas,
  };
}
