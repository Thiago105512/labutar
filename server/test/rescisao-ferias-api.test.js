import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { criarAplicacao } from "../src/app.js";
import { criarRepositorioMemoria } from "../src/db/index.js";
import { TENANT_DEMO } from "../src/seed/dados.js";
import { semearFolha } from "../src/seed/folha.js";

const SENHA = "Castelo de areia 2026";
let base, fechar, admin;

async function chamar(caminho, { metodo = "GET", corpo } = {}) {
  const h = { Authorization: `Bearer ${admin}` };
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
  admin = (await fetch(`${base}/api/auth/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: TENANT_DEMO, email: "admin@demo.com.br", senha: SENHA }) }).then((r) => r.json())).dados.token;
});
after(() => fechar());

test("motivos de desligamento com os códigos da Tabela 19", async () => {
  const r = await chamar("/api/folha/rescisao/motivos");
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.dados.map((m) => m.codigo), ["01", "02", "03", "04", "05", "06", "07", "10", "33"]);
});

test("simulação de rescisão: próprio sem justa causa com aviso indenizado", async () => {
  // Admissão 04/09/2023, R$ 3.600,00: 3 anos completos em 30/09/2026 → aviso de 39 dias.
  const r = await chamar("/api/folha/rescisao/simular", { metodo: "POST", corpo: { matricula: "10048022", desligamento: "2026-09-30", motivo: "02", avisoIndenizado: true } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const d = r.json.dados;
  assert.equal(d.aviso.dias, 39);
  assert.equal(d.itens.find((i) => i.codigo === "6003.01").valor, 468_000);
  assert.equal(d.esocial.mtvDeslig, "02");
  assert.equal(d.liquido, d.proventos - d.descontos);
  assert.match(d.avisos.join(), /Sem histórico de férias/);
});

test("simulação de rescisão: temporário não recebe a indenização do art. 479", async () => {
  const r = await chamar("/api/folha/rescisao/simular", { metodo: "POST", corpo: { matricula: "20048050", desligamento: "2026-10-15", motivo: "03" } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(!r.json.dados.itens.some((i) => i.codigo === "6104.01"));
  assert.equal((await chamar("/api/folha/rescisao/simular", { metodo: "POST", corpo: { matricula: "20048050", desligamento: "2026-10-15", motivo: "99" } })).status, 400);
  assert.equal((await chamar("/api/folha/rescisao/simular", { metodo: "POST", corpo: { matricula: "0", desligamento: "2026-10-15", motivo: "02" } })).status, 404);
});

test("simulação de férias com abono e restante do período", async () => {
  const r = await chamar("/api/folha/ferias/simular", { metodo: "POST", corpo: { matricula: "10048022", inicio: "2026-11-09", dias: 20, abonoDias: 10 } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const { programacao, recibo } = r.json.dados;
  assert.deepEqual(programacao.erros, []);
  assert.equal(recibo.itens.find((i) => i.codigo === "1016.01").valor, 240_000); // 3.600 / 30 × 20
  assert.equal(recibo.prazoPagamento, "2026-11-07");
  const sexta = await chamar("/api/folha/ferias/simular", { metodo: "POST", corpo: { matricula: "10048022", inicio: "2026-11-13", dias: 30 } });
  assert.match(sexta.json.dados.programacao.erros.join(), /repouso/);
});

test("13º do ano: 1ª parcela e 2ª parcela de todos os ativos", async () => {
  const p1 = await chamar("/api/folha/decimo-terceiro/2026?parcela=1");
  assert.equal(p1.status, 200, JSON.stringify(p1.json));
  assert.equal(p1.json.dados.prazo, "2026-11-30");
  assert.ok(p1.json.dados.itens.length >= 20);
  assert.ok(p1.json.dados.itens.every((i) => i.descontos === 0));
  const p2 = await chamar("/api/folha/decimo-terceiro/2026?parcela=2");
  const wagner = p2.json.dados.itens.find((i) => i.matricula === "10048049");
  assert.equal(wagner.avos, 12);
  assert.ok(wagner.itens.some((i) => i.codigo === "9201.02"));
  // Temporário admitido em 14/09 com contrato até 12/03/2027: 4 avos (set. a dez.).
  assert.equal(p2.json.dados.itens.find((i) => i.matricula === "20048050").avos, 4);
});
