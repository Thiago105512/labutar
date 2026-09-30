import { test } from "node:test";
import assert from "node:assert/strict";
import { capitalSocialMinimo, verificarQuarentenaExEmpregado } from "../src/index.js";

const TOMADORA = "11222333000181";

test("ex-empregado da tomadora fica bloqueado por 18 meses como terceirizado (art. 5-D)", () => {
  const empregos = [{ cnpj: "11222333000262", desligamento: "2026-01-15" }]; // filial da tomadora
  const r = verificarQuarentenaExEmpregado(empregos, { tomadorCnpj: TOMADORA, inicio: "2026-10-01" });
  assert.equal(r.ok, false);
  assert.equal(r.liberadoEm, "2027-07-15");
  assert.match(r.erros[0], /art\. 5-D/);

  const depois = verificarQuarentenaExEmpregado(empregos, { tomadorCnpj: TOMADORA, inicio: "2027-07-15" });
  assert.equal(depois.ok, true);
});

test("emprego anterior em outra empresa não bloqueia", () => {
  const r = verificarQuarentenaExEmpregado([{ cnpj: "44555666000181", desligamento: "2026-09-01" }], {
    tomadorCnpj: TOMADORA,
    inicio: "2026-10-01",
  });
  assert.equal(r.ok, true);
});

test("capital social mínimo segue o modelo praticado e o porte", () => {
  assert.equal(capitalSocialMinimo({ praticaTemporario: true }).exigidoCentavos, 10_000_000);
  assert.equal(capitalSocialMinimo({ praticaTerceirizacao: true, empregados: 10 }).exigidoCentavos, 1_000_000);
  assert.equal(capitalSocialMinimo({ praticaTerceirizacao: true, empregados: 11 }).exigidoCentavos, 2_500_000);
  assert.equal(capitalSocialMinimo({ praticaTerceirizacao: true, empregados: 101 }).exigidoCentavos, 25_000_000);
  const ambos = capitalSocialMinimo({ praticaTemporario: true, praticaTerceirizacao: true, empregados: 30 });
  assert.equal(ambos.exigidoCentavos, 10_000_000);
  assert.equal(ambos.exigencias.length, 2);
});
