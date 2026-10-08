import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { criarAplicacao } from "../src/app.js";
import { criarRepositorioMemoria } from "../src/db/index.js";
import { TENANT_DEMO, semear, semearUsuarios, SENHA_DEMO } from "../src/seed/dados.js";
import { semearFolha } from "../src/seed/folha.js";

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
  for (const [quem, email] of [["rh", "rh@demo.com.br"], ["dp", "dp@demo.com.br"]]) {
    const r = await fetch(`${base}/api/auth/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: TENANT_DEMO, email, senha: SENHA_DEMO, tipo: "INTERNO" }) }).then((x) => x.json());
    tokens[quem] = r.dados?.token;
  }
});
after(() => fechar());

test("férias gravadas: recibo, período gozado, folha do mês e fluxo de aprovação", async () => {
  // Admissão 04/09/2023: período aberto 04/09/2025 a 03/09/2026. Gozo 19/10 a 07/11 + 10 de abono.
  const r = await chamar("/api/folha/ferias/registros", { metodo: "POST", corpo: { matricula: "10048022", inicio: "2026-10-19", dias: 20, abonoDias: 10 } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const f = r.json.dados;
  assert.equal(f.status, "PROGRAMADA");
  assert.equal(f.periodo.inicio, "2025-09-04");
  assert.equal(f.fim, "2026-11-07");
  assert.equal(f.retorno, "2026-11-08");
  assert.equal(f.prazoPagamento, "2026-10-17");
  assert.equal(f.restanteDoPeriodo, 0);
  assert.ok((await repo.obter(TENANT_DEMO, "vinculos", "10048022")).periodosGozados.includes("2025-09-04"));

  // Sobreposição e período sem saldo.
  assert.equal((await chamar("/api/folha/ferias/registros", { metodo: "POST", corpo: { matricula: "10048022", inicio: "2026-10-26", dias: 10 } })).status, 400);

  // Folha de outubro: 13 dias de férias no mês saem do salário (17 dias pagos) e o INSS desconta o retido.
  const out = await chamar("/api/folha/2026-10");
  const h = out.json.dados.holerites.find((x) => x.colaborador.matricula === "10048022");
  assert.equal(h.ferias.dias, 13);
  assert.equal(h.itens.find((i) => i.codigo === "1000.01").referencia, "17 dias");
  assert.match(h.itens.find((i) => i.codigo === "9201.01").referencia, /retido nas férias/);
  assert.ok(h.bases.inss > h.itens.filter((i) => i.tipo === "PROVENTO").reduce((s, i) => s + i.valor, 0) - 1);
  const nov = (await chamar("/api/folha/2026-11")).json.dados.holerites.find((x) => x.colaborador.matricula === "10048022");
  assert.equal(nov.ferias.dias, 7);
  // O INSS retido no recibo é repartido entre os meses sem perder centavo.
  const inssRecibo = f.recibo.itens.find((i) => i.codigo === "9201.01").valor;
  assert.equal(h.ferias.inssRetido + nov.ferias.inssRetido, inssRecibo);

  // DP programa e paga; só o gestor aprova.
  assert.equal((await chamar(`/api/folha/ferias/registros/${f.id}/acao`, { metodo: "POST", corpo: { acao: "APROVAR" } })).status, 403);
  assert.equal((await chamar(`/api/folha/ferias/registros/${f.id}/acao`, { metodo: "POST", corpo: { acao: "PAGAR" } })).status, 409);
  assert.equal((await chamar(`/api/folha/ferias/registros/${f.id}/acao`, { metodo: "POST", corpo: { acao: "APROVAR" }, quem: "rh" })).status, 200);
  const pago = await chamar(`/api/folha/ferias/registros/${f.id}/acao`, { metodo: "POST", corpo: { acao: "PAGAR", data: "2026-10-16" } });
  assert.equal(pago.json.dados.status, "PAGA");
  assert.equal(pago.json.dados.foraDoPrazo, false);

  const doc = (await chamar(`/api/folha/ferias/registros/${f.id}`)).json.dados.documento;
  assert.match(doc.declaracao, /08\/11\/2026/);
  assert.equal(doc.totais.liquido, f.recibo.liquido);
  assert.equal((await chamar("/api/folha/ferias/registros")).json.dados.length, 1);
});

test("rescisão gravada: desliga, monta o TRCT, lança o custo ao aprovar e volta ao cancelar", async () => {
  const r = await chamar("/api/folha/rescisao/registros", { metodo: "POST", corpo: { matricula: "20048050", desligamento: "2026-10-15", motivo: "03" } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const res = r.json.dados;
  assert.equal(res.status, "CALCULADA");
  assert.equal(res.prazoPagamento, "2026-10-25");
  assert.ok(res.custo.total > 0);
  assert.ok(res.custo.partes.some((p) => p.nome === "FGTS da rescisão"));
  assert.equal((await repo.obter(TENANT_DEMO, "vinculos", "20048050")).desligamento, "2026-10-15");

  // Sai da folha mensal de outubro e não pode ser desligado de novo.
  const out = (await chamar("/api/folha/2026-10")).json.dados;
  assert.ok(!out.holerites.some((x) => x.colaborador.matricula === "20048050"));
  assert.equal((await chamar("/api/folha/rescisao/registros", { metodo: "POST", corpo: { matricula: "20048050", desligamento: "2026-10-20", motivo: "03" } })).status, 409);

  const trct = (await chamar(`/api/folha/rescisao/registros/${res.id}`)).json.dados.trct;
  assert.equal(trct.contrato.causa.codigo, "03");
  assert.equal(trct.contrato.afastamento, "2026-10-15");
  assert.equal(trct.totais.liquido, res.resultado.liquido);
  assert.ok(trct.colaborador.nome);

  // Aprovada: o custo vai para o centro de custos do contrato do colaborador.
  assert.equal((await chamar(`/api/folha/rescisao/registros/${res.id}/acao`, { metodo: "POST", corpo: { acao: "APROVAR" } })).status, 403);
  assert.equal((await chamar(`/api/folha/rescisao/registros/${res.id}/acao`, { metodo: "POST", corpo: { acao: "APROVAR" }, quem: "rh" })).status, 200);
  const { itens: custos } = await repo.listar(TENANT_DEMO, "custosLancamentos", { origem: "RESCISAO" }, { limite: 100 });
  assert.equal(custos.length, 1);
  assert.equal(custos[0].valor, res.custo.total);
  assert.deepEqual(custos[0].destino, { tipo: "COLABORADOR", matricula: "20048050" });

  // Cancelar exige motivo; cancelada, volta à folha e o custo sai.
  assert.equal((await chamar(`/api/folha/rescisao/registros/${res.id}/acao`, { metodo: "POST", corpo: { acao: "CANCELAR", motivo: "curto" }, quem: "rh" })).status, 409);
  const canc = await chamar(`/api/folha/rescisao/registros/${res.id}/acao`, { metodo: "POST", corpo: { acao: "CANCELAR", motivo: "Colaborador permaneceu no posto" }, quem: "rh" });
  assert.equal(canc.json.dados.status, "CANCELADA");
  assert.equal((await repo.listar(TENANT_DEMO, "custosLancamentos", { origem: "RESCISAO" }, { limite: 100 })).itens.length, 0);
  assert.equal((await repo.obter(TENANT_DEMO, "vinculos", "20048050")).desligamento, null);
});

test("rescisão e pagamento fora do prazo; competência fechada não aceita desligamento", async () => {
  const ago = await chamar("/api/folha/rescisao/registros", { metodo: "POST", corpo: { matricula: "10048022", desligamento: "2026-08-20", motivo: "02" } });
  assert.equal(ago.status, 409, JSON.stringify(ago.json));
  const r = await chamar("/api/folha/rescisao/registros", { metodo: "POST", corpo: { matricula: "10048022", desligamento: "2026-11-30", motivo: "07" } });
  // Férias registradas até 07/11, antes do desligamento: permitido.
  assert.equal(r.status, 201, JSON.stringify(r.json));
  await chamar(`/api/folha/rescisao/registros/${r.json.dados.id}/acao`, { metodo: "POST", corpo: { acao: "APROVAR" }, quem: "rh" });
  const pago = await chamar(`/api/folha/rescisao/registros/${r.json.dados.id}/acao`, { metodo: "POST", corpo: { acao: "PAGAR", data: "2026-12-15" } });
  assert.equal(pago.json.dados.foraDoPrazo, true);
  assert.match(pago.json.dados.avisos.join(), /477, § 8º/);
});
