import { test } from "node:test";
import assert from "node:assert/strict";
import { ARREDONDAMENTO_INSS, calcularINSS, calcularIRRF, calcularSalarioFamilia, tabelaDaCompetencia } from "../src/index.js";

const t2026 = tabelaDaCompetencia("2026-09");
const t2020 = tabelaDaCompetencia("2020-12");

test("tabela vem da competência; competência sem tabela é recusada", () => {
  assert.equal(t2026.de, "2026-01");
  assert.equal(t2020.de, "2020-03");
  assert.throws(() => tabelaDaCompetencia("2023-05"), /sem tabela legal/);
  assert.throws(() => tabelaDaCompetencia("2026-13"), /competência inválida/);
});

test("INSS 2026 por faixas (Portaria Interministerial MPS/MF 13/2026)", () => {
  assert.equal(calcularINSS(250_000, t2026).valor, 20_069); // 121,58 + 79,11
  assert.equal(calcularINSS(500_000, t2026).valor, 50_152);
  assert.equal(calcularINSS(600_000, t2026).valor, 64_152);
  const teto = calcularINSS(1_500_000, t2026);
  assert.equal(teto.valor, 98_810);
  assert.equal(teto.limitadaAoTeto, true);
});

test("INSS: arredondamento truncado reproduz o sistema anterior (dezembro/2020)", () => {
  assert.equal(calcularINSS(262_868, t2020).valor, 23_708);
  assert.equal(calcularINSS(262_868, t2020, { arredondamento: ARREDONDAMENTO_INSS.TRUNCA_FAIXA }).valor, 23_706);
  assert.equal(calcularINSS(131_961, t2020, { arredondamento: ARREDONDAMENTO_INSS.TRUNCA_FAIXA }).valor, 10_308);
});

test("IRRF 2026: até R$ 5.000 zera pela redução da Lei 15.270/2025", () => {
  const r = calcularIRRF({ rendimentos: 500_000, inss: 50_152 }, t2026);
  assert.equal(r.modo, "DESCONTO_SIMPLIFICADO");
  assert.equal(r.impostoTabela, 31_289);
  assert.equal(r.reducao, 31_289);
  assert.equal(r.valor, 0);
});

test("IRRF 2026: redução decrescente entre R$ 5.000,01 e R$ 7.350,00", () => {
  const r = calcularIRRF({ rendimentos: 600_000, inss: 64_152 }, t2026);
  assert.equal(r.modo, "DEDUCOES_LEGAIS");
  assert.equal(r.impostoTabela, 56_485); // (6.000 − 641,52) × 27,5% − 908,73
  assert.equal(r.reducao, 17_975); // 978,62 − 0,133145 × 6.000
  assert.equal(r.valor, 38_510);
  assert.equal(calcularIRRF({ rendimentos: 735_000, inss: 83_052 }, t2026).reducao, 0);
});

test("IRRF: dependentes deduzem e valor até R$ 10,00 é dispensado", () => {
  const sem = calcularIRRF({ rendimentos: 800_000, inss: 90_000 }, t2026).valor;
  const com = calcularIRRF({ rendimentos: 800_000, inss: 90_000, dependentes: 2 }, t2026).valor;
  assert.equal(sem - com, Math.round(2 * 18_959 * 0.275));
  const pequeno = calcularIRRF({ rendimentos: 195_000, inss: 0 }, t2020); // 7,5% − 142,80 = R$ 3,45
  assert.equal(pequeno.impostoTabela, 345);
  assert.equal(pequeno.dispensado, true);
  assert.equal(pequeno.valor, 0);
});

test("salário-família 2026: R$ 67,54 por filho até R$ 1.980,38", () => {
  assert.equal(calcularSalarioFamilia({ remuneracao: 180_000, filhos: 2 }, t2026).valor, 13_508);
  assert.equal(calcularSalarioFamilia({ remuneracao: 198_039, filhos: 2 }, t2026).valor, 0);
  assert.equal(calcularSalarioFamilia({ remuneracao: 180_000, filhos: 1, diasNoMes: 15 }, t2026).valor, 3_377);
});
