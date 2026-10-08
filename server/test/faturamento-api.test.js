import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { criarAplicacao } from "../src/app.js";
import { criarRepositorioMemoria } from "../src/db/index.js";
import { TENANT_DEMO, semear, semearUsuarios, SENHA_DEMO } from "../src/seed/dados.js";
import { semearFolha } from "../src/seed/folha.js";

let base, fechar;
const tokens = {};
async function chamar(caminho, { metodo = "GET", corpo, quem = "financeiro" } = {}) {
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
  for (const [quem, email, tipo] of [["financeiro", "financeiro@demo.com.br", "INTERNO"], ["dp", "dp@demo.com.br", "INTERNO"], ["tomador", "gestor@eletronica-amazonia.com.br", "TOMADOR"]]) {
    const r = await fetch(`${base}/api/auth/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: TENANT_DEMO, email, senha: SENHA_DEMO, tipo }) }).then((x) => x.json());
    tokens[quem] = r.dados?.token;
  }
});
after(() => fechar());

test("medição: cálculo, envio, aprovação do tomador, RPS e receita no centro de custos", async () => {
  const f = (await chamar("/api/faturamento/2026-08")).json.dados;
  assert.ok(f.medicoes.length >= 4);
  const m = f.medicoes.find((x) => x.tomadorId === "TOM_ELETRONICA_AMAZONIA");
  assert.equal(m.status, "RASCUNHO");
  assert.equal(m.modalidade, "TAXA_SOBRE_CUSTO");
  assert.ok(m.valorBruto > 0);
  assert.equal(m.retencoes.inss, Math.round(m.valorBruto * 0.11));
  const porColab = f.medicoes.find((x) => x.modalidade === "POR_COLABORADOR");
  assert.ok(porColab.itens.every((i) => i.detalhe.dias > 0));
  assert.equal((await chamar("/api/faturamento/2026-08", { quem: "dp" })).status, 403);

  const c = m.contratoId;
  assert.equal((await chamar(`/api/faturamento/2026-08/${c}/faturar`, { metodo: "POST" })).status, 404);
  assert.equal((await chamar(`/api/faturamento/2026-08/${c}/enviar`, { metodo: "POST" })).status, 200);
  assert.equal((await chamar(`/api/faturamento/2026-08/${c}/enviar`, { metodo: "POST" })).status, 409);
  assert.equal((await chamar(`/api/faturamento/2026-08/${c}/faturar`, { metodo: "POST" })).status, 409);

  // Portal: o tomador vê só as suas e aprova.
  const portal = (await chamar("/api/portal/tomador/medicoes", { quem: "tomador" })).json.dados;
  assert.equal(portal.podeAprovar, true);
  assert.ok(portal.itens.every((x) => x.contratoId.includes("ELETRONICA")));
  assert.equal((await chamar(`/api/portal/tomador/medicoes/2026-08/${porColab.contratoId}`, { metodo: "POST", quem: "tomador", corpo: { acao: "APROVAR" } })).status, 404);
  // Contestação: volta para o Financeiro, que reenvia; depois o tomador aprova.
  assert.equal((await chamar(`/api/portal/tomador/medicoes/2026-08/${c}`, { metodo: "POST", quem: "tomador", corpo: { acao: "CONTESTAR", motivo: "curto" } })).status, 400);
  assert.equal((await chamar(`/api/portal/tomador/medicoes/2026-08/${c}`, { metodo: "POST", quem: "tomador", corpo: { acao: "CONTESTAR", motivo: "Faltou descontar a falta do dia 12" } })).json.dados.status, "CONTESTADA");
  const contestada = (await chamar("/api/faturamento/2026-08")).json.dados.medicoes.find((x) => x.contratoId === c);
  assert.equal(contestada.status, "CONTESTADA");
  assert.match(contestada.contestacao.motivo, /dia 12/);
  assert.equal((await chamar(`/api/faturamento/2026-08/${c}/enviar`, { metodo: "POST" })).status, 200);
  assert.equal((await chamar(`/api/portal/tomador/medicoes/2026-08/${c}`, { metodo: "POST", quem: "tomador", corpo: { acao: "APROVAR" } })).json.dados.status, "APROVADA");

  const fat = await chamar(`/api/faturamento/2026-08/${c}/faturar`, { metodo: "POST" });
  assert.equal(fat.status, 200, JSON.stringify(fat.json));
  assert.equal(fat.json.dados.rps.numero, 1);
  assert.match(fat.json.dados.rps.discriminacao, /Lei 6\.019\/1974/);

  const custos = (await chamar("/api/custos/resultado/2026-08")).json.dados;
  const ct = custos.contratos.find((x) => x.contratoId === c);
  assert.equal(ct.receita, m.valorBruto);
  assert.equal(ct.receitaFaturada, true);
});
