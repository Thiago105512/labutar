import test from "node:test";
import assert from "node:assert/strict";
import { validarCA, pendenciasDeEPI, prazoDaCAT, validarCAT, validarRiscos, montarPPP } from "../src/index.js";

test("CA: número, validade e vencimento na data da entrega", () => {
  assert.equal(validarCA({ numero: "12345", validade: "2027-01-01" }, "2026-10-08").valido, true);
  assert.match(validarCA({ numero: "12345", validade: "2026-09-30" }, "2026-10-08").motivo, /vencido em 30\/09\/2026/);
  assert.equal(validarCA({ numero: "ABC" }, "2026-10-08").valido, false);
  assert.equal(validarCA(null, "2026-10-08").valido, false);
});

test("pendências de EPI: não entregue e troca vencida", () => {
  const exigidos = [{ itemId: "BOTA", nome: "Bota", vidaUtilMeses: 6 }, { itemId: "PLUG", nome: "Protetor", vidaUtilMeses: 1 }, { itemId: "LUVA", nome: "Luva" }];
  const entregas = [{ itemId: "BOTA", data: "2026-07-01" }, { itemId: "PLUG", data: "2026-08-01" }];
  assert.deepEqual(pendenciasDeEPI(exigidos, entregas, "2026-10-08").map((p) => [p.itemId, p.motivo.split(" ")[0]]), [["PLUG", "troca"], ["LUVA", "não"]]);
});

test("CAT: prazo no 1º dia útil seguinte; óbito no dia; validação", () => {
  assert.equal(prazoDaCAT({ data: "2026-10-09" }), "2026-10-12"); // sexta → segunda
  assert.equal(prazoDaCAT({ data: "2026-10-09" }, new Set(["2026-10-12"])), "2026-10-13");
  assert.equal(prazoDaCAT({ data: "2026-10-09", obito: true }), "2026-10-09");
  assert.equal(validarCAT({ data: "2026-10-09", tipo: "TIPICO", descricao: "curto", parteAtingida: "mão" }).ok, false);
  assert.equal(validarCAT({ data: "2026-10-09", hora: "10:30", tipo: "TIPICO", descricao: "Corte na mão ao manusear chapa", parteAtingida: "mão esquerda" }).ok, true);
  assert.equal(validarRiscos([{ tipo: "FISICO", agente: "Ruído" }, { tipo: "X", agente: "" }]).erros.length, 2);
});

test("PPP reúne vínculo, riscos, EPIs com CA, ASO e CAT", () => {
  const p = montarPPP({ pessoa: { nome: "Pessoa Fictícia" }, vinculo: { matricula: "1", admissao: "2026-01-01", cargo: "Montadora" }, tomador: { razaoSocial: "T", cnpj: "1" },
    riscos: [{ tipo: "FISICO", agente: "Ruído", intensidade: "88 dB(A)" }], entregas: [{ data: "2026-01-02", nome: "Protetor", ca: { numero: "5745" }, quantidade: 2 }],
    exames: [{ status: "REALIZADO", asoEm: "2025-12-28", tipo: "ADMISSIONAL", resultado: "APTO" }, { status: "AGENDADO" }], cats: [{ data: "2026-03-01", tipo: "TIPICO", descricao: "x" }] });
  assert.equal(p.exposicao[0].tipo, "Físico");
  assert.equal(p.epis[0].ca, "5745");
  assert.equal(p.exames.length, 1);
  assert.equal(p.cats[0].tipo, "Típico");
});
