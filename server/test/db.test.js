import test from "node:test";
import assert from "node:assert/strict";

import { criarRepositorio, criarRepositorioMemoria } from "../src/db/index.js";
import { ErroEscopo, ErroNaoEncontrado, ErroValidacao, aplicarFiltro, exigirTenant } from "../src/db/guard.js";
import { carregarConfig, avisosDeRisco } from "../src/config.js";

test("driver padrão é memória e não exige firebase-admin", async () => {
  const repo = await criarRepositorio(carregarConfig({}));
  assert.equal(repo.nome, "memoria");
  assert.equal(repo.persistente, false);
});

test("driver inválido é rejeitado na configuração", () => {
  assert.throws(() => carregarConfig({ LABUTAR_DB_DRIVER: "mysql" }), /LABUTAR_DB_DRIVER inválido/);
});

test("a fronteira de escopo recusa operação sem tenant", async () => {
  const repo = criarRepositorioMemoria();
  for (const vazio of [undefined, null, ""]) {
    await assert.rejects(() => repo.inserir(vazio, "vagas", { id: "V1" }), ErroEscopo);
    await assert.rejects(() => repo.listar(vazio, "vagas"), ErroEscopo);
  }
  assert.throws(() => exigirTenant("ab"), ErroEscopo);
  assert.equal(exigirTenant("acme-rh"), "acme-rh");
});

test("tenantId mal formado é recusado, não apenas ausente", () => {
  for (const invalido of ["A", "ab", "com espaço", "com_underscore", "-inicio", "fim-", "x".repeat(80)]) {
    assert.throws(() => exigirTenant(invalido), ErroEscopo, `${invalido} deveria ser recusado`);
  }
});

test("nome de coleção inválido é recusado", async () => {
  const repo = criarRepositorioMemoria();
  await assert.rejects(() => repo.listar("acme", "1comeca-com-numero"), ErroValidacao);
  await assert.rejects(() => repo.listar("acme", "tem espaço"), ErroValidacao);
  await assert.rejects(() => repo.listar("acme", ""), ErroValidacao);
});

test("CRUD básico com id gerado pelo domínio", async () => {
  const repo = criarRepositorioMemoria();
  const inserido = await repo.inserir("acme", "vagas", { id: "VAGA_1", titulo: "Analista", status: "ABERTA" });
  assert.equal(inserido.titulo, "Analista");

  const obtido = await repo.obter("acme", "vagas", "VAGA_1");
  assert.equal(obtido.id, "VAGA_1");
  assert.equal(await repo.obter("acme", "vagas", "VAGA_2"), null);

  const atualizado = await repo.atualizar("acme", "vagas", "VAGA_1", { status: "PAUSADA" });
  assert.equal(atualizado.status, "PAUSADA");
  assert.equal(atualizado.titulo, "Analista");
  assert.equal(atualizado.id, "VAGA_1");

  assert.equal(await repo.remover("acme", "vagas", "VAGA_1"), true);
  assert.equal(await repo.obter("acme", "vagas", "VAGA_1"), null);
});

test("atualizar documento inexistente lança 404", async () => {
  const repo = criarRepositorioMemoria();
  await assert.rejects(() => repo.atualizar("acme", "vagas", "NAO_EXISTE", { x: 1 }), ErroNaoEncontrado);
});

test("inserir id duplicado no mesmo tenant conflita", async () => {
  const repo = criarRepositorioMemoria();
  await repo.inserir("acme", "vagas", { id: "VAGA_1" });
  await assert.rejects(() => repo.inserir("acme", "vagas", { id: "VAGA_1" }), /já existe/);
});

test("o mesmo id em tenants diferentes são documentos diferentes", async () => {
  const repo = criarRepositorioMemoria();
  await repo.inserir("acme", "vagas", { id: "VAGA_1", titulo: "da Acme" });
  await repo.inserir("globex", "vagas", { id: "VAGA_1", titulo: "da Globex" });

  assert.equal((await repo.obter("acme", "vagas", "VAGA_1")).titulo, "da Acme");
  assert.equal((await repo.obter("globex", "vagas", "VAGA_1")).titulo, "da Globex");
  assert.equal(await repo.contar("acme", "vagas"), 1);
  assert.equal(await repo.contar("globex", "vagas"), 1);
});

test("listar nunca vaza documento de outro tenant", async () => {
  const repo = criarRepositorioMemoria();
  await repo.inserir("acme", "candidatos", { id: "C1", cidade: "São Paulo" });
  await repo.inserir("acme", "candidatos", { id: "C2", cidade: "Manaus" });
  await repo.inserir("globex", "candidatos", { id: "C3", cidade: "Manaus" });

  const manaus = await repo.listar("acme", "candidatos", { cidade: "Manaus" });
  assert.deepEqual(manaus.itens.map((c) => c.id), ["C2"]);
  assert.equal(manaus.total, 1);

  const todas = await repo.listar("globex", "candidatos");
  assert.deepEqual(todas.itens.map((c) => c.id), ["C3"]);
});

test("documentos devolvidos são cópia: mutação externa não corrompe o repositório", async () => {
  const repo = criarRepositorioMemoria();
  await repo.inserir("acme", "vagas", { id: "V1", titulo: "Original", etapas: [{ id: "e1" }] });

  const lido = await repo.obter("acme", "vagas", "V1");
  lido.titulo = "Adulterado";
  lido.etapas.push({ id: "e2" });

  const relido = await repo.obter("acme", "vagas", "V1");
  assert.equal(relido.titulo, "Original");
  assert.equal(relido.etapas.length, 1);
});

test("listar ordena, pagina e reporta o total antes da paginação", async () => {
  const repo = criarRepositorioMemoria();
  for (const [id, score] of [["A", 90], ["B", 70], ["C", 80]]) {
    await repo.inserir("acme", "candidaturas", { id, score });
  }

  const asc = await repo.listar("acme", "candidaturas", {}, { ordenarPor: "score" });
  assert.deepEqual(asc.itens.map((c) => c.id), ["B", "C", "A"]);

  const desc = await repo.listar("acme", "candidaturas", {}, { ordenarPor: "score:desc" });
  assert.deepEqual(desc.itens.map((c) => c.id), ["A", "C", "B"]);

  const pagina = await repo.listar("acme", "candidaturas", {}, { ordenarPor: "score:desc", limite: 2 });
  assert.deepEqual(pagina.itens.map((c) => c.id), ["A", "C"]);
  assert.equal(pagina.total, 3);
  assert.equal(pagina.retornados, 2);

  const segunda = await repo.listar("acme", "candidaturas", {}, { ordenarPor: "score:desc", limite: 2, iniciarEm: 2 });
  assert.deepEqual(segunda.itens.map((c) => c.id), ["B"]);
});

test("aplicarFiltro cobre igualdade, in, comparação, substring e caminho aninhado", () => {
  const doc = { status: "ABERTA", score: 75, origem: { canal: "LINKEDIN" } };

  assert.equal(aplicarFiltro(doc, { status: "ABERTA" }), true);
  assert.equal(aplicarFiltro(doc, { status: "PAUSADA" }), false);
  assert.equal(aplicarFiltro(doc, { status: { in: ["ABERTA", "PAUSADA"] } }), true);
  assert.equal(aplicarFiltro(doc, { score: { maiorQue: 70 } }), true);
  assert.equal(aplicarFiltro(doc, { score: { menorQue: 70 } }), false);
  assert.equal(aplicarFiltro(doc, { status: { contem: "aber" } }), true);
  assert.equal(aplicarFiltro(doc, { "origem.canal": "LINKEDIN" }), true);
  assert.equal(aplicarFiltro(doc, { "origem.inexistente": "x" }), false);
  assert.equal(aplicarFiltro(doc, {}), true);
});

test("removerTenant apaga todas as coleções daquele tenant e só dele", async () => {
  const repo = criarRepositorioMemoria();
  await repo.inserir("acme", "vagas", { id: "V1" });
  await repo.inserir("acme", "candidatos", { id: "C1" });
  await repo.inserir("globex", "vagas", { id: "V1" });

  const resultado = await repo.removerTenant("acme");
  assert.equal(resultado.colecoesRemovidas, 2);
  assert.equal(await repo.contar("acme", "vagas"), 0);
  assert.equal(await repo.contar("acme", "candidatos"), 0);
  assert.equal(await repo.contar("globex", "vagas"), 1);
  assert.deepEqual(repo.tenants(), ["globex"]);
});

test("removerTenant também passa pela fronteira de escopo", async () => {
  const repo = criarRepositorioMemoria();
  await assert.rejects(() => repo.removerTenant(""), ErroEscopo);
});

test("leitura não cria entrada: consultar tenant inexistente não o registra", async () => {
  const repo = criarRepositorioMemoria();
  await repo.inserir("acme", "vagas", { id: "V1" });

  assert.equal(await repo.obter("fantasma", "vagas", "V1"), null);
  assert.deepEqual((await repo.listar("fantasma", "vagas")).itens, []);
  assert.equal(await repo.contar("fantasma", "vagas"), 0);
  assert.equal(await repo.remover("fantasma", "vagas", "V1"), false);
  await assert.rejects(() => repo.atualizar("fantasma", "vagas", "V1", { x: 1 }), ErroNaoEncontrado);

  assert.deepEqual(repo.tenants(), ["acme"]);
});

test("removerTenant é verificável: a conferência posterior não ressuscita o tenant", async () => {
  const repo = criarRepositorioMemoria();
  await repo.inserir("acme", "vagas", { id: "V1" });
  await repo.inserir("globex", "vagas", { id: "V1" });

  await repo.removerTenant("acme");
  assert.equal(await repo.contar("acme", "vagas"), 0);
  assert.equal(await repo.obter("acme", "vagas", "V1"), null);
  assert.deepEqual(repo.tenants(), ["globex"]);
});

test("configuração expõe os dois mecanismos de isolamento", () => {
  const config = carregarConfig({
    LABUTAR_DB_DRIVER: "firestore",
    LABUTAR_FIREBASE_PROJECT: "pedtudo-app",
    LABUTAR_FIREBASE_DATABASE: "labutar",
    LABUTAR_COLECAO_PREFIXO: "labutar_",
  });

  assert.equal(config.driver, "firestore");
  assert.equal(config.projetoFirebase, "pedtudo-app");
  assert.equal(config.databaseId, "labutar");
  assert.equal(config.prefixoColecao, "labutar_");
});

test("padrão de configuração aponta para pedtudo-app com prefixo labutar_", () => {
  const config = carregarConfig({});
  assert.equal(config.projetoFirebase, "pedtudo-app");
  assert.equal(config.databaseId, "(default)");
  assert.equal(config.prefixoColecao, "labutar_");
});

test("aviso de risco dispara ao mirar o (default) de projeto compartilhado", () => {
  const arriscado = carregarConfig({ LABUTAR_DB_DRIVER: "firestore" });
  const avisos = avisosDeRisco(arriscado);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /ruleset do Firestore é UM SÓ por banco/);
  assert.match(avisos[0], /pedtudo-app/);
});

test("banco nomeado não dispara o aviso de ruleset compartilhado", () => {
  const isolado = carregarConfig({ LABUTAR_DB_DRIVER: "firestore", LABUTAR_FIREBASE_DATABASE: "labutar" });
  assert.deepEqual(avisosDeRisco(isolado), []);
});

test("driver de memória nunca dispara aviso de risco", () => {
  assert.deepEqual(avisosDeRisco(carregarConfig({})), []);
});

test("prefixo vazio é sinalizado", () => {
  const config = carregarConfig({ LABUTAR_DB_DRIVER: "firestore", LABUTAR_FIREBASE_DATABASE: "labutar", LABUTAR_COLECAO_PREFIXO: "" });
  assert.equal(avisosDeRisco(config).length, 1);
  assert.match(avisosDeRisco(config)[0], /prefixo/i);
});

test("driver Firestore falha com instrução clara quando firebase-admin falta", async () => {
  const { criarRepositorioFirestore } = await import("../src/db/firestore.js");
  await assert.rejects(
    () => criarRepositorioFirestore({ projeto: "pedtudo-app" }),
    (erro) => {
      assert.equal(erro.code, "DEPENDENCIA_AUSENTE");
      assert.match(erro.message, /npm install firebase-admin/);
      assert.match(erro.message, /LABUTAR_DB_DRIVER=memoria/);
      return true;
    }
  );
});
