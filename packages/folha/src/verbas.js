/**
 * Catálogo padrão de verbas (docs/15-padroes.md, seção 7.3): código NNNN.VV = natureza da
 * Tabela 03 do eSocial + variante. O mesmo código vai ao S-1010 (codRubr), ao holerite e à
 * contabilidade. Incidências com os códigos do próprio eSocial (codIncCP e codIncFGTS, do XSD
 * S-1.3); a de IRRF usa a Tabela 21, ainda não obtida — por isso `irrf` diz só a forma de
 * tributação: true (mensal, somada ao mês), "13" (13º, exclusiva na fonte), "FERIAS" (em
 * separado no pagamento das férias) ou false (não tributável ou isenta).
 *
 * Bases do INSS: codIncCP 11 = mensal, 12 = 13º. FGTS: codIncFGTS 11 = mensal, 12 = 13º,
 * 21 = aviso prévio indenizado (entra no depósito, não no INSS).
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
  // Férias (CLT arts. 129 a 145). Gozadas: INSS e FGTS no mês, IRRF em separado no pagamento.
  // Abono pecuniário (art. 143) e seu 1/3: isentos (art. 144 e Lei 8.212, art. 28, § 9º, e, 6).
  FERIAS: v("1016.01", "Férias", P, { inss: "11", fgts: "11", irrf: "FERIAS" }),
  FERIAS_TERCO: v("1017.01", "1/3 de férias", P, { inss: "11", fgts: "11", irrf: "FERIAS" }),
  FERIAS_ABONO: v("1020.01", "Abono pecuniário de férias", P, { inss: "00", fgts: "00", irrf: false, conferida: false }),
  FERIAS_ABONO_TERCO: v("1020.02", "1/3 do abono pecuniário", P, { inss: "00", fgts: "00", irrf: false, conferida: false }),
  FERIAS_DOBRO: v("1024.01", "Dobra de férias (art. 137)", P, { inss: "11", fgts: "11", irrf: "FERIAS", conferida: false }),
  SALARIO_FAMILIA: v("1409.01", "Salário-família", P, { inss: "00", fgts: "00", irrf: false, conferida: false }),
  // 13º salário (Leis 4.090/1962 e 4.749/1965): INSS e IRRF só no valor integral, em separado do mês.
  DECIMO_TERCEIRO_ADIANTAMENTO: v("5504.01", "13º salário – 1ª parcela", P, { inss: "00", fgts: "12", irrf: false }),
  DECIMO_TERCEIRO: v("5001.01", "13º salário", P, { inss: "12", fgts: "12", irrf: "13" }),
  // Rescisão. Férias indenizadas: sem INSS, FGTS e IRRF (Súmula 386 do STJ). Aviso prévio
  // indenizado: sem INSS (STJ, Tema 478) e sem IRRF (indenização), com FGTS (Súmula 305 do TST).
  SALDO_SALARIO: v("6000.01", "Saldo de salário", P, { inss: "11", fgts: "11", irrf: true }),
  DECIMO_TERCEIRO_AVISO: v("6001.01", "13º sobre o aviso prévio indenizado", P, { inss: "12", fgts: "12", irrf: "13" }),
  DECIMO_TERCEIRO_RESCISAO: v("6002.01", "13º salário proporcional", P, { inss: "12", fgts: "12", irrf: "13" }),
  AVISO_INDENIZADO: v("6003.01", "Aviso prévio indenizado", P, { inss: "00", fgts: "21", irrf: false }),
  FERIAS_DOBRO_RESCISAO: v("6004.01", "Férias em dobro na rescisão", P, { inss: "00", fgts: "00", irrf: false, conferida: false }),
  FERIAS_PROPORCIONAIS: v("6006.01", "Férias proporcionais", P, { inss: "00", fgts: "00", irrf: false }),
  FERIAS_PROPORCIONAIS_TERCO: v("6006.02", "1/3 de férias proporcionais", P, { inss: "00", fgts: "00", irrf: false }),
  FERIAS_VENCIDAS: v("6007.01", "Férias vencidas", P, { inss: "00", fgts: "00", irrf: false }),
  FERIAS_VENCIDAS_TERCO: v("6007.02", "1/3 de férias vencidas", P, { inss: "00", fgts: "00", irrf: false }),
  FERIAS_AVISO: v("6006.03", "Férias sobre o aviso prévio indenizado", P, { inss: "00", fgts: "00", irrf: false }),
  FERIAS_AVISO_TERCO: v("6006.04", "1/3 de férias sobre o aviso prévio indenizado", P, { inss: "00", fgts: "00", irrf: false }),
  INDENIZACAO_ART_479: v("6104.01", "Indenização do art. 479 da CLT", P, { inss: "00", fgts: "00", irrf: false, conferida: false }),
  ADIANTAMENTO: v("9200.01", "Adiantamento salarial", D, { inss: "00", fgts: "00", irrf: false }),
  INSS: v("9201.01", "INSS", D, { inss: "31", fgts: "00", irrf: false }),
  INSS_13: v("9201.02", "INSS sobre o 13º", D, { inss: "32", fgts: "00", irrf: false }),
  IRRF: v("9203.01", "IRRF", D, { inss: "00", fgts: "00", irrf: false }),
  IRRF_13: v("9203.02", "IRRF sobre o 13º", D, { inss: "00", fgts: "00", irrf: false }),
  IRRF_FERIAS: v("9203.03", "IRRF sobre férias", D, { inss: "00", fgts: "00", irrf: false }),
  FALTAS: v("9207.01", "Faltas", D, { inss: "11", fgts: "11", irrf: true }),
  DSR_FALTAS: v("9209.01", "DSR perdido por faltas", D, { inss: "11", fgts: "11", irrf: true, conferida: false }),
  DECIMO_TERCEIRO_DESCONTO_ADIANTAMENTO: v("9214.01", "13º salário – 1ª parcela já paga", D, { inss: "00", fgts: "00", irrf: false, conferida: false }),
  AVISO_NAO_CUMPRIDO: v("9213.01", "Aviso prévio não cumprido (art. 487, § 2º)", D, { inss: "00", fgts: "00", irrf: false, conferida: false }),
  FERIAS_ADIANTAMENTO: v("9299.02", "Férias pagas no recibo de férias", D, { inss: "00", fgts: "00", irrf: false, conferida: false }),
  VALE_TRANSPORTE: v("9216.01", "Vale-transporte", D, { inss: "00", fgts: "00", irrf: false }),
  // Convenção coletiva: descontos com direito de oposição (contribuições) ou limitados pela norma (VR).
  DESCONTO_VALE_REFEICAO: v("9220.01", "Vale-refeição", D, { inss: "00", fgts: "00", irrf: false, conferida: false }),
  MENSALIDADE_SINDICAL: v("9231.01", "Mensalidade associativa sindical", D, { inss: "00", fgts: "00", irrf: false, conferida: false }),
  CONTRIBUICAO_ASSISTENCIAL: v("9232.01", "Contribuição assistencial sindical", D, { inss: "00", fgts: "00", irrf: false, conferida: false }),
  // Crédito do Trabalhador (eConsignado): natureza 9253, codIncFGTS 31, sem INSS; IRRF código 09 (Tabela 21).
  // O valor de cada mês vem do arquivo de empréstimos do Portal Emprega Brasil.
  ECONSIGNADO: v("9253.01", "Crédito do Trabalhador (eConsignado)", D, { inss: "00", fgts: "31", irrf: false }),
  OUTROS_DESCONTOS: v("9299.01", "Outros descontos", D, { inss: "00", fgts: "00", irrf: false, conferida: false }),
});

export const CATALOGO_VERBAS = Object.freeze(Object.values(VERBAS).sort((a, b) => a.codigo.localeCompare(b.codigo)));

const INCIDE = {
  inss: (i) => i.inss === "11",
  inss13: (i) => i.inss === "12",
  fgts: (i) => ["11", "12", "21"].includes(i.fgts),
  irrf: (i) => i.irrf === true,
  irrf13: (i) => i.irrf === "13",
  irrfFerias: (i) => i.irrf === "FERIAS",
};

/**
 * Valor da verba para as bases: provento soma, desconto com incidência reduz a base.
 * Bases: inss (mensal), inss13, fgts (depósito do mês), irrf (mensal), irrf13, irrfFerias.
 */
export function efeitoNaBase(verba, valor, base) {
  const incide = INCIDE[base](verba.incidencias);
  if (!incide) return 0;
  return verba.tipo === TIPO_VERBA.DESCONTO ? -valor : valor;
}
