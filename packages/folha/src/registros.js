/**
 * Rescisões e férias gravadas: o cálculo (rescisao.js, ferias.js) vira um registro com status,
 * histórico e prazo de pagamento. A rescisão desliga o vínculo (sai da folha mensal); as férias
 * entram na folha dos meses de gozo (dias fora do salário, base do INSS somada).
 *
 * Rescisão: CALCULADA → APROVADA (gestor) → PAGA; cancelar (gestor, com motivo) antes de pagar.
 * Férias:   PROGRAMADA → APROVADA (gestor) → PAGA; cancelar (gestor, com motivo) antes de pagar.
 */

import { distribuirCentavos } from "../../mao-de-obra/src/rateio.js";

export const STATUS_RESCISAO = Object.freeze({ CALCULADA: "CALCULADA", APROVADA: "APROVADA", PAGA: "PAGA", CANCELADA: "CANCELADA" });
export const NOME_STATUS_RESCISAO = Object.freeze({ CALCULADA: "Calculada", APROVADA: "Aprovada", PAGA: "Paga", CANCELADA: "Cancelada" });

export const STATUS_FERIAS = Object.freeze({ PROGRAMADA: "PROGRAMADA", APROVADA: "APROVADA", PAGA: "PAGA", CANCELADA: "CANCELADA" });
export const NOME_STATUS_FERIAS = Object.freeze({ PROGRAMADA: "Programada", APROVADA: "Aprovada", PAGA: "Paga", CANCELADA: "Cancelada" });

export const ACAO_RESCISAO = Object.freeze({
  APROVAR: Object.freeze({ de: ["CALCULADA"], para: "APROVADA", permissao: "aprovar", nome: "Aprovar" }),
  PAGAR: Object.freeze({ de: ["APROVADA"], para: "PAGA", permissao: "editar", nome: "Registrar pagamento" }),
  CANCELAR: Object.freeze({ de: ["CALCULADA", "APROVADA"], para: "CANCELADA", permissao: "aprovar", nome: "Cancelar", exigeMotivo: true }),
});

export const ACAO_FERIAS = Object.freeze({
  APROVAR: Object.freeze({ de: ["PROGRAMADA"], para: "APROVADA", permissao: "aprovar", nome: "Aprovar" }),
  PAGAR: Object.freeze({ de: ["APROVADA"], para: "PAGA", permissao: "editar", nome: "Registrar pagamento" }),
  CANCELAR: Object.freeze({ de: ["PROGRAMADA", "APROVADA"], para: "CANCELADA", permissao: "aprovar", nome: "Cancelar", exigeMotivo: true }),
});

/**
 * Aplica uma ação a um registro (rescisão ou férias). Não grava: devolve o novo estado ou o erro.
 * @param regras ACAO_RESCISAO | ACAO_FERIAS, nomes NOME_STATUS_*
 */
export function aplicarAcaoRegistro(regras, nomes, atual, { acao, motivo = "", usuario = null, em }) {
  const regra = regras[acao];
  if (!regra) return { ok: false, erro: "ação inválida" };
  if (!regra.de.includes(atual.status)) return { ok: false, erro: `não é possível "${regra.nome.toLowerCase()}": registro ${nomes[atual.status].toLowerCase()}` };
  if (regra.exigeMotivo && String(motivo).trim().length < 10) return { ok: false, erro: "informe o motivo (pelo menos 10 caracteres)" };
  return {
    ok: true,
    estado: {
      status: regra.para,
      historico: [...(atual.historico ?? []), { acao, de: atual.status, para: regra.para, motivo: String(motivo).trim() || null, por: usuario, em }],
    },
  };
}

/**
 * Verbas da rescisão que a provisão mensal já reconheceu como custo (13º e férias até o
 * desligamento). O resto — saldo do mês, aviso indenizado e reflexos, dobra, art. 479 — e o FGTS
 * do mês com a multa são custo novo do contrato no mês do desligamento.
 */
export const VERBAS_PROVISIONADAS = Object.freeze(["6002.01", "6006.01", "6006.02", "6007.01", "6007.02"]);

/** Custo da rescisão para o centro de custos (centavos), com a composição. */
export function custoDaRescisao(resultado) {
  const partes = resultado.itens
    .filter((i) => i.tipo === "PROVENTO" && !VERBAS_PROVISIONADAS.includes(i.codigo) && i.codigo !== "1409.01")
    .map((i) => ({ codigo: i.codigo, nome: i.nome, valor: i.valor }));
  if (resultado.fgts.mes) partes.push({ codigo: null, nome: "FGTS da rescisão", valor: resultado.fgts.mes });
  if (resultado.fgts.multa) partes.push({ codigo: null, nome: `Multa do FGTS (${resultado.fgts.multaPercentual}%)`, valor: resultado.fgts.multa });
  return { total: partes.reduce((s, p) => s + p.valor, 0), partes };
}

const ativo = (f) => f.status !== STATUS_FERIAS.CANCELADA;

/** Dias de gozo + abono já registrados num período aquisitivo (férias não canceladas). */
export function diasUsadosNoPeriodo(registros, matricula, periodoInicio) {
  return registros
    .filter((f) => ativo(f) && f.matricula === matricula && f.periodo.inicio === periodoInicio)
    .reduce((s, f) => s + f.dias + (f.abonoDias ?? 0), 0);
}

/** Algum gozo registrado cruza o intervalo [inicio, fim]? */
export function feriasSobrepostas(registros, matricula, inicio, fim) {
  return registros.find((f) => ativo(f) && f.matricula === matricula && f.inicio <= fim && f.fim >= inicio) ?? null;
}

/**
 * Lançamento `ferias` da folha mensal por matrícula: dias de gozo no mês, parte das férias + 1/3
 * do mês (base do INSS) e o INSS que o recibo reteve dessa parte (proporcional).
 */
export function feriasNaCompetencia(registros, competencia) {
  const saida = {};
  for (const f of registros.filter(ativo)) {
    const meses = f.recibo.porCompetencia;
    const i = meses.findIndex((p) => p.competencia === competencia);
    if (i < 0) continue;
    const inss = f.recibo.itens.find((x) => x.codigo === "9201.01")?.valor ?? 0;
    // Sem perder centavo: a soma das partes do INSS é o INSS do recibo.
    const retido = meses.some((p) => p.valor > 0) ? distribuirCentavos(inss, meses.map((p) => p.valor))[i] : 0;
    const atual = saida[f.matricula] ?? { dias: 0, base: 0, inssRetido: 0 };
    atual.dias += meses[i].dias;
    atual.base += meses[i].valor;
    atual.inssRetido += retido;
    saida[f.matricula] = atual;
  }
  return saida;
}
