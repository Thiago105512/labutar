import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { criarAplicacao } from "../src/app.js";
import { criarRepositorioMemoria } from "../src/db/index.js";
import { TENANT_DEMO } from "../src/seed/dados.js";
import { semearFolha } from "../src/seed/folha.js";

const SENHA = "Castelo de areia 2026";
let base, fechar, admin, dp, fin;

async function chamar(caminho, { metodo = "GET", corpo, token = admin } = {}) {
  const h = { Authorization: `Bearer ${token}` };
  if (corpo !== undefined) h["Content-Type"] = "application/json";
  const r = await fetch(`${base}${caminho}`, { method: metodo, headers: h, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const entrar = async (email) => (await fetch(`${base}/api/auth/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: TENANT_DEMO, email, senha: SENHA }) }).then((r) => r.json())).dados.token;

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
  for (const [email, perfilId] of [["dp@demo.com.br", "ANALISTA_DP"], ["fin@demo.com.br", "FINANCEIRO"]]) {
    await chamar("/api/usuarios", { metodo: "POST", corpo: { nome: `Pessoa ${perfilId}`, email, senha: SENHA, perfilId, trocarSenha: false } });
  }
  dp = await entrar("dp@demo.com.br");
  fin = await entrar("fin@demo.com.br");
});
after(() => fechar());

test("DP lança entrega de bota pelo catálogo; resultado só para o Financeiro", async () => {
  const f = (await chamar("/api/folha/2026-09")).json.dados;
  const alvo = f.holerites.find((h) => h.colaborador.vinculo === "TERCEIRIZADO").colaborador;
  const ok = await chamar("/api/custos/lancamentos", { token: dp, metodo: "POST", corpo: { itemId: "ITC_BOTA", quantidade: 1, data: "2026-09-25", destino: { tipo: "COLABORADOR", matricula: alvo.matricula } } });
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  assert.equal(ok.json.dados.valor, 12_000);
  assert.equal(ok.json.dados.amortizarMeses, 6);
  assert.equal((await chamar("/api/custos/resultado/2026-09", { token: dp })).status, 403);
  assert.equal((await chamar("/api/custos/lancamentos", { token: dp, metodo: "POST", corpo: { itemId: "ITC_BOTA", data: "2026-09-25", destino: { tipo: "COLABORADOR", matricula: "000" } } })).status, 404);
});

test("resultado por contrato com receita, custos lançados, preposto e indiretos", async () => {
  const r = await chamar("/api/custos/resultado/2026-09", { token: fin });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const d = r.json.dados;
  assert.equal(d.contratos.length, 5);
  const plasticos = d.contratos.find((c) => c.contratoId === "CTR_PLASTICOS_TARUMA_SERV");
  assert.equal(plasticos.receita, plasticos.colaboradores * 480_000);
  assert.ok(plasticos.custos.supervisao > 0, "preposta rateada");
  assert.ok(plasticos.custos.lancados.EPI > 0 && plasticos.custos.lancados.TREINAMENTO === 8_000);
  assert.ok(plasticos.equilibrio.valorPorColaborador > 480_000);
  assert.ok(d.indiretos.itens.some((i) => i.descricao.includes("Aluguel")));
  assert.equal(d.totais.custo, d.contratos.reduce((s, c) => s + c.custoTotal, 0));
});

test("financeiro ajusta preço e rateio do preposto; validações", async () => {
  const p = await chamar("/api/contratos/CTR_PLASTICOS_TARUMA_SERV/faturamento", { token: fin, metodo: "PATCH", corpo: { modalidade: "POR_COLABORADOR", valor: 1_200_000 } });
  assert.equal(p.status, 200, JSON.stringify(p.json));
  const d = (await chamar("/api/custos/resultado/2026-09", { token: fin })).json.dados;
  assert.equal(d.contratos.find((c) => c.contratoId === "CTR_PLASTICOS_TARUMA_SERV").receita % 1_200_000, 0);
  assert.equal((await chamar("/api/contratos/CTR_PLASTICOS_TARUMA_SERV/faturamento", { token: fin, metodo: "PATCH", corpo: { modalidade: "X" } })).status, 400);
  const f = (await chamar("/api/folha/2026-09")).json.dados;
  const proprio = f.holerites.find((h) => h.colaborador.cargo === "Recrutador").colaborador.matricula;
  assert.equal((await chamar(`/api/colaboradores/${proprio}/rateio`, { token: fin, metodo: "PATCH", corpo: { rateioContratos: [{ contratoId: "CTR_MOTOS_NORTE_TEMP", percentual: 70 }] } })).status, 400);
  const ok = await chamar(`/api/colaboradores/${proprio}/rateio`, { token: fin, metodo: "PATCH", corpo: { rateioContratos: [{ contratoId: "CTR_MOTOS_NORTE_TEMP", percentual: 70 }, { contratoId: "CTR_ELETRONICA_AMAZONIA_TEMP", percentual: 30 }] } });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const depois = (await chamar("/api/custos/resultado/2026-09", { token: fin })).json.dados;
  assert.ok(depois.contratos.find((c) => c.contratoId === "CTR_MOTOS_NORTE_TEMP").custos.supervisao > 0);
  assert.ok(!depois.indiretos.itens.some((i) => i.descricao.includes("Recrutador")));
});

test("admissão lança o kit no centro de custos", async () => {
  const tomador = (await chamar("/api/tomadores")).json.dados.find((t) => t.cnpj === "03456789000188");
  const det = (await chamar(`/api/tomadores/${tomador.id}`)).json.dados;
  const posto = det.contratos.flatMap((c) => c.postos).find((p) => p.ocupados < p.vagas);
  const r = await chamar("/api/colaboradores", { metodo: "POST", corpo: { pessoa: { nome: "Kit Teste Admissão" }, vinculo: { tipo: "TERCEIRIZADO", admissao: "2026-09-28", salario: 200_000, postoId: posto.id } } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.match(r.json.dados.avisos.join(), /Kit de admissão lançado no centro de custos: 4 itens, R\$ 362,00/);
  const l = (await chamar("/api/custos/lancamentos?competencia=2026-09")).json.dados.filter((x) => x.destino.matricula === r.json.dados.vinculo.matricula);
  assert.equal(l.length, 4);
  assert.ok(l.every((x) => x.origem === "ADMISSAO"));
});
