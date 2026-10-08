import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { criarAplicacao } from "../src/app.js";
import { criarRepositorioMemoria } from "../src/db/index.js";
import { TENANT_DEMO, semear, semearUsuarios, SENHA_DEMO } from "../src/seed/dados.js";
import { semearFolha } from "../src/seed/folha.js";
import { linhaMarcacao671 } from "../../packages/ponto/src/index.js";

let base, fechar, repo;
const tokens = {};

async function chamar(caminho, { metodo = "GET", corpo, quem = "dp" } = {}) {
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
  for (const [quem, email, tipo] of [["dp", "dp@demo.com.br", "INTERNO"], ["rh", "rh@demo.com.br", "INTERNO"], ["tomador", "gestor@eletronica-amazonia.com.br", "TOMADOR"]]) {
    const r = await fetch(`${base}/api/auth/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: TENANT_DEMO, email, senha: SENHA_DEMO, tipo }) }).then((x) => x.json());
    tokens[quem] = r.dados?.token;
  }
});
after(() => fechar());

test("AFD do demo importado; reimportar não duplica", async () => {
  const imps = (await chamar("/api/ponto/importacoes")).json.dados;
  assert.equal(imps.length, 1);
  assert.ok(imps[0].novas > 100);
  const { itens } = await repo.listar(TENANT_DEMO, "pontoMarcacoes", {}, { limite: 100_000 });
  const m = itens[0];
  const r = await chamar("/api/ponto/afd", { metodo: "POST", corpo: { nome: "repetido", conteudo: `${linhaMarcacao671({ nsr: 1, data: m.data, hora: m.hora, cpf: m.cpf })}\r\n${linhaMarcacao671({ nsr: 2, data: m.data, hora: "23:59", cpf: "52998224725" })}` } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.deepEqual([r.json.dados.novas, r.json.dados.duplicadas, r.json.dados.naoIdentificadas], [1, 1, 1]);
  assert.equal((await chamar("/api/ponto/afd", { metodo: "POST", corpo: { conteudo: "nada" } })).status, 400);
});

test("espelho: apuração, tratamento do DP, envio, aprovação do tomador e lançamento na folha", async () => {
  const mes = (await chamar("/api/ponto/2026-09")).json.dados;
  assert.ok(mes.itens.length > 10);
  const comPonto = mes.itens.filter((i) => i.totais.trabalhado > 0);
  assert.ok(comPonto.length > 5);
  assert.ok(mes.itens.some((i) => i.pendencias.length)); // sem CPF
  const impar = mes.itens.find((i) => i.totais.inconsistencias);
  assert.ok(impar, "o demo tem uma marcação ímpar");
  const comBanco = mes.itens.find((i) => i.bancoHorasAdesao && i.saldoBanco > 0);
  assert.ok(comBanco, "alguém com extras acima de 20 h e banco de horas");
  assert.equal(comBanco.lancamentos.horasExtras50, 20);

  // Envio bloqueia quem tem marcação ímpar; o DP trata o dia e envia.
  const env = (await chamar("/api/ponto/2026-09/enviar", { metodo: "POST", corpo: { matriculas: [impar.matricula] } })).json.dados;
  assert.equal(env.enviados, 0);
  assert.match(env.bloqueados[0].motivo, /ímpar/);
  const espelho = (await chamar(`/api/ponto/2026-09/${impar.matricula}`)).json.dados;
  const dia = espelho.dias.find((d) => d.inconsistencias.length);
  assert.equal((await chamar(`/api/ponto/2026-09/${impar.matricula}/ajustes/${dia.data}`, { metodo: "PUT", corpo: { horas: [...dia.marcacoes, "17:48"] } })).status, 400);
  const aj = await chamar(`/api/ponto/2026-09/${impar.matricula}/ajustes/${dia.data}`, { metodo: "PUT", corpo: { horas: [...dia.marcacoes, "17:48"], motivo: "Esqueceu a saída; confirmado pelo líder" } });
  assert.equal(aj.status, 200, JSON.stringify(aj.json));
  const depois = (await chamar(`/api/ponto/2026-09/${impar.matricula}`)).json.dados;
  const tratado = depois.dias.find((d) => d.data === dia.data);
  assert.equal(tratado.inconsistencias.length, 0);
  assert.deepEqual(tratado.ajuste.original, dia.marcacoes);

  // Envia os do tomador com portal (Eletrônica Amazônia).
  const daEletronica = mes.itens.filter((i) => i.tomadorId === "TOM_ELETRONICA_AMAZONIA" && !i.pendencias.length).map((i) => i.matricula);
  const env2 = (await chamar("/api/ponto/2026-09/enviar", { metodo: "POST", corpo: { matriculas: daEletronica } })).json.dados;
  assert.equal(env2.enviados, daEletronica.length);
  assert.equal((await chamar(`/api/ponto/2026-09/${daEletronica[0]}/ajustes/2026-09-01`, { metodo: "PUT", corpo: { abonado: true, motivo: "Atestado médico" } })).status, 409);

  // Portal do tomador: vê só os seus, aprova um e contesta outro.
  const portal = (await chamar("/api/portal/tomador/ponto", { quem: "tomador" })).json.dados;
  assert.equal(portal.podeAprovar, true);
  assert.equal(portal.itens.length, daEletronica.length);
  const outro = mes.itens.find((i) => i.tomadorId && i.tomadorId !== "TOM_ELETRONICA_AMAZONIA");
  assert.equal((await chamar(`/api/portal/tomador/ponto/2026-09/${outro.matricula}`, { quem: "tomador" })).status, 404);
  const det = (await chamar(`/api/portal/tomador/ponto/2026-09/${daEletronica[0]}`, { quem: "tomador" })).json.dados;
  assert.equal(det.dias.length, 30);
  assert.equal((await chamar(`/api/portal/tomador/ponto/2026-09/${daEletronica[0]}`, { metodo: "POST", quem: "tomador", corpo: { acao: "APROVAR" } })).json.dados.status, "APROVADO");
  if (daEletronica[1]) {
    assert.equal((await chamar(`/api/portal/tomador/ponto/2026-09/${daEletronica[1]}`, { metodo: "POST", quem: "tomador", corpo: { acao: "CONTESTAR", motivo: "curto" } })).status, 400);
    const c = await chamar(`/api/portal/tomador/ponto/2026-09/${daEletronica[1]}`, { metodo: "POST", quem: "tomador", corpo: { acao: "CONTESTAR", motivo: "Dia 15 ele trabalhou no turno da tarde" } });
    assert.equal(c.json.dados.status, "CONTESTADO");
  }
  // Interno aprova espelho de tomador só com motivo.
  if (daEletronica[2]) {
    assert.equal((await chamar(`/api/ponto/2026-09/${daEletronica[2]}/aprovar`, { metodo: "POST", quem: "rh", corpo: {} })).status, 409);
    assert.equal((await chamar(`/api/ponto/2026-09/${daEletronica[2]}/aprovar`, { metodo: "POST", quem: "rh", corpo: { motivo: "Tomador aprovou por e-mail em 01/10" } })).status, 200);
  }

  // Lançar: só os aprovados, nos campos do ponto; o banco de horas fica gravado.
  const antes = await repo.obter(TENANT_DEMO, "folhaLancamentos", `2026-09:${daEletronica[0]}`);
  const lan = (await chamar("/api/ponto/2026-09/lancar", { metodo: "POST" })).json.dados;
  assert.equal(lan.lancados, daEletronica[2] ? 2 : 1);
  const doc = await repo.obter(TENANT_DEMO, "folhaLancamentos", `2026-09:${daEletronica[0]}`);
  assert.equal(doc.origemPonto, true);
  assert.equal(doc.adiantamento, antes?.adiantamento);
  const folha = (await chamar("/api/folha/2026-09")).json.dados;
  const h = folha.holerites.find((x) => x.colaborador.matricula === daEletronica[0]);
  assert.ok(h);
  const status = (await chamar(`/api/ponto/2026-09/${daEletronica[0]}`)).json.dados.status;
  assert.equal(status, "LANCADO");
  // Competência fechada não recebe lançamento do ponto.
  assert.equal((await chamar("/api/ponto/2026-08/lancar", { metodo: "POST" })).status, 409);
});
