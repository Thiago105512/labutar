import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { criarAplicacao } from "../src/app.js";
import { criarRepositorioMemoria } from "../src/db/index.js";
import { criarServicoAcesso } from "../src/auth/servico.js";
import { carregarConfig } from "../src/config.js";
import { semear, TENANT_DEMO } from "../src/seed/dados.js";

/**
 * Login e permissões com a identidade por cabeçalho DESLIGADA — como em
 * produção. Nada aqui usa X-Labutar-Usuario: toda identidade vem do login.
 */
const OUTRA_EMPRESA = "outra-empresa";
const SENHA_ADMIN = "Castelo de areia 2026";
let base;
let repo;
let fechar;
let relogio = new Date("2026-09-30T12:00:00Z");

async function chamar(caminho, { metodo = "GET", token, corpo, headers = {} } = {}) {
  const cabecalhos = { ...headers };
  if (token) cabecalhos.Authorization = `Bearer ${token}`;
  if (corpo !== undefined) cabecalhos["Content-Type"] = "application/json";
  const r = await fetch(`${base}${caminho}`, { method: metodo, headers: cabecalhos, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}

async function entrar(email, senha, empresa = TENANT_DEMO) {
  const r = await chamar("/api/auth/entrar", { metodo: "POST", corpo: { empresa, email, senha } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json.dados;
}

before(async () => {
  repo = criarRepositorioMemoria();
  const acesso = criarServicoAcesso({ repo, agora: () => relogio });
  const app = await criarAplicacao({ repo, acesso, config: { permitirIdentidadePorCabecalho: false }, log: () => {} });
  const servidor = createServer(app.handler);
  await new Promise((resolver) => servidor.listen(0, "127.0.0.1", resolver));
  base = `http://127.0.0.1:${servidor.address().port}`;
  fechar = () => new Promise((resolver) => servidor.close(resolver));
  await semear(repo);
  await acesso.criarPrimeiroAdministrador(TENANT_DEMO, { nome: "Diretora Geral", email: "admin@demo.com.br", senha: SENHA_ADMIN });
  await acesso.criarPrimeiroAdministrador(OUTRA_EMPRESA, { nome: "Admin Outra", email: "admin@outra.com.br", senha: SENHA_ADMIN });
});

after(() => fechar());

test("produção: sem login não há acesso, nem declarando admin em cabeçalho", async () => {
  assert.equal((await chamar("/api/vagas", { headers: { "X-Labutar-Tenant": TENANT_DEMO } })).status, 401);
  const forjado = await chamar("/api/vagas", {
    headers: { "X-Labutar-Tenant": TENANT_DEMO, "X-Labutar-Usuario": "hacker", "X-Labutar-Papel": "admin" },
  });
  assert.equal(forjado.status, 401);
});

test("configuração desliga a identidade por cabeçalho em produção por padrão", () => {
  assert.equal(carregarConfig({ NODE_ENV: "production" }).permitirIdentidadePorCabecalho, false);
  assert.equal(carregarConfig({}).permitirIdentidadePorCabecalho, true);
  assert.equal(carregarConfig({ NODE_ENV: "production", LABUTAR_IDENTIDADE_POR_CABECALHO: "1" }).permitirIdentidadePorCabecalho, true);
  assert.throws(() => carregarConfig({ LABUTAR_IDENTIDADE_POR_CABECALHO: "sim" }));
});

test("login do Administrador geral libera todos os módulos", async () => {
  const sessao = await entrar("ADMIN@demo.com.br", SENHA_ADMIN);
  assert.match(sessao.token, /^demo-industrial\./);
  assert.equal(sessao.perfil.id, "ADMINISTRADOR_GERAL");
  assert.equal(sessao.acesso.acessoTotal, true);
  assert.equal(sessao.modulos.every((m) => m.liberado && m.nomeNivel === "Administrador do módulo"), true);
  assert.equal(sessao.usuario.senhaHash, undefined, "hash de senha nunca sai do servidor");

  const eu = await chamar("/api/auth/eu", { token: sessao.token });
  assert.equal(eu.status, 200);
  assert.equal(eu.json.dados.usuario.email, "admin@demo.com.br");
});

test("senha errada e e-mail inexistente recebem a mesma resposta", async () => {
  const errada = await chamar("/api/auth/entrar", { metodo: "POST", corpo: { empresa: TENANT_DEMO, email: "admin@demo.com.br", senha: "senha errada demais" } });
  const inexistente = await chamar("/api/auth/entrar", { metodo: "POST", corpo: { empresa: TENANT_DEMO, email: "ninguem@demo.com.br", senha: "senha errada demais" } });
  assert.equal(errada.status, 401);
  assert.equal(inexistente.status, 401);
  assert.equal(errada.json.erro, inexistente.json.erro);
  const empresaErrada = await chamar("/api/auth/entrar", { metodo: "POST", corpo: { empresa: "X!", email: "a@b.com", senha: "qualquer coisa" } });
  assert.equal(empresaErrada.status, 401);
});

test("senha fica guardada só como hash scrypt", async () => {
  const { itens } = await repo.listar(TENANT_DEMO, "usuarios", { email: "admin@demo.com.br" });
  assert.match(itens[0].senhaHash, /^scrypt\$32768\$8\$1\$/);
  assert.equal(JSON.stringify(itens[0]).includes(SENHA_ADMIN), false);
});

test("sessão de uma empresa não enxerga outra, mesmo pedindo em cabeçalho", async () => {
  const outra = await entrar("admin@outra.com.br", SENHA_ADMIN, OUTRA_EMPRESA);
  const r = await chamar("/api/vagas", { token: outra.token, headers: { "X-Labutar-Tenant": TENANT_DEMO } });
  assert.equal(r.status, 200);
  assert.equal(r.json.dados.itens.length, 0, "vagas da demo-industrial não podem aparecer");
});

test("token inválido ou adulterado é recusado", async () => {
  assert.equal((await chamar("/api/vagas", { token: "demo-industrial.abc" })).status, 401);
  const { token } = await entrar("admin@demo.com.br", SENHA_ADMIN);
  const trocado = token.replace(/^demo-industrial/, OUTRA_EMPRESA);
  assert.equal((await chamar("/api/vagas", { token: trocado })).status, 401);
});

test("recrutador acessa o recrutamento e é barrado no resto", async () => {
  const admin = await entrar("admin@demo.com.br", SENHA_ADMIN);
  const criado = await chamar("/api/usuarios", {
    metodo: "POST", token: admin.token,
    corpo: { nome: "Rita Recrutadora", email: "rita@demo.com.br", perfilId: "RECRUTADOR", senha: "Girassol no telhado 9" },
  });
  assert.equal(criado.status, 201, JSON.stringify(criado.json));
  assert.equal(criado.json.dados.trocarSenha, true, "senha inicial deve ser trocada no primeiro acesso");

  const rita = await entrar("rita@demo.com.br", "Girassol no telhado 9");
  assert.deepEqual(rita.modulos.filter((m) => m.liberado).map((m) => m.id).sort(), ["admissao", "colaboradores", "recrutamento", "tomadores"]);

  assert.equal((await chamar("/api/vagas", { token: rita.token })).status, 200);
  const nova = await chamar("/api/vagas", { metodo: "POST", token: rita.token, corpo: { titulo: "Auxiliar de logística" } });
  assert.equal(nova.status, 201);

  assert.equal((await chamar("/api/usuarios", { token: rita.token })).status, 403);
  const candidatos = (await chamar("/api/candidatos", { token: rita.token })).json.dados.itens;
  const comCpf = candidatos.find((c) => c.dados.cpf);
  assert.match(comCpf.dados.cpf, /^\d{11}$/, "quem tem acesso ao módulo vê o CPF");
  const anonimizar = await chamar(`/api/candidatos/${comCpf.id}/anonimizar`, { metodo: "POST", token: rita.token, corpo: { motivo: "teste" } });
  assert.equal(anonimizar.status, 403);
  assert.match(anonimizar.json.erro, /Excluir/);

});

test("ninguém concede mais acesso do que tem", async () => {
  const admin = await entrar("admin@demo.com.br", SENHA_ADMIN);
  const perfil = await chamar("/api/perfis", {
    metodo: "POST", token: admin.token,
    corpo: { nome: "Coordenação de seleção", niveis: { administracao: 3, recrutamento: 3, admissao: 2, colaboradores: 1, tomadores: 1 } },
  });
  assert.equal(perfil.status, 201, JSON.stringify(perfil.json));
  await chamar("/api/usuarios", {
    metodo: "POST", token: admin.token,
    corpo: { nome: "Carla Coordenadora", email: "carla@demo.com.br", perfilId: perfil.json.dados.id, senha: "Mapa do tesouro 77" },
  });
  const carla = await entrar("carla@demo.com.br", "Mapa do tesouro 77");

  const promoverSe = await chamar("/api/usuarios", {
    metodo: "POST", token: carla.token,
    corpo: { nome: "Cúmplice", email: "cumplice@demo.com.br", perfilId: "ADMINISTRADOR_GERAL", senha: "Pedra e cal 12345" },
  });
  assert.equal(promoverSe.status, 403);
  assert.match(promoverSe.json.erro, /acesso total/);

  const folha = await chamar("/api/usuarios", {
    metodo: "POST", token: carla.token,
    corpo: { nome: "Analista DP", email: "dp@demo.com.br", perfilId: "ANALISTA_DP", senha: "Pedra e cal 12345" },
  });
  assert.equal(folha.status, 403, "Carla não tem folha; não pode conceder folha");

  const ok = await chamar("/api/usuarios", {
    metodo: "POST", token: carla.token,
    corpo: { nome: "Novo Recrutador", email: "novo@demo.com.br", perfilId: "RECRUTADOR", senha: "Pedra e cal 12345" },
  });
  assert.equal(ok.status, 201, JSON.stringify(ok.json));

  const perfilSuper = await chamar("/api/perfis", { metodo: "POST", token: carla.token, corpo: { nome: "Super", niveis: { folha: 4 } } });
  assert.equal(perfilSuper.status, 403, "criar perfil exige configurar a administração");
});

test("perfis padrão são imutáveis e perfil personalizado não tem acesso total", async () => {
  const admin = await entrar("admin@demo.com.br", SENHA_ADMIN);
  const alterarPadrao = await chamar("/api/perfis/RECRUTADOR", { metodo: "PATCH", token: admin.token, corpo: { niveis: { folha: 4 } } });
  assert.equal(alterarPadrao.status, 400);
  const total = await chamar("/api/perfis", { metodo: "POST", token: admin.token, corpo: { nome: "Quase admin", acessoTotal: true, niveis: { folha: 1 } } });
  assert.equal(total.status, 400);
  assert.match(total.json.erro, /exclusivo do perfil Administrador geral/);
  const lista = (await chamar("/api/perfis", { token: admin.token })).json.dados.itens;
  assert.ok(lista.some((p) => p.id === "ADMINISTRADOR_GERAL" && p.acessoTotal));
});

test("a empresa não fica sem Administrador geral", async () => {
  const admin = await entrar("admin@demo.com.br", SENHA_ADMIN);
  const r = await chamar(`/api/usuarios/${admin.usuario.id}`, { metodo: "PATCH", token: admin.token, corpo: { ativo: false } });
  assert.equal(r.status, 400);
  assert.match(r.json.erro, /ao menos um Administrador geral/);
});

test("desativar o usuário derruba a sessão dele na hora", async () => {
  const admin = await entrar("admin@demo.com.br", SENHA_ADMIN);
  const criado = await chamar("/api/usuarios", {
    metodo: "POST", token: admin.token,
    corpo: { nome: "Temporario Acesso", email: "tmp@demo.com.br", perfilId: "CONSULTA", senha: "Lua cheia em junho" },
  });
  const tmp = await entrar("tmp@demo.com.br", "Lua cheia em junho");
  assert.equal((await chamar("/api/vagas", { token: tmp.token })).status, 200);
  await chamar(`/api/usuarios/${criado.json.dados.id}`, { metodo: "PATCH", token: admin.token, corpo: { ativo: false } });
  assert.equal((await chamar("/api/vagas", { token: tmp.token })).status, 401);
  const denovo = await chamar("/api/auth/entrar", { metodo: "POST", corpo: { empresa: TENANT_DEMO, email: "tmp@demo.com.br", senha: "Lua cheia em junho" } });
  assert.equal(denovo.status, 401);
});

test("cinco senhas erradas bloqueiam por 15 minutos, mesmo com a senha certa", async () => {
  const admin = await entrar("admin@demo.com.br", SENHA_ADMIN);
  await chamar("/api/usuarios", {
    metodo: "POST", token: admin.token,
    corpo: { nome: "Bruno Bloqueado", email: "bruno@demo.com.br", perfilId: "CONSULTA", senha: "Rio que corre 2026" },
  });
  for (let i = 0; i < 5; i += 1) {
    await chamar("/api/auth/entrar", { metodo: "POST", corpo: { empresa: TENANT_DEMO, email: "bruno@demo.com.br", senha: "errada errada" } });
  }
  const bloqueado = await chamar("/api/auth/entrar", { metodo: "POST", corpo: { empresa: TENANT_DEMO, email: "bruno@demo.com.br", senha: "Rio que corre 2026" } });
  assert.equal(bloqueado.status, 429);

  relogio = new Date(relogio.getTime() + 16 * 60_000);
  const liberado = await chamar("/api/auth/entrar", { metodo: "POST", corpo: { empresa: TENANT_DEMO, email: "bruno@demo.com.br", senha: "Rio que corre 2026" } });
  assert.equal(liberado.status, 200);
});

test("sessão expira em 12 horas e sair invalida o token", async () => {
  const s1 = await entrar("admin@demo.com.br", SENHA_ADMIN);
  relogio = new Date(relogio.getTime() + 13 * 3_600_000);
  assert.equal((await chamar("/api/vagas", { token: s1.token })).status, 401);

  const s2 = await entrar("admin@demo.com.br", SENHA_ADMIN);
  assert.equal((await chamar("/api/auth/sair", { metodo: "POST", token: s2.token })).status, 200);
  assert.equal((await chamar("/api/vagas", { token: s2.token })).status, 401);
});

test("troca da própria senha confere a atual e aplica a política", async () => {
  const admin = await entrar("admin@demo.com.br", SENHA_ADMIN);
  await chamar("/api/usuarios", {
    metodo: "POST", token: admin.token,
    corpo: { nome: "Sofia Duarte", email: "sofia@demo.com.br", perfilId: "CONSULTA", senha: "Primeira senha forte 1" },
  });
  const sofia = await entrar("sofia@demo.com.br", "Primeira senha forte 1");
  const errada = await chamar("/api/auth/senha", { metodo: "POST", token: sofia.token, corpo: { senhaAtual: "nao e esta", novaSenha: "Outra senha forte 22" } });
  assert.equal(errada.status, 400);
  const fraca = await chamar("/api/auth/senha", { metodo: "POST", token: sofia.token, corpo: { senhaAtual: "Primeira senha forte 1", novaSenha: "1234567890" } });
  assert.equal(fraca.status, 400);
  const ok = await chamar("/api/auth/senha", { metodo: "POST", token: sofia.token, corpo: { senhaAtual: "Primeira senha forte 1", novaSenha: "Outra senha forte 22" } });
  assert.equal(ok.status, 200);
  const nova = await entrar("sofia@demo.com.br", "Outra senha forte 22");
  assert.equal(nova.usuario.trocarSenha, false);
});

test("auditoria registra logins, falhas e alterações de acesso", async () => {
  const admin = await entrar("admin@demo.com.br", SENHA_ADMIN);
  const eventos = (await chamar("/api/auditoria", { token: admin.token })).json.dados.itens.map((e) => e.evento);
  for (const evento of ["LOGIN_OK", "LOGIN_FALHA", "LOGIN_BLOQUEADO", "USUARIO_CRIADO", "USUARIO_ALTERADO", "PERFIL_CRIADO", "LOGOUT", "SENHA_ALTERADA"]) {
    assert.ok(eventos.includes(evento), `faltou ${evento}`);
  }
});
