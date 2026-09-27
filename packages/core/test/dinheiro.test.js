import test from "node:test";
import assert from "node:assert/strict";

import {
  paraCentavos,
  deCentavos,
  somarCentavos,
  percentualDe,
  formatarBRL,
  calcularPorFaixas,
  aliquotaEfetiva,
  arredondar,
} from "../src/dinheiro.js";

const FAIXAS_INSS = [
  { ate: 141_200, aliquota: 7.5 },
  { ate: 266_668, aliquota: 9 },
  { ate: 400_003, aliquota: 12 },
  { ate: 778_602, aliquota: 14 },
];

test("paraCentavos aceita número e texto em formato brasileiro", () => {
  assert.equal(paraCentavos(1234.56), 123_456);
  assert.equal(paraCentavos("1234,56"), 123_456);
  assert.equal(paraCentavos("R$ 1.234,56"), 123_456);
  assert.equal(paraCentavos("0"), 0);
  assert.equal(paraCentavos(null), 0);
  assert.equal(paraCentavos("abc"), 0);
});

test("deCentavos e formatarBRL", () => {
  assert.equal(deCentavos(123_456), 1234.56);
  assert.equal(deCentavos(-50), -0.5);
  assert.match(formatarBRL(123_456), /1\.234,56/);
});

test("somarCentavos e percentualDe operam em inteiros", () => {
  assert.equal(somarCentavos(1050, 2025, 75), 3150);
  assert.equal(percentualDe(100_000, 8), 8000);
  assert.equal(percentualDe(99_999, 8), 8000);
});

test("calcularPorFaixas: contribuição progressiva sobre R$ 5.000,00", () => {
  const resultado = calcularPorFaixas(500_000, FAIXAS_INSS);
  assert.equal(resultado.total, 51_882);
  assert.equal(resultado.detalhe.length, 4);
  assert.deepEqual(resultado.detalhe[0], {
    de: 0,
    ate: 141_200,
    aliquota: 7.5,
    baseIncidencia: 141_200,
    valor: 10_590,
  });
  assert.equal(aliquotaEfetiva(500_000, resultado.total), 10.38);
});

test("calcularPorFaixas: base abaixo da primeira faixa", () => {
  const resultado = calcularPorFaixas(141_200, FAIXAS_INSS);
  assert.equal(resultado.total, 10_590);
  assert.equal(resultado.detalhe.length, 1);
});

test("calcularPorFaixas: respeita o teto da última faixa", () => {
  const resultado = calcularPorFaixas(800_000, FAIXAS_INSS);
  assert.equal(resultado.total, 90_886);
  assert.equal(resultado.detalhe[3].baseIncidencia, 378_599);
});

test("calcularPorFaixas: base zero e faixa sem teto", () => {
  assert.equal(calcularPorFaixas(0, FAIXAS_INSS).total, 0);
  const abertas = [{ ate: 100_000, aliquota: 10 }, { aliquota: 20 }];
  const resultado = calcularPorFaixas(150_000, abertas);
  assert.equal(resultado.total, 20_000);
  assert.equal(resultado.detalhe[1].ate, null);
});

test("arredondar com casas decimais", () => {
  assert.equal(arredondar(10.376, 2), 10.38);
  assert.equal(arredondar(10.5), 11);
  assert.equal(arredondar(-10.5), -10);
});
