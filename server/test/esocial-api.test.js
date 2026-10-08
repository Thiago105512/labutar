import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";

import { criarAplicacao } from "../src/app.js";
import { criarRepositorioMemoria } from "../src/db/index.js";
import { TENANT_DEMO, semear, semearUsuarios, SENHA_DEMO } from "../src/seed/dados.js";
import { semearFolha } from "../src/seed/folha.js";
import { hoje } from "../../packages/core/src/datas.js";

let base, fechar;
const tokens = {};
async function chamar(caminho, { quem = "dp" } = {}) {
  const r = await fetch(`${base}${caminho}`, { headers: { Authorization: `Bearer ${tokens[quem]}` } });
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
  for (const [quem, email] of [["dp", "dp@demo.com.br"], ["financeiro", "financeiro@demo.com.br"]]) {
    const r = await fetch(`${base}/api/auth/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: TENANT_DEMO, email, senha: SENHA_DEMO, tipo: "INTERNO" }) }).then((x) => x.json());
    tokens[quem] = r.dados?.token;
  }
});
after(() => fechar());

test("eSocial da competência fechada: eventos, pendências e conferência das guias", async () => {
  assert.equal((await chamar("/api/esocial/2026-09")).status, 409);
  const r = await chamar("/api/esocial/2026-08");
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const d = r.json.dados;
  const s1200 = d.eventos.filter((e) => e.tipo === "S-1200");
  assert.equal(s1200.length, 22);
  assert.ok(s1200.some((e) => e.situacao === "PENDENTE") && s1200.some((e) => e.situacao === "PRONTO"));
  assert.equal(d.guias.fgtsDigital.vencimento, "2026-09-18"); // 20/09/2026 é domingo
  assert.ok(d.guias.fgtsDigital.mensal > 0);
  assert.equal(d.guias.dctfWeb.total, d.guias.dctfWeb.inssSegurados + d.guias.dctfWeb.patronal + d.guias.dctfWeb.rat + d.guias.dctfWeb.terceiros + d.guias.dctfWeb.irrf);
  assert.match(d.assinatura, /chave de teste/);
  assert.equal(d.integracao.habilitado, false);
});

test("XML do S-1200 assinado e validado pelo XSD; sem CPF não gera", async () => {
  const d = (await chamar("/api/esocial/2026-08")).json.dados;
  const pronto = d.eventos.find((e) => e.tipo === "S-1200" && e.situacao === "PRONTO");
  assert.equal((await chamar(`/api/esocial/2026-08/xml?tipo=S-1200&chave=${pronto.chave}`, { quem: "financeiro" })).status, 403);
  const x = (await chamar(`/api/esocial/2026-08/xml?tipo=S-1200&chave=${pronto.chave}`)).json.dados;
  assert.match(x.conteudo, /^<\?xml version="1.0" encoding="UTF-8"\?><eSocial xmlns="http:\/\/www\.esocial\.gov\.br\/schema\/evt\/evtRemun\/v_S_01_03_00">/);
  assert.match(x.conteudo, /<perApur>2026-08<\/perApur>/);
  assert.equal(x.assinatura.valida, true);
  assert.equal(x.assinatura.teste, true);
  if (spawnSync("xmllint", ["--version"]).status === 0) assert.equal(x.xsd.validado, true, JSON.stringify(x.xsd.erros));
  // Antes do primeiro pacote guardado (23/11/2026), valida pelo mais próximo e avisa.
  if (hoje() < "2026-11-23") assert.match(x.xsd.aviso, /não está guardado/); else assert.equal(x.xsd.aviso, null);
  const pendente = d.eventos.find((e) => e.situacao === "PENDENTE");
  assert.equal((await chamar(`/api/esocial/2026-08/xml?tipo=S-1200&chave=${pendente.chave}`)).status, 409);
});
