import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { criarAplicacao } from "../src/app.js";
import { criarRepositorioMemoria } from "../src/db/index.js";
import { TENANT_DEMO } from "../src/seed/dados.js";
import { semearFolha } from "../src/seed/folha.js";

const SENHA = "Castelo de areia 2026";
let base, fechar, admin, dp, comercial;

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
  for (const [email, perfilId] of [["dp@demo.com.br", "ANALISTA_DP"], ["com@demo.com.br", "COMERCIAL"]]) {
    await chamar("/api/usuarios", { metodo: "POST", token: admin, corpo: { nome: `Pessoa ${perfilId}`, email, senha: SENHA, perfilId, trocarSenha: false } });
  }
  dp = await entrar("dp@demo.com.br");
  comercial = await entrar("com@demo.com.br");
});
after(() => fechar());

let tomadorId, postoTemp;

test("tomador, contrato temporário e posto", async () => {
  const t = await chamar("/api/tomadores", { metodo: "POST", token: admin, corpo: { cnpj: "12.ABC.345/01DE-35", razaoSocial: "Indústria Alfa Numérica S.A.", municipio: "Manaus", uf: "am" } });
  assert.equal(t.status, 201, JSON.stringify(t.json));
  tomadorId = t.json.dados.id;
  assert.equal((await chamar("/api/tomadores", { metodo: "POST", token: admin, corpo: { cnpj: "12ABC34501DE35", razaoSocial: "Duplicado S.A.", municipio: "Manaus", uf: "AM" } })).status, 409);
  const semMotivo = await chamar(`/api/tomadores/${tomadorId}/contratos`, { metodo: "POST", token: admin, corpo: { tipo: "TRABALHO_TEMPORARIO", inicio: "2026-09-01", fim: "2027-02-28" } });
  assert.equal(semMotivo.status, 400);
  const c = await chamar(`/api/tomadores/${tomadorId}/contratos`, { metodo: "POST", token: admin, corpo: { tipo: "TRABALHO_TEMPORARIO", inicio: "2026-09-01", fim: "2027-02-28", hipotese: "DEMANDA_COMPLEMENTAR", justificativa: "Pedido extra de fim de ano" } });
  assert.equal(c.status, 201, JSON.stringify(c.json));
  const p = await chamar(`/api/contratos/${c.json.dados.id}/postos`, { metodo: "POST", token: admin, corpo: { funcao: "Montador", cbo: "784205", vagas: 5, salarioReferencia: 200_000, insalubridadeGrau: 20 } });
  assert.equal(p.status, 201, JSON.stringify(p.json));
  postoTemp = p.json.dados.id;
  const det = await chamar(`/api/tomadores/${tomadorId}`, { token: admin });
  assert.equal(det.json.dados.contratos[0].postos[0].funcao, "Montador");
  assert.equal((await chamar("/api/tomadores", { metodo: "POST", token: comercial, corpo: { cnpj: "11222333000181", razaoSocial: "X S.A.", municipio: "Manaus", uf: "AM" } })).status, 403);
});

test("admissão de temporário: matrícula nova, regras da Lei 6.019 e entra na folha", async () => {
  const baixo = await chamar("/api/colaboradores", { metodo: "POST", token: dp, corpo: { pessoa: { nome: "Nova Pessoa Teste" }, vinculo: { tipo: "TEMPORARIO", admissao: "2026-09-14", salario: 190_000, postoId: postoTemp, temporario: { fimPrevisto: "2026-12-31" } } } });
  assert.equal(baixo.status, 400);
  assert.match(baixo.json.erro, /remuneração equivalente/);
  const ok = await chamar("/api/colaboradores", { metodo: "POST", token: dp, corpo: { pessoa: { nome: "Nova Pessoa Teste", cpf: "529.982.247-25" }, vinculo: { tipo: "TEMPORARIO", admissao: "2026-09-14", salario: 200_000, postoId: postoTemp, temporario: { fimPrevisto: "2026-12-31" } } } });
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  const { matricula } = ok.json.dados.vinculo;
  assert.match(matricula, /^2\d{7}$/);
  const outraPessoa = await chamar("/api/colaboradores", { metodo: "POST", token: dp, corpo: { pessoa: { nome: "Outra Pessoa Qualquer", cpf: "52998224725" }, vinculo: { tipo: "PROPRIO", admissao: "2026-09-14", salario: 300_000, setor: "ADM" } } });
  assert.equal(outraPessoa.status, 409);

  const folha = (await chamar("/api/folha/2026-09", { token: admin })).json.dados;
  const h = folha.holerites.find((x) => x.colaborador.matricula === matricula);
  assert.ok(h, "o admitido entra na folha da competência");
  assert.equal(h.detalhe.diasDeContrato, 17);
  assert.ok(h.itens.some((i) => i.codigo === "1202.01"), "insalubridade vem do posto");
  assert.equal(h.colaborador.cpf, "52998224725");
});

test("reajuste salarial com vigência e lista de colaboradores", async () => {
  const lista = (await chamar("/api/colaboradores", { token: dp })).json.dados;
  const alvo = lista.itens.find((v) => v.tipo === "PROPRIO");
  const r = await chamar(`/api/colaboradores/${alvo.matricula}/salario`, { metodo: "POST", token: dp, corpo: { desde: "2026-09-01", valor: alvo.salario + 20_000, motivo: "Promoção" } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const folha = (await chamar("/api/folha/2026-09", { token: admin })).json.dados;
  assert.equal(folha.holerites.find((h) => h.colaborador.matricula === alvo.matricula).itens.find((i) => i.codigo === "1000.01").valor, alvo.salario + 20_000);
  assert.ok(lista.totais.semCPF > 0);
  assert.equal((await chamar(`/api/colaboradores/${alvo.matricula}/salario`, { metodo: "POST", token: dp, corpo: { desde: "2026-09-01", valor: 50_000, motivo: "x" } })).status, 400);
});

test("importação: mostra antes, grava só no confirmar", async () => {
  const planilha = [
    "matricula_anterior;nome;cpf;vinculo;admissao;cargo;salario;dependentes_ir;tomador_cnpj;setor",
    "005857;Caio Exemplo Nery;;Temporário;22/09/2026;Montador;2.000,00;1;12.ABC.345/01DE-35;",
    "005900;Posto Inexistente Silva;;Temporário;22/09/2026;Soldador;2.000,00;0;12ABC34501DE35;",
    "000010;Ana Exemplo Lima;;Próprio;01/02/2022;Analista de DP;4.800,00;0;;ADM",
  ].join("\n");
  const previa = await chamar("/api/colaboradores/importar", { metodo: "POST", token: dp, corpo: { planilha } });
  assert.equal(previa.status, 200);
  assert.equal(previa.json.dados.confirmado, false);
  assert.equal(previa.json.dados.prontas.length, 2);
  assert.match(previa.json.dados.erros[0].erros[0], /sem posto "Soldador"/);
  const antes = (await chamar("/api/colaboradores", { token: dp })).json.dados.itens.length;
  const ok = await chamar("/api/colaboradores/importar", { metodo: "POST", token: dp, corpo: { planilha, confirmar: true } });
  assert.equal(ok.json.dados.gravados, 2);
  const depois = (await chamar("/api/colaboradores", { token: dp })).json.dados.itens;
  assert.equal(depois.length, antes + 2);
  assert.equal(depois.find((v) => v.matriculaAnterior === "005857").dependentesIRImportados, 1);
});
