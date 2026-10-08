import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { criarAplicacao } from "../src/app.js";
import { criarRepositorioMemoria } from "../src/db/index.js";
import { TENANT_DEMO, semear, semearUsuarios, SENHA_DEMO } from "../src/seed/dados.js";
import { semearFolha } from "../src/seed/folha.js";

let base, fechar, repo;
const tokens = {};
async function chamar(caminho, { metodo = "GET", corpo, quem = "rh" } = {}) {
  const h = { Authorization: `Bearer ${tokens[quem]}` };
  if (corpo !== undefined) h["Content-Type"] = "application/json";
  const r = await fetch(`${base}${caminho}`, { method: metodo, headers: h, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}

before(async () => {
  repo = criarRepositorioMemoria();
  const app = await criarAplicacao({ repo, config: { permitirIdentidadePorCabecalho: false }, log: () => {} });
  const servidor = createServer(app.handler);
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  fechar = () => new Promise((ok) => servidor.close(ok));
  await semear(repo);
  await semearFolha(repo, TENANT_DEMO);
  await semearUsuarios(app.acesso, { repo });
  for (const [quem, email, tipo] of [["rh", "rh@demo.com.br", "INTERNO"], ["financeiro", "financeiro@demo.com.br", "INTERNO"], ["marcia", "marcia.santos@exemplo.com", "COLABORADOR"]]) {
    const r = await fetch(`${base}/api/auth/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: TENANT_DEMO, email, senha: SENHA_DEMO, tipo }) }).then((x) => x.json());
    tokens[quem] = r.dados?.token;
  }
});
after(() => fechar());

test("EPI: CA vencido bloqueia, entrega vai para a ficha, o custo e o portal; pendência some", async () => {
  const p = (await chamar("/api/sst/painel")).json.dados;
  assert.equal(p.epis.find((e) => e.id === "ITC_LUVA").situacaoCA.valido, false);
  assert.ok(p.postos.some((x) => x.riscos.length && x.episExigidos.includes("ITC_PROTETOR")));
  const comPendencia = p.colaboradores.find((c) => c.pendencias.some((x) => x.itemId === "ITC_PROTETOR"));
  assert.ok(comPendencia, "alguém sem protetor auricular exigido pelo PGR");
  assert.equal((await chamar("/api/sst/painel", { quem: "financeiro" })).status, 403);

  const luva = await chamar("/api/sst/entregas", { metodo: "POST", corpo: { matricula: comPendencia.matricula, itemId: "ITC_LUVA", quantidade: 2 } });
  assert.equal(luva.status, 409);
  assert.match(luva.json.erro, /CA 38211 vencido/);

  const ok = await chamar("/api/sst/entregas", { metodo: "POST", corpo: { matricula: comPendencia.matricula, itemId: "ITC_PROTETOR", quantidade: 4 } });
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  assert.equal(ok.json.dados.ca.numero, "19876");
  const custo = await repo.obter(TENANT_DEMO, "custosLancamentos", ok.json.dados.custoLancamentoId);
  assert.equal(custo.valor, 4 * 350);
  assert.deepEqual(custo.destino, { tipo: "COLABORADOR", matricula: comPendencia.matricula });
  const ficha = (await chamar(`/api/sst/colaboradores/${comPendencia.matricula}`)).json.dados;
  assert.ok(!ficha.pendencias.some((x) => x.itemId === "ITC_PROTETOR"));
  assert.equal(ficha.ppp.epis[0].ca, "19876");
  assert.ok(ficha.ppp.exposicao.length > 0);

  // Renovar o CA libera a luva.
  assert.equal((await chamar("/api/sst/epis/ITC_LUVA", { metodo: "PATCH", corpo: { ca: { numero: "38211", validade: "2028-09-30" } } })).status, 200);
  assert.equal((await chamar("/api/sst/entregas", { metodo: "POST", corpo: { matricula: comPendencia.matricula, itemId: "ITC_LUVA" } })).status, 201);
});

test("portal: o colaborador confirma o recebimento só do próprio EPI", async () => {
  const { itens: [marcia] } = await repo.listar(TENANT_DEMO, "pessoas", { nome: "Márcia Oliveira Santos" }, { limite: 1 });
  const { itens: [v] } = await repo.listar(TENANT_DEMO, "vinculos", { pessoaId: marcia.id }, { limite: 1 });
  const e = (await chamar("/api/sst/entregas", { metodo: "POST", corpo: { matricula: v.matricula, itemId: "ITC_BOTA" } })).json.dados;
  assert.ok((await chamar("/api/portal/colaborador/inicio", { quem: "marcia" })).json.dados.servicos.includes("epis"));
  const lista = (await chamar("/api/portal/colaborador/epis", { quem: "marcia" })).json.dados;
  assert.equal(lista.length, 1);
  assert.equal((await chamar(`/api/portal/colaborador/epis/${e.id}/confirmar`, { metodo: "POST", quem: "marcia" })).status, 200);
  assert.equal((await chamar(`/api/portal/colaborador/epis/${e.id}/confirmar`, { metodo: "POST", quem: "marcia" })).status, 409);
  const outra = (await repo.listar(TENANT_DEMO, "episEntregues", {}, { limite: 100 })).itens.find((x) => x.matricula !== v.matricula);
  assert.equal((await chamar(`/api/portal/colaborador/epis/${outra.id}/confirmar`, { metodo: "POST", quem: "marcia" })).status, 404);
});

test("CAT: validação, prazo no 1º dia útil e retorno com ASO", async () => {
  const { itens: [v] } = await repo.listar(TENANT_DEMO, "vinculos", { tipo: "TEMPORARIO" }, { limite: 1 });
  assert.equal((await chamar("/api/sst/cats", { metodo: "POST", corpo: { matricula: v.matricula, data: "2026-10-09", tipo: "TIPICO", descricao: "curto", parteAtingida: "mão" } })).status, 400);
  const c = await chamar("/api/sst/cats", { metodo: "POST", corpo: { matricula: v.matricula, data: "2026-10-09", hora: "14:20", tipo: "TIPICO", descricao: "Corte na mão ao manusear chapa sem luva", parteAtingida: "mão esquerda", afastamento: true, diasAfastamento: 35 } });
  assert.equal(c.status, 201, JSON.stringify(c.json));
  assert.equal(c.json.dados.prazo, "2026-10-13"); // sexta → segunda 12/10 é feriado nacional → terça
  assert.equal(c.json.dados.retornoComASO, true);
  const ficha = (await chamar(`/api/sst/colaboradores/${v.matricula}`)).json.dados;
  assert.equal(ficha.ppp.cats.length, 1);
});
