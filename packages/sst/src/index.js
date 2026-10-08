/**
 * Saúde e segurança do trabalho no posto do tomador:
 * - EPI só com Certificado de Aprovação válido na data da entrega (NR-6), registrado na ficha do
 *   colaborador, que confirma o recebimento; troca pela vida útil do item.
 * - Riscos do posto (inventário do PGR, NR-1): agente, tipo, medidas e os EPIs exigidos. O
 *   colaborador alocado sem o EPI exigido (ou com a troca vencida) vira pendência.
 * - CAT: comunicação até o 1º dia útil seguinte ao acidente; em caso de morte, de imediato
 *   (Lei 8.213/1991, art. 22).
 * - PPP: o perfil profissiográfico do colaborador, montado do vínculo, do posto, dos riscos, dos
 *   EPIs, dos exames e das CATs (desde 2023 vem do eSocial, S-2240; aqui é a conferência).
 */
import { somarDias, somarMeses, diferencaDias, formatarDataBR } from "../../core/src/datas.js";

export const TIPO_RISCO = Object.freeze({
  FISICO: "Físico", QUIMICO: "Químico", BIOLOGICO: "Biológico", ERGONOMICO: "Ergonômico", ACIDENTE: "Acidente", PSICOSSOCIAL: "Psicossocial",
});

export const TIPO_CAT = Object.freeze({ TIPICO: "Típico", TRAJETO: "Trajeto", DOENCA: "Doença do trabalho" });

/** CA no formato do Ministério: número (até 6 dígitos) e validade. */
export function validarCA(ca, naData) {
  if (!ca?.numero || !/^\d{1,6}$/.test(String(ca.numero))) return { valido: false, motivo: "EPI sem número de CA" };
  if (!ca.validade) return { valido: false, motivo: "CA sem validade informada" };
  if (ca.validade < naData) return { valido: false, motivo: `CA ${ca.numero} vencido em ${formatarDataBR(ca.validade)}` };
  return { valido: true, motivo: null, venceEmDias: diferencaDias(naData, ca.validade) };
}

/** Próxima troca de um EPI entregue (vida útil em meses no item). */
export function proximaTroca(entrega, vidaUtilMeses) {
  return vidaUtilMeses ? somarMeses(entrega.data, vidaUtilMeses) : null;
}

/**
 * Pendências de EPI de um colaborador no posto em uma data: EPI exigido pelo PGR sem entrega,
 * com troca vencida ou entregue com CA hoje vencido (substituir).
 * @param exigidos [{ itemId, nome, vidaUtilMeses? }], @param entregas [{ itemId, data, ca }]
 */
export function pendenciasDeEPI(exigidos, entregas, data) {
  const saida = [];
  for (const e of exigidos) {
    const ultima = entregas.filter((x) => x.itemId === e.itemId && x.data <= data).sort((a, b) => b.data.localeCompare(a.data))[0];
    if (!ultima) { saida.push({ itemId: e.itemId, nome: e.nome, motivo: "não entregue" }); continue; }
    const troca = proximaTroca(ultima, e.vidaUtilMeses);
    if (troca && troca <= data) saida.push({ itemId: e.itemId, nome: e.nome, motivo: `troca vencida em ${formatarDataBR(troca)}` });
  }
  return saida;
}

/** Prazo da CAT: 1º dia útil após o acidente (sábado, domingo e feriado não contam); morte: no dia. */
export function prazoDaCAT({ data, obito = false }, feriados = new Set()) {
  if (obito) return data;
  let d = somarDias(data, 1);
  while ([0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()) || feriados.has(d)) d = somarDias(d, 1);
  return d;
}

export function validarCAT(c = {}) {
  const erros = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.data ?? "")) erros.push("data do acidente inválida");
  if (c.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.hora)) erros.push("hora no formato HH:MM");
  if (!TIPO_CAT[c.tipo]) erros.push("tipo: típico, trajeto ou doença do trabalho");
  if (String(c.descricao ?? "").trim().length < 10) erros.push("descreva o acidente (pelo menos 10 caracteres)");
  if (String(c.parteAtingida ?? "").trim().length < 3) erros.push("informe a parte do corpo atingida");
  if (c.afastamento && !(Number.isInteger(c.diasAfastamento) && c.diasAfastamento > 0)) erros.push("dias de afastamento");
  return { ok: erros.length === 0, erros };
}

/** Riscos do posto validados (inventário do PGR). */
export function validarRiscos(riscos = []) {
  const erros = [];
  riscos.forEach((r, i) => {
    if (!TIPO_RISCO[r.tipo]) erros.push(`risco ${i + 1}: tipo inválido`);
    if (String(r.agente ?? "").trim().length < 3) erros.push(`risco ${i + 1}: informe o agente (ex.: ruído, poeira, postura)`);
  });
  return { ok: erros.length === 0, erros };
}

/**
 * PPP para conferência.
 * @param dados { empresa, pessoa, vinculo, posto?, tomador?, riscos, entregas, exames, cats }
 */
export function montarPPP({ empresa = {}, pessoa = {}, vinculo = {}, posto = null, tomador = null, riscos = [], entregas = [], exames = [], cats = [] }) {
  return {
    titulo: "Perfil Profissiográfico Previdenciário (conferência)",
    empregador: { razaoSocial: empresa.razaoSocial ?? null, cnpj: empresa.cnpj ?? null },
    colaborador: { nome: pessoa.nome ?? null, cpf: pessoa.cpf ?? null, nascimento: pessoa.nascimento ?? null, matricula: vinculo.matricula ?? null },
    lotacao: [{
      desde: vinculo.admissao, ate: vinculo.desligamento ?? null, cargo: vinculo.cargo ?? posto?.funcao ?? null, cbo: vinculo.cbo ?? posto?.cbo ?? null,
      local: tomador ? `${tomador.razaoSocial} (CNPJ ${tomador.cnpj})` : "Estabelecimento da empregadora",
    }],
    exposicao: riscos.map((r) => ({ tipo: TIPO_RISCO[r.tipo] ?? r.tipo, agente: r.agente, intensidade: r.intensidade ?? null, medidas: r.medidas ?? null })),
    epis: entregas.map((e) => ({ data: e.data, nome: e.nome, ca: e.ca?.numero ?? null, quantidade: e.quantidade })),
    exames: exames.filter((x) => x.status === "REALIZADO").map((x) => ({ data: x.asoEm, tipo: x.tipo, resultado: x.resultado })),
    cats: cats.map((c) => ({ data: c.data, tipo: TIPO_CAT[c.tipo], descricao: c.descricao })),
    observacao: "Desde 01/2023 o PPP é emitido em meio eletrônico a partir do eSocial (S-2240, S-2220 e S-2210). Este documento é a conferência do que o Labutar registra.",
  };
}
