/**
 * Tomador → contratos → postos. O posto carrega o que vem do local de trabalho: função e CBO,
 * município (fuso e feriados), escala, adicionais de insalubridade e periculosidade (do laudo)
 * e o salário da tomadora para a função (remuneração equivalente do temporário, Lei 6.019/1974, art. 12).
 */
import { validarCNPJ } from "../../core/src/validacao.js";
import { validarDataISO } from "../../core/src/validacao.js";
import { TIPO_CONTRATO_TOMADOR, HIPOTESE_TEMPORARIO } from "../../mao-de-obra/src/constantes.js";

const dataOk = (d) => validarDataISO(d).valido;
const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));

export function validarTomador(t = {}) {
  const erros = [];
  const v = validarCNPJ(t.cnpj);
  if (!v.valido) erros.push(`CNPJ inválido: ${v.motivo}`);
  if (String(t.razaoSocial ?? "").trim().length < 3) erros.push("razão social obrigatória");
  if (!UFS.has(String(t.uf ?? "").toUpperCase())) erros.push("UF inválida");
  if (String(t.municipio ?? "").trim().length < 2) erros.push("município obrigatório");
  return {
    ok: !erros.length,
    erros,
    tomador: { ...t, cnpj: v.digitos ?? t.cnpj, razaoSocial: String(t.razaoSocial ?? "").trim(), uf: String(t.uf ?? "").toUpperCase(), municipio: String(t.municipio ?? "").trim() },
  };
}

export function validarContratoTomador(c = {}) {
  const erros = [];
  if (!Object.values(TIPO_CONTRATO_TOMADOR).includes(c.tipo)) erros.push("tipo de contrato inválido (trabalho temporário ou prestação de serviços)");
  if (!dataOk(c.inicio)) erros.push("início inválido");
  if (c.fim && !dataOk(c.fim)) erros.push("fim inválido");
  if (c.fim && c.inicio && c.fim < c.inicio) erros.push("fim anterior ao início");
  if (c.tipo === TIPO_CONTRATO_TOMADOR.TRABALHO_TEMPORARIO) {
    if (!Object.values(HIPOTESE_TEMPORARIO).includes(c.hipotese)) erros.push("contrato temporário exige a hipótese legal (art. 2º)");
    if (String(c.justificativa ?? "").trim().length < 15) erros.push("contrato temporário exige o motivo justificador descrito (art. 9º, II)");
  }
  return { ok: !erros.length, erros, contrato: { ...c } };
}

export function validarPosto(p = {}) {
  const erros = [];
  if (String(p.funcao ?? "").trim().length < 3) erros.push("função obrigatória");
  if (p.cbo && !/^\d{6}$/.test(String(p.cbo).replace(/\D/g, ""))) erros.push("CBO deve ter 6 dígitos");
  if (!(Number.isInteger(p.vagas) && p.vagas > 0)) erros.push("número de vagas deve ser inteiro maior que zero");
  if (p.insalubridadeGrau != null && ![0, 10, 20, 40].includes(p.insalubridadeGrau)) erros.push("grau de insalubridade deve ser 10, 20 ou 40");
  if (p.salarioReferencia != null && !(Number.isInteger(p.salarioReferencia) && p.salarioReferencia > 0)) erros.push("salário de referência em centavos, maior que zero");
  if (p.jornadaMensal != null && !(p.jornadaMensal > 0 && p.jornadaMensal <= 220)) erros.push("jornada mensal entre 1 e 220 horas");
  return {
    ok: !erros.length,
    erros,
    posto: { ...p, funcao: String(p.funcao ?? "").trim(), cbo: p.cbo ? String(p.cbo).replace(/\D/g, "") : null, insalubridadeGrau: p.insalubridadeGrau || null, periculosidade: Boolean(p.periculosidade) },
  };
}
