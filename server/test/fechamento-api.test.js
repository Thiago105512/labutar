import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { criarAplicacao } from "../src/app.js";
import { criarRepositorioMemoria } from "../src/db/index.js";
import { TENANT_DEMO, semear, semearUsuarios, SENHA_DEMO } from "../src/seed/dados.js";
import { semearFolha } from "../src/seed/folha.js";

let base, fechar;
const tokens = {};

async function chamar(caminho, { metodo = "GET", corpo, quem = "rh" } = {}) {
  const h = { Authorization: `Bearer ${tokens[quem]}` };
  if (corpo !== undefined) h["Content-Type"] = "application/json";
  const r = await fetch(`${base}${caminho}`, { method: metodo, headers: h, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}

before(async () => {
  const repo = criarRepositorioMemoria();
  const app = await criarAplicacao({ repo, config: { permitirIdentidadePorCabecalho: false }, log: () => {} });
  const servidor = createServer(app.handler);
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  fechar = () => new Promise((ok) => servidor.close(ok));
  await semear(repo);
  await semearFolha(repo, TENANT_DEMO);
  await semearUsuarios(app.acesso, { repo });
  for (const [quem, email, tipo] of [["rh", "rh@demo.com.br", "INTERNO"], ["dp", "dp@demo.com.br", "INTERNO"], ["marcia", "marcia.santos@exemplo.com", "COLABORADOR"]]) {
    const r = await fetch(`${base}/api/auth/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: TENANT_DEMO, email, senha: SENHA_DEMO, tipo }) }).then((x) => x.json());
    tokens[quem] = r.dados?.token;
  }
});
after(() => fechar());

test("agosto vem fechado no demo, com fotografia e hash", async () => {
  const f = await chamar("/api/folha/2026-08");
  assert.equal(f.status, 200, JSON.stringify(f.json));
  assert.equal(f.json.dados.fechamento.status, "FECHADA");
  assert.match(f.json.dados.fechamento.hash, /^[0-9a-f]{64}$/);
  assert.ok(f.json.dados.holerites.length > 0);
  assert.equal((await chamar("/api/folha/2026-08/lancamentos/30048028", { metodo: "PUT", quem: "dp", corpo: { horasExtras50: 2 } })).status, 409);
});

test("DP envia para conferência; só o gestor fecha; fechada trava lançamentos; reabrir com motivo", async () => {
  assert.equal((await chamar("/api/folha/2026-09/fechamento", { metodo: "POST", quem: "dp", corpo: { acao: "FECHAR" } })).status, 403);
  const v = await chamar("/api/folha/2026-09/fechamento", { quem: "dp" });
  assert.equal(v.json.dados.status, "ABERTA");
  assert.equal(v.json.dados.verificacao.podeFechar, true, JSON.stringify(v.json.dados.verificacao.bloqueios));
  assert.equal((await chamar("/api/folha/2026-09/fechamento", { metodo: "POST", quem: "dp", corpo: { acao: "ENVIAR_CONFERENCIA" } })).status, 200);
  assert.equal((await chamar("/api/folha/2026-09/lancamentos/30048028", { metodo: "PUT", quem: "dp", corpo: { horasExtras50: 2 } })).status, 409);
  const f = await chamar("/api/folha/2026-09/fechamento", { metodo: "POST", corpo: { acao: "FECHAR" } });
  assert.equal(f.status, 200, JSON.stringify(f.json));
  assert.equal(f.json.dados.status, "FECHADA");
  const folha = (await chamar("/api/folha/2026-09")).json.dados;
  assert.equal(folha.fechamento.hash, f.json.dados.hash);
  assert.equal((await chamar("/api/folha/2026-09/fechamento", { metodo: "POST", corpo: { acao: "REABRIR", motivo: "curto" } })).status, 409);
  const r = await chamar("/api/folha/2026-09/fechamento", { metodo: "POST", corpo: { acao: "REABRIR", motivo: "Horas extras do dia 30 chegaram depois" } });
  assert.equal(r.json.dados.status, "ABERTA");
  assert.deepEqual(r.json.dados.historico.map((x) => x.acao), ["ENVIAR_CONFERENCIA", "FECHAR", "REABRIR"]);
  assert.equal((await chamar("/api/folha/2026-09/lancamentos/30048028", { metodo: "PUT", quem: "dp", corpo: { horasExtras50: 2 } })).status, 200);
});

test("portal: a colaboradora vê só os próprios holerites fechados", async () => {
  const lista = await chamar("/api/portal/colaborador/holerites", { quem: "marcia" });
  assert.equal(lista.status, 200, JSON.stringify(lista.json));
  assert.deepEqual(lista.json.dados.map((x) => x.competencia), ["2026-08"]);
  const { matricula } = lista.json.dados[0];
  const h = await chamar(`/api/portal/colaborador/holerites/2026-08/${matricula}`, { quem: "marcia" });
  assert.equal(h.status, 200);
  assert.equal(h.json.dados.colaborador.nome, "Márcia Oliveira Santos");
  assert.ok(h.json.dados.itens.some((i) => i.codigo === "1000.01"));
  assert.equal((await chamar("/api/portal/colaborador/holerites/2026-08/10048049", { quem: "marcia" })).status, 404, "holerite de outra pessoa");
  const inicio = await chamar("/api/portal/colaborador/inicio", { quem: "marcia" });
  assert.deepEqual(inicio.json.dados.servicos, ["holerites"]);
});
