import test from "node:test";
import assert from "node:assert/strict";

import { criarRepositorio, criarRepositorioMemoria } from "../src/db/index.js";
import {
  caminhoColecao,
  caminhoDocumento,
  juntarCaminho,
  prefixoDoTenant,
  tenantDoCaminho,
  segmentosDeColecao,
} from "../src/db/caminho.js";
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

test("configuração expõe raiz, projeto e banco", () => {
  const config = carregarConfig({
    LABUTAR_DB_DRIVER: "firestore",
    LABUTAR_FIREBASE_PROJECT: "pedtudo-app",
    LABUTAR_FIREBASE_DATABASE: "labutar",
    LABUTAR_COLECAO_RAIZ: "labutar",
  });

  assert.equal(config.driver, "firestore");
  assert.equal(config.projetoFirebase, "pedtudo-app");
  assert.equal(config.databaseId, "labutar");
  assert.equal(config.raizColecao, "labutar");
});

test("padrão: driver memória, projeto labutar, banco (default), raiz labutar", () => {
  const config = carregarConfig({});
  assert.equal(config.driver, "memoria");
  assert.equal(config.projetoFirebase, "labutar");
  assert.equal(config.databaseId, "(default)");
  assert.equal(config.raizColecao, "labutar");
});

test("aviso de risco dispara ao mirar o (default), mesmo em projeto dedicado", () => {
  const avisos = avisosDeRisco(carregarConfig({ LABUTAR_DB_DRIVER: "firestore" }));
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /labutar/);
  // as três consequências verificadas na documentação oficial têm de aparecer
  assert.match(avisos[0], /cota e nível gratuito são POR PROJETO/);
  assert.match(avisos[0], /UM banco sem custo por projeto/);
  assert.match(avisos[0], /não há como escopar a chave/);
});

test("banco nomeado não dispara o aviso de banco compartilhado", () => {
  const isolado = carregarConfig({ LABUTAR_DB_DRIVER: "firestore", LABUTAR_FIREBASE_DATABASE: "labutar" });
  assert.deepEqual(avisosDeRisco(isolado), []);
});

test("driver de memória nunca dispara aviso de risco", () => {
  assert.deepEqual(avisosDeRisco(carregarConfig({})), []);
});

test("raiz vazia é sinalizada", () => {
  const config = carregarConfig({
    LABUTAR_DB_DRIVER: "firestore",
    LABUTAR_FIREBASE_DATABASE: "labutar",
    LABUTAR_COLECAO_RAIZ: "",
  });
  assert.equal(avisosDeRisco(config).length, 1);
  assert.match(avisosDeRisco(config)[0], /LABUTAR_COLECAO_RAIZ vazia/);
});

/**
 * O caminho "dependência ausente" só é alcançável quando firebase-admin NÃO
 * está instalado. Como o estado do node_modules muda (outra sessão instalou a
 * 14.5.0 em 2026-09-27 e quebrou esta suíte), os dois cenários são testados com
 * skip condicional em vez de assumir o ambiente.
 */
const TEM_FIREBASE_ADMIN = await (async () => {
  try {
    await import("firebase-admin/app");
    return true;
  } catch {
    return false;
  }
})();

test("driver Firestore falha com instrução clara quando firebase-admin falta", {
  skip: TEM_FIREBASE_ADMIN && "firebase-admin instalado: caminho de dependência ausente inalcançável",
}, async () => {
  const { criarRepositorioFirestore } = await import("../src/db/firestore.js");
  await assert.rejects(
    () => criarRepositorioFirestore({ projeto: "labutar" }),
    (erro) => {
      assert.equal(erro.code, "DEPENDENCIA_AUSENTE");
      assert.match(erro.message, /npm install firebase-admin/);
      assert.match(erro.message, /LABUTAR_DB_DRIVER=memoria/);
      return true;
    }
  );
});

/**
 * Construir o driver não abre conexão: `initializeApp` e `getFirestore` são
 * preguiçosos. Se este teste travar a suíte, é porque alguma versão do
 * firebase-admin passou a abrir canal na construção — e aí ele deve voltar a
 * ser skipado, não "corrigido" com timeout.
 */
test("driver Firestore expõe a mesma interface do driver de memória", {
  skip: !TEM_FIREBASE_ADMIN && "firebase-admin não instalado",
}, async () => {
  const { criarRepositorioFirestore } = await import("../src/db/firestore.js");
  const repo = await criarRepositorioFirestore({ projeto: "labutar", raiz: "labutar" });

  assert.equal(repo.nome, "firestore");
  assert.equal(repo.persistente, true);
  assert.equal(repo.projeto, "labutar");
  assert.equal(repo.databaseId, "(default)");
  assert.equal(repo.raiz, "labutar");

  const memoria = criarRepositorioMemoria({ raiz: "labutar" });
  for (const metodo of ["inserir", "obter", "listar", "atualizar", "remover", "contar", "removerTenant"]) {
    assert.equal(typeof repo[metodo], "function", `driver Firestore sem ${metodo}`);
    assert.equal(typeof memoria[metodo], "function", `driver memória sem ${metodo}`);
  }

  // removerTenant não pode apagar em lote sem travas: subcoleção exige travessia recursiva
  await assert.rejects(() => repo.removerTenant("acme"), /travessia recursiva/);
});

// ============================================================
// Layout de caminhos — "pastas e subpastas" do Firestore
// ============================================================

test("todo caminho carrega a raiz e o tenant antes de qualquer coleção", () => {
  assert.equal(
    juntarCaminho(caminhoColecao("acme", "vagas")),
    "labutar/tenants/acme/vagas"
  );
  assert.equal(
    juntarCaminho(caminhoDocumento("acme", "vagas", "VAGA_1")),
    "labutar/tenants/acme/vagas/VAGA_1"
  );
});

test("subcoleção aninhada segue a alternância coleção/documento/coleção", () => {
  assert.deepEqual(segmentosDeColecao("vagas/VAGA_1/candidaturas"), ["vagas", "VAGA_1", "candidaturas"]);
  assert.equal(
    juntarCaminho(caminhoColecao("acme", "vagas/VAGA_1/candidaturas")),
    "labutar/tenants/acme/vagas/VAGA_1/candidaturas"
  );
  assert.equal(
    juntarCaminho(caminhoDocumento("acme", "vagas/VAGA_1/candidaturas", "CTDA_9")),
    "labutar/tenants/acme/vagas/VAGA_1/candidaturas/CTDA_9"
  );
});

test("caminho de coleção com número par de segmentos é recusado", () => {
  // "vagas/VAGA_1" é caminho de DOCUMENTO, não de coleção — erro comum e silencioso
  assert.throws(() => segmentosDeColecao("vagas/VAGA_1"), /ímpar/);
  assert.throws(() => segmentosDeColecao("a/b/c/d"), /ímpar/);
  assert.throws(() => segmentosDeColecao(""), /vazio/);
  assert.throws(() => segmentosDeColecao("tem espaço"), /segmento de caminho inválido/);
  assert.throws(() => segmentosDeColecao("1invalida"), /segmento de caminho inválido/);
});

test("a raiz é configurável e vale para os dois drivers", () => {
  assert.equal(juntarCaminho(caminhoColecao("acme", "vagas", "rh360")), "rh360/tenants/acme/vagas");
  assert.throws(() => caminhoColecao("acme", "vagas", "raiz inválida"), /raiz inválida/);

  const repo = criarRepositorioMemoria({ raiz: "rh360" });
  assert.equal(repo.raiz, "rh360");
});

test("prefixoDoTenant e tenantDoCaminho são inversos", () => {
  assert.equal(prefixoDoTenant("acme"), "labutar/tenants/acme/");
  assert.equal(tenantDoCaminho("labutar/tenants/acme/vagas"), "acme");
  assert.equal(tenantDoCaminho("noteped_children"), null);
  assert.equal(tenantDoCaminho("labutar/outracoisa/acme/vagas"), null);
});

test("subcoleção isola por documento pai: candidatura não aparece em outra vaga", async () => {
  const repo = criarRepositorioMemoria();
  await repo.inserir("acme", "vagas", { id: "VAGA_1", titulo: "Operador" });
  await repo.inserir("acme", "vagas", { id: "VAGA_2", titulo: "Inspetor" });
  await repo.inserir("acme", "vagas/VAGA_1/candidaturas", { id: "CTDA_1", score: 90 });
  await repo.inserir("acme", "vagas/VAGA_2/candidaturas", { id: "CTDA_1", score: 40 });

  const daVaga1 = await repo.listar("acme", "vagas/VAGA_1/candidaturas");
  assert.equal(daVaga1.total, 1);
  assert.equal(daVaga1.itens[0].score, 90);

  const daVaga2 = await repo.listar("acme", "vagas/VAGA_2/candidaturas");
  assert.equal(daVaga2.itens[0].score, 40);

  assert.equal((await repo.obter("acme", "vagas/VAGA_1/candidaturas", "CTDA_1")).score, 90);
  assert.equal((await repo.obter("acme", "vagas/VAGA_2/candidaturas", "CTDA_1")).score, 40);
  assert.equal(await repo.obter("acme", "vagas/VAGA_1/candidaturas", "CTDA_2"), null);
});

test("removerTenant apaga também as subcoleções", async () => {
  const repo = criarRepositorioMemoria();
  await repo.inserir("acme", "vagas", { id: "VAGA_1" });
  await repo.inserir("acme", "vagas/VAGA_1/candidaturas", { id: "CTDA_1" });
  await repo.inserir("acme", "candidatos", { id: "CAND_1" });
  await repo.inserir("globex", "vagas", { id: "VAGA_1" });

  const resultado = await repo.removerTenant("acme");
  assert.equal(resultado.colecoesRemovidas, 3);
  assert.equal(await repo.contar("acme", "vagas/VAGA_1/candidaturas"), 0);
  assert.deepEqual(repo.tenants(), ["globex"]);
});

test("tenant continua sendo exigido no caminho aninhado", async () => {
  const repo = criarRepositorioMemoria();
  await assert.rejects(() => repo.listar("", "vagas/VAGA_1/candidaturas"), ErroEscopo);
  await assert.rejects(() => repo.inserir(null, "vagas/VAGA_1/candidaturas", { id: "X" }), ErroEscopo);
});
