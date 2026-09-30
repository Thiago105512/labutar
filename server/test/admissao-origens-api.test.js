import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { criarAplicacao } from "../src/app.js";
import { criarRepositorioMemoria } from "../src/db/index.js";
import { TENANT_DEMO, semear } from "../src/seed/dados.js";
import { semearFolha } from "../src/seed/folha.js";

const SENHA = "Castelo de areia 2026";
let base, fechar, token, repo;

async function chamar(caminho, { metodo = "GET", corpo } = {}) {
  const h = { Authorization: `Bearer ${token}` };
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
  await app.acesso.criarPrimeiroAdministrador(TENANT_DEMO, { nome: "Diretora Geral", email: "admin@demo.com.br", senha: SENHA });
  token = (await fetch(`${base}/api/auth/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: TENANT_DEMO, email: "admin@demo.com.br", senha: SENHA }) }).then((r) => r.json())).dados.token;
});
after(() => fechar());

async function postoTemporario() {
  const tomadores = (await chamar("/api/tomadores")).json.dados;
  for (const t of tomadores) {
    const det = (await chamar(`/api/tomadores/${t.id}`)).json.dados;
    for (const c of det.contratos.filter((x) => x.tipo === "TRABALHO_TEMPORARIO")) {
      const p = c.postos.find((x) => x.ocupados < x.vagas);
      if (p) return p;
    }
  }
  throw new Error("sem posto livre");
}

test("sem busca: candidatos prontos para admitir, com a vaga", async () => {
  const r = await chamar("/api/colaboradores/origens");
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const nomes = r.json.dados.map((o) => o.nome);
  assert.deepEqual(nomes.sort(), ["Carlos Eduardo Ramos", "João Batista Silva"]);
  assert.ok(r.json.dados.every((o) => o.origem === "RECRUTAMENTO" && o.vaga?.titulo));
});

test("admissão a partir do candidato: dados puxados e candidatura na etapa Admissão", async () => {
  const joao = (await chamar("/api/colaboradores/origens?busca=joão batista")).json.dados[0];
  const posto = await postoTemporario();
  const r = await chamar("/api/colaboradores", { metodo: "POST", corpo: {
    origem: { candidatoId: joao.candidatoId, candidaturaId: joao.candidaturaId },
    pessoa: { nome: joao.nome }, // só o nome no formulário: o resto vem do recrutamento
    vinculo: { tipo: "TEMPORARIO", admissao: "2026-10-01", salario: Math.max(posto.salarioReferencia ?? 0, 200_000), postoId: posto.id, temporario: { fimPrevisto: "2026-12-31" } },
  } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const { pessoa, vinculo, preenchidos, avisos } = r.json.dados;
  assert.equal(pessoa.cpf, "11144477735");
  assert.equal(pessoa.nascimento, "1996-04-12");
  assert.equal(pessoa.email, "joao.batista@exemplo.com");
  assert.equal(pessoa.candidatoId, joao.candidatoId);
  assert.ok(preenchidos.includes("cpf"));
  assert.equal(vinculo.origem.candidaturaId, joao.candidaturaId);
  assert.match(avisos.join(), /etapa Admissão/);
  const cand = await repo.obter(TENANT_DEMO, "candidaturas", joao.candidaturaId);
  assert.equal(cand.etapaAtualId, "admissao");
  assert.equal(cand.admissao.matricula, vinculo.matricula);
  // Já admitido: não aparece mais como candidato, e sim como pessoa do cadastro.
  const depois = (await chamar("/api/colaboradores/origens?busca=joão batista")).json.dados;
  assert.equal(depois.length, 1);
  assert.equal(depois[0].origem, "CADASTRO");
  assert.equal(depois[0].vinculoAtivo, true);
});

test("readmissão: a pessoa desligada é reaproveitada, com matrícula nova", async () => {
  const yara = (await chamar("/api/colaboradores/origens?busca=yara")).json.dados[0];
  assert.equal(yara.origem, "CADASTRO");
  assert.equal(yara.vinculoAtivo, false);
  const posto = await postoTemporario();
  const r = await chamar("/api/colaboradores", { metodo: "POST", corpo: {
    pessoaId: yara.pessoaId, pessoa: { cpf: "529.982.247-25" },
    vinculo: { tipo: "TEMPORARIO", admissao: "2026-10-05", salario: Math.max(posto.salarioReferencia ?? 0, 200_000), postoId: posto.id, temporario: { fimPrevisto: "2026-12-31" } },
  } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.dados.pessoa.id, yara.pessoaId);
  assert.equal(r.json.dados.pessoa.cpf, "52998224725"); // CPF que faltava foi completado
  assert.notEqual(r.json.dados.vinculo.matricula, "20048122");
});

test("CPF do recrutamento que já é de outra pessoa é recusado", async () => {
  const carlos = (await chamar("/api/colaboradores/origens?busca=carlos")).json.dados.find((o) => o.origem === "RECRUTAMENTO");
  const posto = await postoTemporario();
  const r = await chamar("/api/colaboradores", { metodo: "POST", corpo: {
    origem: { candidatoId: carlos.candidatoId, candidaturaId: carlos.candidaturaId },
    pessoa: { nome: carlos.nome, cpf: "529.982.247-25" },
    vinculo: { tipo: "TEMPORARIO", admissao: "2026-10-05", salario: 250_000, postoId: posto.id, temporario: { fimPrevisto: "2026-12-31" } },
  } });
  assert.equal(r.status, 409);
});

test("vínculo sem sindicato (dado antigo) fica fora da folha como pendência", async () => {
  const v = (await repo.listar(TENANT_DEMO, "vinculos", { tipo: "TERCEIRIZADO" }, { limite: 1 })).itens[0];
  await repo.atualizar(TENANT_DEMO, "vinculos", v.id, { sindicato: null });
  const f = (await chamar("/api/folha/2026-09")).json.dados;
  assert.ok(!f.holerites.some((h) => h.colaborador.matricula === v.matricula));
  const p = f.pendencias.find((x) => x.matricula === v.matricula);
  assert.equal(p.tipo, "SEM_SINDICATO");
});
