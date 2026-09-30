import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { criarRepositorioMemoria, ErroEscopo, ErroNaoEncontrado } from "../src/db/index.js";
import { carregarConfig } from "../src/config.js";
import { verificarPapel, aplicarMigracoes } from "../src/db/postgres.js";
import { urlDeTeste } from "./auxiliar-pg.js";

/**
 * Contrato de repositório: o mesmo comportamento vale para todo driver.
 * Memória roda sempre. PostgreSQL roda quando LABUTAR_TESTE_PG_URL aponta
 * para um banco de teste descartável, com usuário SEM superusuário e SEM
 * BYPASSRLS — do contrário o teste de RLS passaria sem provar nada.
 */
const URL_PG = await urlDeTeste("teste_repositorio");
const SEM_PG = URL_PG ? false : "LABUTAR_TESTE_PG_URL não definida";

async function carregarPg() {
  return (await import("pg")).default;
}

async function limparBanco() {
  const pg = await carregarPg();
  const cliente = new pg.Client({ connectionString: URL_PG });
  await cliente.connect();
  try {
    await cliente.query("TRUNCATE labutar_documentos, labutar_tenants");
  } finally {
    await cliente.end();
  }
}

const drivers = [
  { nome: "memoria", skip: false, criar: async () => criarRepositorioMemoria(), limpar: async () => {} },
  {
    nome: "postgres",
    skip: SEM_PG,
    criar: async () => {
      const { criarRepositorioPostgres } = await import("../src/db/postgres.js");
      return criarRepositorioPostgres({ url: URL_PG });
    },
    limpar: limparBanco,
  },
];

for (const driver of drivers) {
  describe(`contrato do repositório — ${driver.nome}`, { skip: driver.skip }, () => {
    let repo;

    before(async () => {
      repo = await driver.criar();
    });
    after(async () => {
      await repo?.encerrar();
    });
    beforeEach(async () => {
      await driver.limpar();
      if (driver.nome === "memoria") repo = await driver.criar();
    });

    test("insere, obtém, atualiza e remove", async () => {
      await repo.inserir("acme", "vagas", { id: "VAGA_1", titulo: "Operador", status: "RASCUNHO" });
      assert.deepEqual(await repo.obter("acme", "vagas", "VAGA_1"), {
        id: "VAGA_1",
        titulo: "Operador",
        status: "RASCUNHO",
      });

      const atualizado = await repo.atualizar("acme", "vagas", "VAGA_1", { status: "ABERTA", id: "OUTRO" });
      assert.equal(atualizado.status, "ABERTA");
      assert.equal(atualizado.titulo, "Operador", "mescla rasa preserva campos não enviados");
      assert.equal(atualizado.id, "VAGA_1", "patch não troca o id");

      assert.equal(await repo.remover("acme", "vagas", "VAGA_1"), true);
      assert.equal(await repo.remover("acme", "vagas", "VAGA_1"), false);
      assert.equal(await repo.obter("acme", "vagas", "VAGA_1"), null);
    });

    test("id duplicado no mesmo tenant conflita com 409", async () => {
      await repo.inserir("acme", "vagas", { id: "VAGA_1" });
      await assert.rejects(() => repo.inserir("acme", "vagas", { id: "VAGA_1" }), (e) => e.status === 409);
    });

    test("atualizar inexistente lança 404", async () => {
      await assert.rejects(() => repo.atualizar("acme", "vagas", "NADA", { a: 1 }), ErroNaoEncontrado);
    });

    test("o mesmo id em tenants diferentes são documentos diferentes", async () => {
      await repo.inserir("acme", "vagas", { id: "VAGA_1", dono: "acme" });
      await repo.inserir("globex", "vagas", { id: "VAGA_1", dono: "globex" });
      assert.equal((await repo.obter("acme", "vagas", "VAGA_1")).dono, "acme");
      assert.equal((await repo.obter("globex", "vagas", "VAGA_1")).dono, "globex");
    });

    test("listar e contar nunca vazam documento de outro tenant", async () => {
      await repo.inserir("acme", "candidatos", { id: "C1" });
      await repo.inserir("globex", "candidatos", { id: "C2" });
      const { itens } = await repo.listar("acme", "candidatos");
      assert.deepEqual(itens.map((d) => d.id), ["C1"]);
      assert.equal(await repo.contar("globex", "candidatos"), 1);
    });

    test("filtra, ordena, pagina e reporta o total antes da paginação", async () => {
      for (const [id, score, cidade] of [
        ["C1", 70, "Campinas"],
        ["C2", 90, "São Paulo"],
        ["C3", 50, "Santos"],
        ["C4", 80, "São Paulo"],
      ]) {
        await repo.inserir("acme", "candidatos", { id, score, endereco: { cidade } });
      }

      const pagina = await repo.listar(
        "acme",
        "candidatos",
        { score: { maiorQue: 60 } },
        { ordenarPor: "score:desc", limite: 2, iniciarEm: 1 }
      );
      assert.equal(pagina.total, 3);
      assert.deepEqual(pagina.itens.map((d) => d.id), ["C4", "C1"]);

      const porCidade = await repo.listar("acme", "candidatos", { "endereco.cidade": { contem: "são" } });
      assert.deepEqual(porCidade.itens.map((d) => d.id).sort(), ["C2", "C4"]);
      assert.equal(await repo.contar("acme", "candidatos", { id: { in: ["C1", "C3"] } }), 2);
    });

    test("subcoleção isola por documento pai", async () => {
      await repo.inserir("acme", "vagas/VAGA_1/candidaturas", { id: "CT1" });
      await repo.inserir("acme", "vagas/VAGA_2/candidaturas", { id: "CT2" });
      const { itens } = await repo.listar("acme", "vagas/VAGA_1/candidaturas");
      assert.deepEqual(itens.map((d) => d.id), ["CT1"]);
    });

    test("operação sem tenant é recusada antes de tocar o banco", async () => {
      await assert.rejects(() => repo.inserir("", "vagas", { id: "V" }), ErroEscopo);
      await assert.rejects(() => repo.listar(undefined, "vagas"), ErroEscopo);
      await assert.rejects(() => repo.removerTenant(""), ErroEscopo);
    });

    test("removerTenant apaga todas as coleções do tenant, e só dele", async () => {
      await repo.inserir("acme", "vagas", { id: "V1" });
      await repo.inserir("acme", "vagas/V1/candidaturas", { id: "CT1" });
      await repo.inserir("globex", "vagas", { id: "V9" });

      const resultado = await repo.removerTenant("acme");
      assert.deepEqual(resultado, { tenantId: "acme", colecoesRemovidas: 2 });
      assert.equal(await repo.contar("acme", "vagas"), 0);
      assert.equal(await repo.contar("acme", "vagas/V1/candidaturas"), 0);
      assert.equal(await repo.contar("globex", "vagas"), 1);
      assert.deepEqual(await repo.tenants(), ["globex"]);
    });

    test("leitura não registra tenant inexistente", async () => {
      await repo.inserir("acme", "vagas", { id: "V1" });
      await repo.listar("fantasma", "vagas");
      await repo.obter("fantasma", "vagas", "X");
      assert.deepEqual(await repo.tenants(), ["acme"]);
    });
  });
}

describe("PostgreSQL — isolamento no próprio banco (RLS)", { skip: SEM_PG }, () => {
  let repo;
  let cliente;

  before(async () => {
    const { criarRepositorioPostgres } = await import("../src/db/postgres.js");
    repo = await criarRepositorioPostgres({ url: URL_PG });
    const pg = await carregarPg();
    cliente = new pg.Client({ connectionString: URL_PG });
    await cliente.connect();
  });
  after(async () => {
    await cliente?.end();
    await repo?.encerrar();
  });
  beforeEach(limparBanco);

  test("sem tenant declarado, o banco não devolve nenhuma linha", async () => {
    await repo.inserir("acme", "vagas", { id: "V1" });
    const { rows } = await cliente.query("SELECT * FROM labutar_documentos");
    assert.equal(rows.length, 0);
  });

  test("consulta sem WHERE, com tenant declarado, só vê o próprio tenant", async () => {
    await repo.inserir("acme", "vagas", { id: "V1" });
    await repo.inserir("globex", "vagas", { id: "V2" });
    await cliente.query("BEGIN");
    try {
      await cliente.query("SELECT set_config('labutar.tenant_id', 'acme', true)");
      const { rows } = await cliente.query("SELECT tenant_id, id FROM labutar_documentos");
      assert.deepEqual(rows, [{ tenant_id: "acme", id: "V1" }]);
    } finally {
      await cliente.query("ROLLBACK");
    }
  });

  test("gravar linha de outro tenant é recusado pelo banco", async () => {
    await cliente.query("BEGIN");
    try {
      await cliente.query("SELECT set_config('labutar.tenant_id', 'acme', true)");
      await assert.rejects(
        () =>
          cliente.query(
            "INSERT INTO labutar_documentos (tenant_id, colecao, id, dados) VALUES ('globex', 'vagas', 'X', '{}')"
          ),
        /row-level security/
      );
    } finally {
      await cliente.query("ROLLBACK");
    }
  });

  test("migrações são idempotentes", async () => {
    const pg = await carregarPg();
    const pool = new pg.Pool({ connectionString: URL_PG });
    try {
      assert.deepEqual(await aplicarMigracoes(pool), []);
    } finally {
      await pool.end();
    }
  });
});

test("verificarPapel recusa superusuário e BYPASSRLS", async () => {
  const pool = (papel) => ({ query: async () => ({ rows: [papel] }) });
  await assert.rejects(() => verificarPapel(pool({ rolsuper: true, rolbypassrls: false })), /PAPEL_INSEGURO|superusuário/);
  await assert.rejects(() => verificarPapel(pool({ rolsuper: false, rolbypassrls: true })), /BYPASSRLS/);
  await verificarPapel(pool({ rolsuper: false, rolbypassrls: false }));
});

test("driver postgres exige LABUTAR_DATABASE_URL na configuração", () => {
  assert.throws(() => carregarConfig({ LABUTAR_DB_DRIVER: "postgres" }), /LABUTAR_DATABASE_URL/);
  const config = carregarConfig({ LABUTAR_DB_DRIVER: "postgres", LABUTAR_DATABASE_URL: "postgres://x" });
  assert.equal(config.driver, "postgres");
  assert.equal(config.urlBanco, "postgres://x");
});
