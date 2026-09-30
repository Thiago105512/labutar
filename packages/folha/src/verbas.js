/**
 * Catálogo padrão de verbas (docs/15-padroes.md, seção 7.3): código NNNN.VV = natureza da
 * Tabela 03 do eSocial + variante. O mesmo código vai ao S-1010 (codRubr), ao holerite e à
 * contabilidade. Incidências com os códigos do próprio eSocial (codIncCP e codIncFGTS, do XSD
 * S-1.3); a de IRRF usa a Tabela 21, ainda não obtida — por isso `irrf` é booleano por ora.
 *
 * `naturezaConferida: false` marca natureza que ainda precisa ser conferida no Anexo I dos
 * leiautes antes do primeiro envio ao eSocial.
 */

export const TIPO_VERBA = Object.freeze({ PROVENTO: "PROVENTO", DESCONTO: "DESCONTO", INFORMATIVA: "INFORMATIVA" });

const v = (codigo, nome, tipo, { inss, fgts, irrf, conferida = true }) =>
  Object.freeze({ codigo, natureza: codigo.slice(0, 4), nome, tipo, incidencias: Object.freeze({ inss, fgts, irrf }), naturezaConferida: conferida });

const P = TIPO_VERBA.PROVENTO, D = TIPO_VERBA.DESCONTO;

export const VERBAS = Object.freeze({
  SALARIO: v("1000.01", "Salário", P, { inss: "11", fgts: "11", irrf: true }),
  DSR_VARIAVEIS: v("1002.01", "DSR sobre horas extras e adicional noturno", P, { inss: "11", fgts: "11", irrf: true }),
  HORA_EXTRA_50: v("1003.01", "Horas extras 50%", P, { inss: "11", fgts: "11", irrf: true }),
  HORA_EXTRA_100: v("1003.02", "Horas extras 100%", P, { inss: "11", fgts: "11", irrf: true }),
  INSALUBRIDADE: v("1202.01", "Adicional de insalubridade", P, { inss: "11", fgts: "11", irrf: true }),
  PERICULOSIDADE: v("1203.01", "Adicional de periculosidade", P, { inss: "11", fgts: "11", irrf: true }),
  ADICIONAL_NOTURNO: v("1205.01", "Adicional noturno", P, { inss: "11", fgts: "11", irrf: true }),
  SALARIO_FAMILIA: v("1409.01", "Salário-família", P, { inss: "00", fgts: "00", irrf: false, conferida: false }),
  ADIANTAMENTO: v("9200.01", "Adiantamento salarial", D, { inss: "00", fgts: "00", irrf: false }),
  INSS: v("9201.01", "INSS", D, { inss: "31", fgts: "00", irrf: false }),
  IRRF: v("9203.01", "IRRF", D, { inss: "00", fgts: "00", irrf: false }),
  FALTAS: v("9207.01", "Faltas", D, { inss: "11", fgts: "11", irrf: true }),
  DSR_FALTAS: v("9209.01", "DSR perdido por faltas", D, { inss: "11", fgts: "11", irrf: true, conferida: false }),
  VALE_TRANSPORTE: v("9216.01", "Vale-transporte", D, { inss: "00", fgts: "00", irrf: false }),
  OUTROS_DESCONTOS: v("9299.01", "Outros descontos", D, { inss: "00", fgts: "00", irrf: false, conferida: false }),
});

export const CATALOGO_VERBAS = Object.freeze(Object.values(VERBAS).sort((a, b) => a.codigo.localeCompare(b.codigo)));

/** Valor da verba para as bases: provento soma, desconto com incidência reduz a base. */
export function efeitoNaBase(verba, valor, base) {
  const incide = base === "irrf" ? verba.incidencias.irrf === true : verba.incidencias[base] === "11";
  if (!incide) return 0;
  return verba.tipo === TIPO_VERBA.DESCONTO ? -valor : valor;
}
