import { novoId } from "../../core/src/ids.js";
import { hoje } from "../../core/src/datas.js";
import { arredondar } from "../../core/src/dinheiro.js";
import { NIVEL_ADERENCIA, NOME_FATOR_DISC, ORDEM_FATORES_DISC } from "./constantes.js";

/**
 * Guardrails fixos de qualquer comparação com benchmark. Não são configuráveis
 * por tenant de propósito: perfil comportamental não prevê desempenho, e recusa
 * apoiada só em traço de personalidade é prática discriminatória no Brasil
 * (Lei 9.029/1995) — além de decisão automatizada com direito a revisão e
 * explicação (LGPD, art. 20).
 */
export const GUARDRAILS_BENCHMARK_DISC = Object.freeze({
  decisaoAutomatica: false,
  exigeRevisaoHumana: true,
  bloqueiaReprovacaoAutomatica: true,
  usoPermitido: Object.freeze([
    "Preparar perguntas de entrevista específicas para o ponto divergente",
    "Antecipar como a pessoa tende a se comunicar e a reagir sob pressão",
    "Planejar onboarding, delegação e formato de feedback",
    "Mapear repertório comportamental de um time já contratado",
  ]),
  usoVedado: Object.freeze([
    "Reprovar ou eliminar candidato por perfil comportamental",
    "Ranquear candidato apenas pela aderência ao benchmark",
    "Usar como teste psicológico ou diagnóstico: DISC não é validado no SATEPSI/CFP e seu uso é privativo de psicólogo nessa condição",
    "Justificar promoção, desligamento ou diferença salarial",
    "Divulgar o perfil a terceiros sem base legal e sem informação ao titular",
  ]),
});

function normalizarRequisito(requisito, indice) {
  const contexto = `Requisito ${indice + 1}`;
  if (!requisito || typeof requisito !== "object") {
    throw new Error(`${contexto}: deve ser um objeto com fator e esperado`);
  }
  const fator = String(requisito.fator ?? "").trim().toUpperCase();
  if (!ORDEM_FATORES_DISC.includes(fator)) {
    throw new Error(`${contexto}: fator inválido "${requisito.fator ?? ""}". Use D, I, S ou C`);
  }
  const esperado = Number(requisito.esperado);
  if (!Number.isFinite(esperado) || esperado < 0 || esperado > 100) {
    throw new Error(`${contexto} (${fator}): 'esperado' deve ser um número entre 0 e 100, na mesma escala do perfil líquido`);
  }
  const peso = requisito.peso === undefined || requisito.peso === null ? 1 : Number(requisito.peso);
  if (!Number.isFinite(peso) || peso <= 0) {
    throw new Error(`${contexto} (${fator}): 'peso' deve ser um número maior que zero`);
  }
  return { fator, nome: NOME_FATOR_DISC[fator], esperado: arredondar(esperado, 1), peso, obrigatorio: Boolean(requisito.obrigatorio) };
}

/**
 * Perfil comportamental esperado para uma vaga, definido pelo gestor/requisitante.
 * É a peça que o TTI, o PeopleKeys e o Thomas chamam de job benchmark — e a que
 * mais gera venda, porque transforma "achismo do gestor" em número discutível.
 *
 * A escala é a mesma do perfil líquido (0–100, com 50 = neutro): quem monta o
 * benchmark responde "quanto essa vaga precisa de cada fator", não "quantos
 * pontos".
 */
export function definirBenchmarkDISC({ vagaId = null, titulo = null, requisitos, tolerancia = 15, criadoPor = null } = {}) {
  if (!Array.isArray(requisitos) || requisitos.length === 0) {
    throw new Error("definirBenchmarkDISC exige 'requisitos' com ao menos um fator");
  }
  const tol = Number(tolerancia);
  if (!Number.isFinite(tol) || tol < 0 || tol >= 100) {
    throw new Error(`tolerância inválida: ${tolerancia}. Use um valor entre 0 e 99, na escala 0–100`);
  }

  const normalizados = requisitos.map(normalizarRequisito);
  const duplicados = normalizados.filter((r, i) => normalizados.findIndex((x) => x.fator === r.fator) !== i);
  if (duplicados.length > 0) {
    throw new Error(`fator repetido no benchmark: ${duplicados.map((d) => d.fator).join(", ")}`);
  }

  return {
    id: novoId("BMK"),
    tipo: "BENCHMARK_DISC",
    vagaId: vagaId ? String(vagaId) : null,
    titulo: String(titulo ?? "").trim() || "Perfil comportamental esperado",
    requisitos: normalizados,
    tolerancia: tol,
    criadoPor: criadoPor ? String(criadoPor) : null,
    criadoEm: hoje(),
    guardrails: GUARDRAILS_BENCHMARK_DISC,
  };
}

function aderenciaDe(desvioAbsoluto, tolerancia) {
  if (desvioAbsoluto <= tolerancia) return 100;
  const faixa = 100 - tolerancia;
  return Math.max(0, arredondar(100 - ((desvioAbsoluto - tolerancia) * 100) / faixa, 1));
}

/**
 * Compara o perfil medido com o esperado da vaga. Devolve número, ponto de
 * atenção e a pergunta de entrevista correspondente — nunca uma decisão.
 */
export function compararBenchmark(benchmark, resultado) {
  if (!benchmark || !Array.isArray(benchmark.requisitos)) {
    throw new Error("compararBenchmark exige um benchmark criado por definirBenchmarkDISC()");
  }

  const base = {
    benchmarkId: benchmark.id ?? null,
    vagaId: benchmark.vagaId ?? null,
    titulo: benchmark.titulo ?? null,
    tolerancia: benchmark.tolerancia ?? 15,
    guardrails: GUARDRAILS_BENCHMARK_DISC,
    decisaoAutomatica: false,
    exigeRevisaoHumana: true,
  };

  if (!resultado?.perfil || !resultado.percentuaisLiquidos) {
    return {
      ...base,
      score: null,
      nivel: NIVEL_ADERENCIA.SEM_PERFIL,
      porFator: [],
      pontosAtencao: [],
      motivo: "perfil não disponível: resposta incompleta ou não confiável",
    };
  }

  const porFator = benchmark.requisitos.map((requisito) => {
    const medido = Number(resultado.percentuaisLiquidos[requisito.fator] ?? 50);
    const desvio = arredondar(medido - requisito.esperado, 1);
    const aderencia = aderenciaDe(Math.abs(desvio), base.tolerancia);
    return {
      fator: requisito.fator,
      nome: requisito.nome ?? NOME_FATOR_DISC[requisito.fator],
      esperado: requisito.esperado,
      medido: arredondar(medido, 1),
      desvio,
      direcao: desvio > 0 ? "ACIMA" : desvio < 0 ? "ABAIXO" : "IGUAL",
      peso: requisito.peso ?? 1,
      obrigatorio: Boolean(requisito.obrigatorio),
      aderencia,
    };
  });

  const somaPesos = porFator.reduce((soma, item) => soma + item.peso, 0);
  const score = somaPesos > 0 ? arredondar(porFator.reduce((soma, item) => soma + item.aderencia * item.peso, 0) / somaPesos, 1) : 0;
  const nivel = score >= 80 ? NIVEL_ADERENCIA.ALTA : score >= 60 ? NIVEL_ADERENCIA.MEDIA : NIVEL_ADERENCIA.BAIXA;

  const pontosAtencao = porFator
    .filter((item) => item.aderencia < 60)
    .sort((a, b) => a.aderencia - b.aderencia || Number(b.obrigatorio) - Number(a.obrigatorio));

  return {
    ...base,
    score,
    nivel,
    porFator,
    pontosAtencao,
    motivo: null,
    aviso:
      nivel === NIVEL_ADERENCIA.BAIXA
        ? "Aderência baixa ao perfil esperado da vaga. Isto descreve distância de estilo, não incompetência: verificar antes se o próprio benchmark da vaga está correto."
        : "Comparação de apoio à entrevista. A decisão de contratação considera experiência, competência técnica, entrevista e referências — nunca este número isolado.",
  };
}

/**
 * Comparação em lote para o recrutador ver a fila. A ordem é indicativa e vem
 * marcada como tal: ordenar por aderência e cortar pela ordem é exatamente o uso
 * vedado acima, e o código não facilita esse caminho por omissão.
 */
export function ordenarPorAderencia(comparacoes = []) {
  if (!Array.isArray(comparacoes)) throw new Error("ordenarPorAderencia exige uma lista de comparações");
  const comScore = comparacoes.filter((c) => Number.isFinite(c?.score));
  return {
    ordemIndicativa: true,
    naoUsarComoCorteAutomatico: true,
    itens: comScore
      .map((comparacao, indice) => ({ ...comparacao, posicaoOriginal: indice }))
      .sort((a, b) => b.score - a.score),
    semPerfil: comparacoes.filter((c) => !Number.isFinite(c?.score)),
  };
}
