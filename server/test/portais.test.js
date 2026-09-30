import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { criarAplicacao } from "../src/app.js";
import { criarRepositorioMemoria } from "../src/db/index.js";
import { semear, TENANT_DEMO } from "../src/seed/dados.js";

/**
 * Portais de candidato, colaborador e tomador, com identidade por cabeçalho
 * desligada. O foco é isolamento: cada conta vê só o que é dela.
 */
const SENHA = "Castelo de areia 2026";
const CONSENTIMENTO = { aceito: true, versaoTermo: "1.0" };
let base;
let fechar;
let admin;
let vagaAberta;

async function chamar(caminho, { metodo = "GET", token, corpo, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (corpo !== undefined) h["Content-Type"] = "application/json";
  const r = await fetch(`${base}${caminho}`, { method: metodo, headers: h, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}

async function entrar(email, senha, tipo = "INTERNO") {
  const r = await chamar("/api/auth/entrar", { metodo: "POST", corpo: { empresa: TENANT_DEMO, email, senha, tipo } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json.dados;
}

const cadastrar = (dados) => chamar("/api/portal/candidato/cadastro", {
  metodo: "POST", corpo: { empresa: TENANT_DEMO, consentimento: CONSENTIMENTO, senha: SENHA, ...dados },
});

before(async () => {
  const repo = criarRepositorioMemoria();
  const app = await criarAplicacao({ repo, config: { permitirIdentidadePorCabecalho: false }, log: () => {} });
  const servidor = createServer(app.handler);
  await new Promise((resolver) => servidor.listen(0, "127.0.0.1", resolver));
  base = `http://127.0.0.1:${servidor.address().port}`;
  fechar = () => new Promise((resolver) => servidor.close(resolver));
  await semear(repo);
  await app.acesso.criarPrimeiroAdministrador(TENANT_DEMO, { nome: "Diretora Geral", email: "admin@demo.com.br", senha: SENHA });
  admin = await entrar("admin@demo.com.br", SENHA);
  vagaAberta = (await chamar(`/api/publico/vagas?tenant=${TENANT_DEMO}`)).json.dados.itens[0];
});

after(() => fechar());

test("candidato cria a própria conta, já entra logado e se candidata", async () => {
  const r = await cadastrar({ nome: "Bruna Nova Silva", email: "bruna@exemplo.com", cidade: "Manaus", uf: "AM" });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.dados.tipo, "CANDIDATO");
  assert.deepEqual(r.json.dados.modulos, [], "candidato não tem módulos internos");
  const token = r.json.dados.token;

  const candidatura = await chamar("/api/portal/candidato/candidaturas", { metodo: "POST", token, corpo: { vagaSlug: vagaAberta.slug, respostas: [] } });
  assert.equal(candidatura.status, 201, JSON.stringify(candidatura.json));
  assert.equal(candidatura.json.dados.score, undefined, "candidato nunca vê o score");

  const repetida = await chamar("/api/portal/candidato/candidaturas", { metodo: "POST", token, corpo: { vagaSlug: vagaAberta.slug } });
  assert.equal(repetida.status, 409);

  const minhas = await chamar("/api/portal/candidato/candidaturas", { token });
  assert.equal(minhas.json.dados.itens.length, 1);
  assert.equal(minhas.json.dados.itens[0].vaga.titulo, vagaAberta.titulo);
});

test("consentimento é obrigatório no cadastro do candidato", async () => {
  const r = await chamar("/api/portal/candidato/cadastro", { metodo: "POST", corpo: { empresa: TENANT_DEMO, nome: "Sem Termo", email: "semtermo@exemplo.com", senha: SENHA } });
  assert.equal(r.status, 400);
});

test("candidato só enxerga as próprias candidaturas", async () => {
  const a = (await cadastrar({ nome: "Carlos Um Teste", email: "um@exemplo.com" })).json.dados.token;
  const b = (await cadastrar({ nome: "Diana Dois Teste", email: "dois@exemplo.com" })).json.dados.token;
  const minha = (await chamar("/api/portal/candidato/candidaturas", { metodo: "POST", token: a, corpo: { vagaSlug: vagaAberta.slug } })).json.dados;

  assert.equal((await chamar("/api/portal/candidato/candidaturas", { token: b })).json.dados.itens.length, 0);
  const alheia = await chamar(`/api/portal/candidato/candidaturas/${minha.id}/desistir`, { metodo: "POST", token: b, corpo: {} });
  assert.equal(alheia.status, 404, "candidatura de outra pessoa não é nem confirmada");
});

test("e-mail de currículo já existente só é ligado com o código de acompanhamento", async () => {
  const anonima = await chamar(`/api/publico/candidaturas?tenant=${TENANT_DEMO}`, {
    metodo: "POST",
    corpo: { vagaSlug: vagaAberta.slug, consentimento: CONSENTIMENTO, candidato: { dados: { nome: "Elisa Anônima Souza" }, contato: { email: "elisa@exemplo.com" } } },
  });
  assert.equal(anonima.status, 201, JSON.stringify(anonima.json));

  const semCodigo = await cadastrar({ nome: "Impostor", email: "elisa@exemplo.com" });
  assert.equal(semCodigo.status, 409);
  assert.equal(semCodigo.json.detalhes.precisaCodigo, true);

  const codigoErrado = await cadastrar({ nome: "Impostor", email: "elisa@exemplo.com", codigoAcompanhamento: "inventado" });
  assert.equal(codigoErrado.status, 409);

  const certo = await cadastrar({ nome: "Elisa Anônima Souza", email: "elisa@exemplo.com", codigoAcompanhamento: anonima.json.dados.token });
  assert.equal(certo.status, 201, JSON.stringify(certo.json));
  const minhas = await chamar("/api/portal/candidato/candidaturas", { token: certo.json.dados.token });
  assert.equal(minhas.json.dados.itens.length, 1, "vê a candidatura feita antes do cadastro");
});

test("candidato atualiza o currículo, mas não o e-mail de login", async () => {
  const token = (await cadastrar({ nome: "Fabio Curriculo Lima", email: "fabio@exemplo.com" })).json.dados.token;
  const r = await chamar("/api/portal/candidato/perfil", {
    metodo: "PATCH", token,
    corpo: { curriculoTexto: "Operador de empilhadeira com NR-11.", competencias: [{ nome: "NR-11", nivel: 4 }], contato: { telefone: "(92) 99999-0000", email: "outro@x.com" } },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.dados.candidato.contato.email, "fabio@exemplo.com");
  assert.equal(r.json.dados.candidato.contato.telefone, "(92) 99999-0000");
});

test("contas externas não entram na área da empresa, e vice-versa", async () => {
  const cand = (await cadastrar({ nome: "Gabi Fronteira Dias", email: "gabi@exemplo.com" })).json.dados.token;
  const interna = await chamar("/api/vagas", { token: cand });
  assert.equal(interna.status, 403);
  assert.match(interna.json.erro, /equipe da empresa/);
  assert.equal((await chamar("/api/usuarios", { token: cand })).status, 403);
  assert.equal((await chamar("/api/contas-externas?tipo=CANDIDATO", { token: cand })).status, 403);

  const doAdmin = await chamar("/api/portal/candidato/candidaturas", { token: admin.token });
  assert.equal(doAdmin.status, 403, "a equipe usa o painel, não o portal do candidato");
});

test("mesma senha e e-mail, tipo errado: não entra", async () => {
  await cadastrar({ nome: "Helio Tipo Certo", email: "helio@exemplo.com" });
  const r = await chamar("/api/auth/entrar", { metodo: "POST", corpo: { empresa: TENANT_DEMO, email: "helio@exemplo.com", senha: SENHA, tipo: "INTERNO" } });
  assert.equal(r.status, 401);
  const tomador = await chamar("/api/auth/entrar", { metodo: "POST", corpo: { empresa: TENANT_DEMO, email: "helio@exemplo.com", senha: SENHA, tipo: "TOMADOR" } });
  assert.equal(tomador.status, 401);
});

test("acesso do colaborador é liberado por quem tem cadastro em Colaboradores", async () => {
  const pessoa = (await chamar("/api/candidatos", { token: admin.token })).json.dados.itens[0];
  await chamar("/api/usuarios", { metodo: "POST", token: admin.token, corpo: { nome: "Rita Recrutadora", email: "rita@demo.com.br", perfilId: "RECRUTADOR", senha: SENHA } });
  const rita = await entrar("rita@demo.com.br", SENHA);
  const negado = await chamar("/api/contas-externas", {
    metodo: "POST", token: rita.token,
    corpo: { tipo: "COLABORADOR", nome: pessoa.dados.nome, email: "colab@exemplo.com", senha: SENHA, escopo: { pessoaId: pessoa.id } },
  });
  assert.equal(negado.status, 403, "recrutadora só consulta colaboradores");

  const criado = await chamar("/api/contas-externas", {
    metodo: "POST", token: admin.token,
    corpo: { tipo: "COLABORADOR", nome: pessoa.dados.nome, email: "colab@exemplo.com", senha: SENHA, escopo: { pessoaId: pessoa.id } },
  });
  assert.equal(criado.status, 201, JSON.stringify(criado.json));
  assert.equal(criado.json.dados.trocarSenha, true);

  const colab = await entrar("colab@exemplo.com", SENHA, "COLABORADOR");
  const inicio = await chamar("/api/portal/colaborador/inicio", { token: colab.token });
  assert.equal(inicio.status, 200);
  assert.equal(inicio.json.dados.pessoa.nome, pessoa.dados.nome);
  assert.equal((await chamar("/api/portal/tomador/inicio", { token: colab.token })).status, 403);
  assert.equal((await chamar("/api/portal/candidato/candidaturas", { token: colab.token })).status, 403);
});

test("usuário do tomador vê só o próprio cliente e age conforme o papel", async () => {
  const semEscopo = await chamar("/api/contas-externas", {
    metodo: "POST", token: admin.token, corpo: { tipo: "TOMADOR", nome: "Sem Tomador", email: "x@cliente.com", senha: SENHA, escopo: {} },
  });
  assert.equal(semEscopo.status, 400);

  const criado = await chamar("/api/contas-externas", {
    metodo: "POST", token: admin.token,
    corpo: { tipo: "TOMADOR", nome: "Igor Gestor Cliente", email: "igor@cliente.com", senha: SENHA, escopo: { tomadorId: "TOM_1", tomadorNome: "Eletrônica Amazônia S.A.", papel: "GESTOR_CONTRATO" } },
  });
  assert.equal(criado.status, 201, JSON.stringify(criado.json));
  const igor = await entrar("igor@cliente.com", SENHA, "TOMADOR");
  const inicio = (await chamar("/api/portal/tomador/inicio", { token: igor.token })).json.dados;
  assert.equal(inicio.tomador.nome, "Eletrônica Amazônia S.A.");
  assert.ok(inicio.acoes.includes("aprovarPonto"));

  await chamar(`/api/contas-externas/${criado.json.dados.id}`, { metodo: "PATCH", token: admin.token, corpo: { escopo: { papel: "FINANCEIRO" } } });
  assert.equal((await chamar("/api/portal/tomador/inicio", { token: igor.token })).status, 401, "mudar o papel derruba a sessão");
  const denovo = await entrar("igor@cliente.com", SENHA, "TOMADOR");
  const acoes = (await chamar("/api/portal/tomador/inicio", { token: denovo.token })).json.dados.acoes;
  assert.equal(acoes.includes("aprovarPonto"), false);
  assert.ok(acoes.includes("verFaturas"));
});

test("contas externas não aparecem na lista de usuários internos", async () => {
  const internos = (await chamar("/api/usuarios", { token: admin.token })).json.dados.itens;
  assert.equal(internos.every((u) => (u.tipo ?? "INTERNO") === "INTERNO"), true);
  const candidatos = (await chamar("/api/contas-externas?tipo=CANDIDATO", { token: admin.token })).json.dados.itens;
  assert.ok(candidatos.length >= 5);
  assert.equal(candidatos.some((c) => "senhaHash" in c), false);
});

test("equipe desativa conta externa e a sessão cai", async () => {
  const cadastro = (await cadastrar({ nome: "Julia Desativada Reis", email: "julia@exemplo.com" })).json.dados;
  assert.equal((await chamar("/api/portal/candidato/eu", { token: cadastro.token })).status, 200);
  await chamar(`/api/contas-externas/${cadastro.usuario.id}`, { metodo: "PATCH", token: admin.token, corpo: { ativo: false } });
  assert.equal((await chamar("/api/portal/candidato/eu", { token: cadastro.token })).status, 401);
});
