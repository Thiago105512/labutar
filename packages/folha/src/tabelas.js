/**
 * Tabelas legais com vigência por competência (AAAA-MM). Toda regra de cálculo lê a tabela
 * da competência — nunca um valor fixo no código —, e competência sem tabela é recusada:
 * calcular com a tabela errada é pior do que não calcular.
 *
 * Valores em centavos; alíquotas em percentual. Cada tabela cita a norma de origem.
 */

export const ARREDONDAMENTO_INSS = Object.freeze({
  /** Cada faixa arredondada ao centavo mais próximo e somada. */
  POR_FAIXA: "POR_FAIXA",
  /** Cada faixa truncada no centavo — reproduz sistemas de folha anteriores (teste de 12/2020). */
  TRUNCA_FAIXA: "TRUNCA_FAIXA",
});

/** FGTS do mês: arredondado ao centavo ou truncado (como o sistema anterior, conferido em 12/2020). */
export const ARREDONDAMENTO_FGTS = Object.freeze({ ARREDONDAR: "ARREDONDAR", TRUNCAR: "TRUNCAR" });

export const TABELAS_LEGAIS = Object.freeze([
  Object.freeze({
    de: "2020-03",
    ate: "2020-12",
    fontes: ["Portaria SEPRT/ME 3.659/2020 (INSS e salário-família)", "Lei 13.149/2015 (IRRF)", "Lei 14.013/2020 (salário mínimo)"],
    salarioMinimo: 104_500,
    inss: {
      faixas: [
        { ate: 104_500, aliquota: 7.5 },
        { ate: 208_960, aliquota: 9 },
        { ate: 313_440, aliquota: 12 },
        { ate: 610_106, aliquota: 14 },
      ],
    },
    irrf: {
      faixas: [
        { ate: 190_398, aliquota: 0, deduzir: 0 },
        { ate: 282_665, aliquota: 7.5, deduzir: 14_280 },
        { ate: 375_105, aliquota: 15, deduzir: 35_480 },
        { ate: 466_468, aliquota: 22.5, deduzir: 63_613 },
        { ate: null, aliquota: 27.5, deduzir: 86_936 },
      ],
      porDependente: 18_959,
      descontoSimplificado: null,
      reducao: null,
      dispensaAte: 1_000,
    },
    salarioFamilia: { remuneracaoAte: 142_556, cota: 4_862 },
    fgts: { aliquota: 8 },
  }),
  Object.freeze({
    de: "2026-01",
    ate: null,
    fontes: [
      "Portaria Interministerial MPS/MF 13/2026 (INSS, teto e salário-família)",
      "Decreto do salário mínimo de 2026 (R$ 1.621,00)",
      "Lei 15.270/2025 (redução do IRRF até R$ 7.350,00)",
      "Tabela progressiva mensal do IRRF vigente desde 05/2025",
    ],
    salarioMinimo: 162_100,
    inss: {
      faixas: [
        { ate: 162_100, aliquota: 7.5 },
        { ate: 290_284, aliquota: 9 },
        { ate: 435_427, aliquota: 12 },
        { ate: 847_555, aliquota: 14 },
      ],
    },
    irrf: {
      faixas: [
        { ate: 242_880, aliquota: 0, deduzir: 0 },
        { ate: 282_665, aliquota: 7.5, deduzir: 18_216 },
        { ate: 375_105, aliquota: 15, deduzir: 39_416 },
        { ate: 466_468, aliquota: 22.5, deduzir: 67_549 },
        { ate: null, aliquota: 27.5, deduzir: 90_873 },
      ],
      porDependente: 18_959,
      descontoSimplificado: 60_720,
      // Lei 15.270/2025: redução sobre os rendimentos tributáveis do mês.
      reducao: { integralAte: 500_000, maxima: 31_289, decrescenteAte: 735_000, constante: 97_862, fator: 0.133145 },
      dispensaAte: 1_000,
    },
    salarioFamilia: { remuneracaoAte: 198_038, cota: 6_754 },
    fgts: { aliquota: 8 },
  }),
]);

export function validarCompetencia(competencia) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(competencia ?? ""));
}

/** Tabela legal vigente na competência; lança erro se nenhuma cobre o mês. */
export function tabelaDaCompetencia(competencia, tabelas = TABELAS_LEGAIS) {
  if (!validarCompetencia(competencia)) throw new Error(`competência inválida: ${competencia} (use AAAA-MM)`);
  const tabela = tabelas.find((t) => t.de <= competencia && (t.ate === null || competencia <= t.ate));
  if (!tabela) {
    throw new Error(`sem tabela legal cadastrada para a competência ${competencia}: cadastre INSS, IRRF e salário mínimo do período antes de calcular`);
  }
  return tabela;
}

export function tetoINSS(tabela) {
  return tabela.inss.faixas.at(-1).ate;
}
