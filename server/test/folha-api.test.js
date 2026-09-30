import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { criarAplicacao } from "../src/app.js";
import { criarRepositorioMemoria } from "../src/db/index.js";
import { TENANT_DEMO } from "../src/seed/dados.js";
import { semearFolha, folhaDemo } from "../src/seed/folha.js";

const SENHA = "Castelo de areia 2026";
let base, fechar, admin, financeiro, recrutadora;

async function chamar(caminho, { metodo = "GET", token, corpo } = {}) {
  const h = {};
  if (token) h.Authorization = `Bearer ${token}`;
  if (corpo !== undefined) h["Content-Type"] = "application/json";
  const r = await fetch(`${base}${caminho}`, { method: metodo, headers: h, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const entrar = async (email) => (await chamar("/api/auth/entrar", { metodo: "POST", corpo: { empresa: TENANT_DEMO, email, senha: SENHA } })).json.dados.token;

before(async () => {
  const repo = criarRepositorioMemoria();
  const app = await criarAplicacao({ repo, config: { permitirIdentidadePorCabecalho: false }, log: () => {} });
  const servidor = createServer(app.handler);
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  fechar = () => new Promise((ok) => servidor.close(ok));
  await semearFolha(repo, TENANT_DEMO);
  await app.acesso.criarPrimeiroAdministrador(TENANT_DEMO, { nome: "Diretora Geral", email: "admin@demo.com.br", senha: SENHA });
  admin = await entrar("admin@demo.com.br");
  for (const [email, perfilId] of [["fin@demo.com.br", "FINANCEIRO"], ["rec@demo.com.br", "RECRUTADOR"]]) {
    const r = await chamar("/api/usuarios", { metodo: "POST", token: admin, corpo: { nome: `Pessoa ${perfilId}`, email, senha: SENHA, perfilId, trocarSenha: false } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
  }
  financeiro = await entrar("fin@demo.com.br");
  recrutadora = await entrar("rec@demo.com.br");
});
after(() => fechar());

test("folha de setembro/2026 calcula todos e manda o desligado para a rescisão", async () => {
  const r = await chamar("/api/folha/2026-09", { token: admin });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const f = r.json.dados;
  assert.equal(f.holerites.length, folhaDemo().length - 1);
  assert.equal(f.pendencias.length, 1);
  assert.match(f.pendencias[0].motivo, /rescisão/);
  assert.equal(f.resumo.proventos - f.resumo.descontos, f.resumo.liquido);
  assert.equal(f.resumo.porLotacao.length, 5);
  assert.equal(f.tabela.de, "2026-01");
});

test("competência sem tabela legal é recusada com mensagem clara", async () => {
  const r = await chamar("/api/folha/2023-05", { token: admin });
  assert.equal(r.status, 400);
  assert.match(r.json.erro, /sem tabela legal/);
});

test("consulta vê a folha mas não lança; sem acesso ao módulo não vê", async () => {
  assert.equal((await chamar("/api/folha/2026-09", { token: financeiro })).status, 200);
  const matricula = folhaDemo()[0].colaborador.matricula;
  const bloqueado = await chamar(`/api/folha/2026-09/lancamentos/${matricula}`, { metodo: "PUT", token: financeiro, corpo: { horasExtras50: 2 } });
  assert.equal(bloqueado.status, 403);
  assert.equal((await chamar("/api/folha/2026-09", { token: recrutadora })).status, 403);
});

test("lançamento recalcula o holerite e valida os limites", async () => {
  const matricula = folhaDemo()[1].colaborador.matricula;
  const antes = (await chamar("/api/folha/2026-09", { token: admin })).json.dados.holerites.find((h) => h.colaborador.matricula === matricula);
  const r = await chamar(`/api/folha/2026-09/lancamentos/${matricula}`, { metodo: "PUT", token: admin, corpo: { horasExtras50: 30, adiantamento: 98_000 } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(r.json.dados.proventos !== antes.proventos);
  const depois = (await chamar("/api/folha/2026-09", { token: admin })).json.dados.holerites.find((h) => h.colaborador.matricula === matricula);
  assert.equal(depois.liquido, r.json.dados.liquido);
  assert.equal(depois.itens.some((i) => i.codigo === "1205.01"), false, "horas noturnas removidas do lançamento");
  const invalido = await chamar(`/api/folha/2026-09/lancamentos/${matricula}`, { metodo: "PUT", token: admin, corpo: { faltasDias: 45 } });
  assert.equal(invalido.status, 400);
});

test("CPF é o código da pessoa: valida, grava e recusa CPF de outra pessoa", async () => {
  const [a, b] = folhaDemo().map((p) => p.colaborador.matricula);
  const antes = (await chamar("/api/folha/2026-09", { token: admin })).json.dados;
  assert.ok(antes.holerites.every((h) => h.pendencias.some((p) => /CPF não informado/.test(p))));
  assert.equal(antes.resumo.semCPF, antes.holerites.length);

  const invalido = await chamar(`/api/folha/colaboradores/${a}`, { metodo: "PATCH", token: admin, corpo: { cpf: "111.111.111-11" } });
  assert.equal(invalido.status, 400);
  const ok = await chamar(`/api/folha/colaboradores/${a}`, { metodo: "PATCH", token: admin, corpo: { cpf: "529.982.247-25" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(ok.json.dados.cpf, "52998224725");
  const conflito = await chamar(`/api/folha/colaboradores/${b}`, { metodo: "PATCH", token: admin, corpo: { cpf: "52998224725" } });
  assert.equal(conflito.status, 409);
  assert.equal((await chamar(`/api/folha/colaboradores/${b}`, { metodo: "PATCH", token: financeiro, corpo: { cpf: "52998224725" } })).status, 403);

  const depois = (await chamar("/api/folha/2026-09", { token: admin })).json.dados;
  const h = depois.holerites.find((x) => x.colaborador.matricula === a);
  assert.equal(h.colaborador.cpf, "52998224725");
  assert.deepEqual(h.pendencias, []);
});
