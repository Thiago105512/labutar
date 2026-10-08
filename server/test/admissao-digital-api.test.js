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
  const contas = [["dp", "dp@demo.com.br", "INTERNO"], ["medico", "medico@demo.com.br", "INTERNO"], ["clinica", "clinica@demo.com.br", "INTERNO"], ["joana", "joana.lima@exemplo.com", "COLABORADOR"], ["marcia", "marcia.santos@exemplo.com", "COLABORADOR"]];
  for (const [quem, email, tipo] of contas) {
    const r = await fetch(`${base}/api/auth/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: TENANT_DEMO, email, senha: SENHA_DEMO, tipo }) }).then((x) => x.json());
    tokens[quem] = r.dados?.token;
  }
});
after(() => fechar());

test("admissão digital: portal, ASO da clínica com custo, contrato e conclusão pelo DP", async () => {
  const lista = (await chamar("/api/admissoes")).json.dados;
  const adm = lista.find((a) => a.nome === "Joana Ribeiro Lima");
  assert.ok(adm);
  assert.equal(adm.status, "PENDENTE");
  assert.equal(adm.exame.status, "AGENDADO");
  assert.equal((await chamar(`/api/admissoes/${adm.matricula}/concluir`, { metodo: "POST" })).status, 409);

  // Portal: a admissão aparece só para a própria pessoa.
  assert.deepEqual((await chamar("/api/portal/colaborador/inicio", { quem: "joana" })).json.dados.servicos, ["admissao", "holerites"]);
  assert.equal((await chamar("/api/portal/colaborador/admissao", { quem: "marcia" })).status, 404);
  const portal = (await chamar("/api/portal/colaborador/admissao", { quem: "joana" })).json.dados;
  assert.match(portal.contrato.texto, /Lei 6\.019\/1974/);
  assert.equal((await chamar("/api/portal/colaborador/admissao/dados", { metodo: "PUT", quem: "joana", corpo: { pis: "12056412548" } })).status, 400);
  const dados = await chamar("/api/portal/colaborador/admissao/dados", { metodo: "PUT", quem: "joana", corpo: {
    nascimento: "1998-03-02", nomeMae: "Maria Ribeiro", rg: "1234567", pis: "120.56412.54-5",
    endereco: { cep: "69000-000", logradouro: "Rua Exemplo", numero: "10", bairro: "Centro", municipio: "Manaus", uf: "am" },
    banco: { pix: "joana.lima@exemplo.com" },
  } });
  assert.equal(dados.status, 200, JSON.stringify(dados.json));
  assert.equal(dados.json.dados.status, "DOCUMENTOS_OK");

  // Contrato: aceite só com o texto atual.
  assert.equal((await chamar("/api/portal/colaborador/admissao/contrato", { metodo: "POST", quem: "joana", corpo: { aceito: true, hash: "outro" } })).status, 409);
  const aceite = await chamar("/api/portal/colaborador/admissao/contrato", { metodo: "POST", quem: "joana", corpo: { aceito: true, hash: portal.contrato.hash } });
  assert.equal(aceite.status, 200, JSON.stringify(aceite.json));
  assert.ok(aceite.json.dados.contratoAceitoEm);

  // Clínica: a recepção não emite ASO; o médico emite; o custo do exame vai para o contrato.
  const exames = (await chamar("/api/clinica/exames", { quem: "clinica" })).json.dados;
  const exame = exames.find((e) => e.matricula === adm.matricula);
  assert.equal((await chamar(`/api/clinica/exames/${exame.id}/resultado`, { metodo: "POST", quem: "clinica", corpo: { resultado: "APTO" } })).status, 403);
  assert.equal((await chamar("/api/clinica/exames", { quem: "dp" })).status, 403);
  assert.equal((await chamar(`/api/clinica/exames/${exame.id}/resultado`, { metodo: "POST", quem: "medico", corpo: { resultado: "APTO", medico: { nome: "Dra." } } })).status, 400);
  const aso = await chamar(`/api/clinica/exames/${exame.id}/resultado`, { metodo: "POST", quem: "medico", corpo: { resultado: "APTO", medico: { nome: "Beatriz Médica do Trabalho", crm: "12345/AM" } } });
  assert.equal(aso.status, 200, JSON.stringify(aso.json));
  const custo = await repo.obter(TENANT_DEMO, "custosLancamentos", aso.json.dados.custoLancamentoId);
  assert.equal(custo.tipo, "EXAME");
  assert.deepEqual(custo.destino, { tipo: "COLABORADOR", matricula: adm.matricula });

  const pronto = (await chamar(`/api/admissoes/${adm.matricula}`)).json.dados;
  assert.equal(pronto.status, "ASO_OK");
  assert.equal(pronto.exame.resultado, "APTO");
  const fim = await chamar(`/api/admissoes/${adm.matricula}/concluir`, { metodo: "POST" });
  assert.equal(fim.status, 200, JSON.stringify(fim.json));
  assert.equal((await repo.obter(TENANT_DEMO, "vinculos", adm.matricula)).admissaoConcluida, true);
  assert.deepEqual((await chamar("/api/portal/colaborador/inicio", { quem: "joana" })).json.dados.servicos, ["holerites"]);
});

test("admissão pelo cadastro abre a admissão e o admissional; o custo do kit não se repete", async () => {
  const { itens: postos } = await repo.listar(TENANT_DEMO, "postos", {}, { limite: 100 });
  const posto = postos.find((p) => p.contratoId?.endsWith("TEMP"));
  const r = await chamar("/api/colaboradores", { metodo: "POST", corpo: {
    pessoa: { nome: "Rui Teste Fictício", cpf: "111.444.777-35" },
    vinculo: { tipo: "TEMPORARIO", admissao: "2026-10-26", salario: 250_000, postoId: posto.id, temporario: { fimPrevisto: "2027-01-20" } },
  } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const m = r.json.dados.vinculo.matricula;
  const exame = (await chamar("/api/clinica/exames", { quem: "medico" })).json.dados.find((e) => e.matricula === m);
  assert.equal(exame.status, "A_AGENDAR");
  assert.equal((await chamar(`/api/clinica/exames/${exame.id}/agendar`, { metodo: "POST", quem: "clinica", corpo: { data: "2026-10-30", hora: "08:00" } })).status, 409);
  assert.equal((await chamar(`/api/clinica/exames/${exame.id}/agendar`, { metodo: "POST", quem: "clinica", corpo: { data: "2026-10-22", hora: "08:00" } })).status, 200);
  const antes = (await repo.listar(TENANT_DEMO, "custosLancamentos", { itemId: "ITC_EXAME_ADM" }, { limite: 1000 })).itens.filter((l) => l.destino?.matricula === m).length;
  const aso = await chamar(`/api/clinica/exames/${exame.id}/resultado`, { metodo: "POST", quem: "medico", corpo: { resultado: "INAPTO", restricoes: "Reavaliar em 30 dias", medico: { nome: "Beatriz Médica do Trabalho", crm: "12345/AM" } } });
  assert.equal(aso.status, 200);
  const depois = (await repo.listar(TENANT_DEMO, "custosLancamentos", { itemId: "ITC_EXAME_ADM" }, { limite: 1000 })).itens.filter((l) => l.destino?.matricula === m).length;
  assert.equal(depois, antes);
  const a = (await chamar(`/api/admissoes/${m}`)).json.dados;
  assert.equal(a.status, "BLOQUEADA");
  assert.equal(a.podeConcluir, false);
});
