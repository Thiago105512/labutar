import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { criarAplicacao } from "../src/app.js";
import { criarRepositorioMemoria } from "../src/db/index.js";
import { TENANT_DEMO } from "../src/seed/dados.js";
import { semearFolha } from "../src/seed/folha.js";

const SENHA = "Castelo de areia 2026";
let base, fechar, token;

async function chamar(caminho, { metodo = "GET", corpo } = {}) {
  const h = { Authorization: `Bearer ${token}` };
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
  await semearFolha(repo, TENANT_DEMO);
  await app.acesso.criarPrimeiroAdministrador(TENANT_DEMO, { nome: "Diretora Geral", email: "admin@demo.com.br", senha: SENHA });
  token = (await fetch(`${base}/api/auth/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: TENANT_DEMO, email: "admin@demo.com.br", senha: SENHA }) }).then((r) => r.json())).dados.token;
});
after(() => fechar());

test("CCT cadastrada e enquadrada para terceirizados e próprios", async () => {
  const r = await chamar("/api/convencoes");
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const [cct] = r.json.dados;
  assert.equal(cct.registroMTE, "AM000038/2026");
  assert.deepEqual(cct.enquadramento.tiposVinculo, ["TERCEIRIZADO", "PROPRIO"]);
  assert.equal(cct.funcoes, 144);
  const d = await chamar(`/api/convencoes/${cct.id}`);
  assert.equal(d.json.dados.pisos.length, 116);
  const s = await chamar(`/api/convencoes/${cct.id}/sugestoes?cargo=${encodeURIComponent("Auxiliar de limpeza")}`);
  assert.match(s.json.dados.map((x) => x.funcao).join(), /Agente de Limpeza/);
});

test("folha aplica a convenção: mensalidade, custos por tomador e conformidade de piso", async () => {
  const f = (await chamar("/api/folha/2026-09")).json.dados;
  const marcia = f.holerites.find((h) => h.colaborador.nome === "Márcia Oliveira Santos");
  assert.equal(marcia.convencao.instrumento.registroMTE, "AM000038/2026");
  assert.equal(marcia.convencao.funcao, "Agente de Limpeza");
  assert.equal(marcia.itens.find((i) => i.codigo === "9231.01").valor, 3400); // 2% de 1.700,00
  // Temporário fora do enquadramento: sem desconto sindical.
  const temp = f.holerites.find((h) => h.colaborador.vinculo === "TEMPORARIO");
  assert.equal(temp.convencao, undefined);
  assert.ok(!temp.itens.some((i) => i.codigo === "9231.01"));
  // Custos da convenção entram no custo do tomador (odontológico, assistência, seguro, qualificação).
  assert.ok(f.resumo.beneficios >= 5_100 * 11);
  assert.ok(f.resumo.porLotacao.some((l) => l.beneficios > 0));
  // Porteiro não está na tabela: aparece para enquadrar.
  assert.ok(f.convencoes.conformidade.some((c) => c.cargo === "Porteiro" && !c.enquadrada));
  assert.deepEqual(f.convencoes.contribuicoesPatronais.map((c) => c.instrumento), ["AM000038/2026"]);
});

test("enquadrar a função do posto tira da lista e recusa função fora da tabela", async () => {
  const f = (await chamar("/api/folha/2026-09")).json.dados;
  const porteiro = f.convencoes.conformidade.find((c) => c.cargo === "Porteiro");
  assert.equal((await chamar(`/api/enquadramento/${porteiro.matricula}`, { metodo: "PATCH", corpo: { funcaoConvencao: "Vigia noturno" } })).status, 400);
  const ok = await chamar(`/api/enquadramento/${porteiro.matricula}`, { metodo: "PATCH", corpo: { funcaoConvencao: "Recepcionista" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(ok.json.dados.onde, "POSTO");
  const depois = (await chamar("/api/folha/2026-09")).json.dados;
  const h = depois.holerites.find((x) => x.colaborador.matricula === porteiro.matricula);
  assert.equal(h.convencao.funcao, "Recepcionista");
  assert.equal(h.convencao.piso, 184779);
  // R$ 1.850,00 ≥ piso de recepcionista (1.847,79): continua conforme.
  assert.ok(!depois.convencoes.conformidade.some((c) => c.matricula === porteiro.matricula));
});
