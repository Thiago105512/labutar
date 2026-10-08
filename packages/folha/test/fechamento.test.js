import { test } from "node:test";
import assert from "node:assert/strict";
import { verificarFechamento, aplicarAcaoFechamento, STATUS_COMPETENCIA } from "../src/index.js";

const h = (matricula, liquido, cpf = "52998224725") => ({ colaborador: { matricula, nome: matricula, cpf }, liquido });

test("verificação: piso e líquido negativo bloqueiam; sem CPF e fora da folha só avisam", () => {
  const v = verificarFechamento({
    holerites: [h("A", 100), h("B", -5), h("C", 10, null)],
    pendencias: [{ matricula: "D", nome: "D", motivo: "sem sindicato" }],
    convencoes: { conformidade: [{ matricula: "E", nome: "E", erros: ["salário abaixo do piso"] }, { matricula: "F", nome: "F", erros: [] }] },
  });
  assert.equal(v.podeFechar, false);
  assert.deepEqual(v.bloqueios.map((b) => b.matricula), ["E", "B"]);
  assert.deepEqual(v.avisos.map((a) => a.matricula), ["C", "D"]);
});

test("fluxo: enviar, fechar, reabrir com motivo; transições inválidas recusadas", () => {
  const ok = { podeFechar: true, bloqueios: [], avisos: [] };
  const e1 = aplicarAcaoFechamento(null, { acao: "ENVIAR_CONFERENCIA", usuario: "dp", em: "t1" });
  assert.equal(e1.estado.status, STATUS_COMPETENCIA.EM_CONFERENCIA);
  assert.match(aplicarAcaoFechamento(null, { acao: "FECHAR", em: "t" }).erro, /aberta/);
  assert.match(aplicarAcaoFechamento(e1.estado, { acao: "FECHAR", em: "t", verificacao: { podeFechar: false, bloqueios: [{ nome: "X", motivo: "piso" }] } }).erro, /1 bloqueio/);
  const e2 = aplicarAcaoFechamento(e1.estado, { acao: "FECHAR", usuario: "rh", em: "t2", verificacao: ok });
  assert.equal(e2.estado.status, STATUS_COMPETENCIA.FECHADA);
  assert.match(aplicarAcaoFechamento(e2.estado, { acao: "REABRIR", motivo: "curto", em: "t" }).erro, /motivo/);
  const e3 = aplicarAcaoFechamento(e2.estado, { acao: "REABRIR", motivo: "Horas extras do dia 30 lançadas depois", usuario: "rh", em: "t3" });
  assert.equal(e3.estado.status, STATUS_COMPETENCIA.ABERTA);
  assert.deepEqual(e3.estado.historico.map((x) => x.acao), ["ENVIAR_CONFERENCIA", "FECHAR", "REABRIR"]);
  assert.equal(aplicarAcaoFechamento(e3.estado, { acao: "X", em: "t" }).ok, false);
});
