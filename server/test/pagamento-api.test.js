import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { criarAplicacao } from "../src/app.js";
import { criarRepositorioMemoria } from "../src/db/index.js";
import { TENANT_DEMO, semear, semearUsuarios, SENHA_DEMO } from "../src/seed/dados.js";
import { semearFolha } from "../src/seed/folha.js";
import { quintoDiaUtil } from "../src/rotas-pagamento.js";

let base, fechar, repo;
const tokens = {};

async function chamar(caminho, { metodo = "GET", corpo, quem = "financeiro" } = {}) {
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
  for (const quem of ["financeiro", "dp", "rh"]) {
    const r = await fetch(`${base}/api/auth/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: TENANT_DEMO, email: `${quem}@demo.com.br`, senha: SENHA_DEMO, tipo: "INTERNO" }) }).then((x) => x.json());
    tokens[quem] = r.dados?.token;
  }
});
after(() => fechar());

test("5º dia útil: sábado conta, domingo e feriado não", () => {
  assert.equal(quintoDiaUtil("2026-08"), "2026-09-05"); // ter a sáb
  assert.equal(quintoDiaUtil("2026-12"), "2027-01-07"); // 1º/01 feriado; 03/01 domingo
  // Em Manaus, 05/09 é feriado estadual (Elevação do Amazonas à categoria de província).
  assert.equal(quintoDiaUtil("2026-08", { uf: "AM", municipio: "Manaus" }), "2026-09-08");
});

test("folha fechada: prévia, remessa CNAB 240, sem duplicar, e retorno do banco", async () => {
  assert.equal((await chamar("/api/pagamentos/previa?origem=FOLHA&competencia=2026-09")).status, 409);
  assert.equal((await chamar("/api/pagamentos/previa?origem=FOLHA&competencia=2026-08", { quem: "dp" })).status, 403);

  const p = (await chamar("/api/pagamentos/previa?origem=FOLHA&competencia=2026-08")).json.dados;
  assert.equal(p.data, "2026-09-08");
  assert.deepEqual(p.competenciasFechadas, ["2026-08"]);
  assert.ok(p.pagamentos.length > 0 && p.pendencias.length > 0);
  assert.ok(p.pendencias.every((x) => /CPF|conta/.test(x.motivo)));
  assert.deepEqual(p.totais.map((t) => t.forma).sort(), ["CREDITO_CONTA", "PIX", "TED"]);
  const fechada = (await chamar("/api/folha/2026-08", { quem: "rh" })).json.dados;
  assert.equal(p.pagamentos.length + p.pendencias.length, fechada.holerites.filter((h) => h.liquido > 0).length);

  const r = await chamar("/api/pagamentos/remessas", { metodo: "POST", corpo: { origem: "FOLHA", competencia: "2026-08" } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const rem = r.json.dados;
  assert.equal(rem.nsa, 1);
  assert.equal(rem.total, p.pagamentos.reduce((s, x) => s + x.valor, 0));
  assert.match(rem.nomeArquivo, /^CNAB240_001_\d{8}_000001\.REM$/);
  assert.ok(rem.conteudo.split("\r\n").filter(Boolean).every((l) => l.length === 240));
  assert.equal((await chamar("/api/pagamentos/remessas", { metodo: "POST", corpo: { origem: "FOLHA", competencia: "2026-08" } })).status, 409);

  const teste = (await chamar(`/api/pagamentos/remessas/${rem.id}/retorno-teste`)).json.dados;
  assert.match(teste.nomeArquivo, /\.RET$/);
  const ret = await chamar(`/api/pagamentos/remessas/${rem.id}/retorno`, { metodo: "POST", corpo: { conteudo: teste.conteudo } });
  assert.equal(ret.status, 200, JSON.stringify(ret.json));
  assert.equal(ret.json.dados.status, "PAGA");
  assert.equal(ret.json.dados.pagos, rem.quantidade);
  assert.equal((await chamar(`/api/pagamentos/remessas/${rem.id}/retorno`, { metodo: "POST", corpo: { conteudo: "lixo" } })).status, 400);
});

test("rescisão aprovada entra na remessa na data do prazo e fica paga com o retorno", async () => {
  const folha = (await chamar("/api/pagamentos/previa?origem=FOLHA&competencia=2026-08")).json.dados;
  const alvo = folha.pagamentos.find((x) => x.forma === "TED");
  const res = await chamar("/api/folha/rescisao/registros", { metodo: "POST", quem: "dp", corpo: { matricula: alvo.matricula, desligamento: "2026-10-20", motivo: "07" } });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  // Calculada ainda não entra; aprovada, sim.
  assert.equal((await chamar("/api/pagamentos/previa?origem=REGISTROS")).json.dados.pagamentos.length, 0);
  await chamar(`/api/folha/rescisao/registros/${res.json.dados.id}/acao`, { metodo: "POST", quem: "rh", corpo: { acao: "APROVAR" } });
  const p = (await chamar("/api/pagamentos/previa?origem=REGISTROS")).json.dados;
  assert.equal(p.pagamentos.length, 1);
  assert.equal(p.pagamentos[0].data, "2026-10-30");
  assert.equal(p.pagamentos[0].valor, res.json.dados.resultado.liquido);

  const rem = (await chamar("/api/pagamentos/remessas", { metodo: "POST", corpo: { origem: "REGISTROS" } })).json.dados;
  assert.equal(rem.nsa, 2);
  assert.equal((await chamar("/api/pagamentos/previa?origem=REGISTROS")).json.dados.pagamentos.length, 0);
  const teste = (await chamar(`/api/pagamentos/remessas/${rem.id}/retorno-teste`)).json.dados;
  await chamar(`/api/pagamentos/remessas/${rem.id}/retorno`, { metodo: "POST", corpo: { conteudo: teste.conteudo } });
  const reg = await repo.obter(TENANT_DEMO, "rescisoes", res.json.dados.id);
  assert.equal(reg.status, "PAGA");
  assert.equal(reg.pagoEm, "2026-10-30");
  assert.equal(reg.foraDoPrazo, false);
  assert.equal((await chamar("/api/pagamentos/remessas")).json.dados.length, 2);
});
