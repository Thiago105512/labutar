import { readdir, readFile } from "node:fs/promises";
import { aplicarFiltro, exigirId, exigirTenant, ErroNaoEncontrado } from "./guard.js";
import { juntarCaminho, segmentosDeColecao } from "./caminho.js";

/**
 * Driver PostgreSQL (docs/10-decisao-postgresql.md).
 *
 * Mesma interface do driver de memória. O isolamento tem duas camadas:
 *   1. toda consulta filtra `tenant_id` explicitamente;
 *   2. Row-Level Security no banco, com o tenant declarado por transação
 *      (`set_config('labutar.tenant_id', ..., true)`). Se a camada 1 for
 *      esquecida um dia, o banco ainda não devolve linha de outro tenant.
 *
 * O usuário da conexão NÃO pode ser superusuário nem ter BYPASSRLS: os dois
 * ignoram RLS. `verificarPapel()` recusa subir nessas condições.
 *
 * Filtro e ordenação rodam em JS com `aplicarFiltro`, igual aos outros
 * drivers, para o resultado ser idêntico. Serve ao volume de documentos do
 * ATS; módulos de volume alto ganham tabelas relacionais próprias.
 *
 * `pg` é dependência opcional, importada só quando este driver é pedido.
 */
export async function criarRepositorioPostgres({ url, migrar = true, permitirSuperusuario = false } = {}) {
  if (!url) {
    throw new Error("LABUTAR_DATABASE_URL ausente: o driver postgres precisa da URL de conexão.");
  }

  let pg;
  try {
    pg = (await import("pg")).default;
  } catch {
    const erro = new Error(
      "pg não está instalado. Rode `npm install` na raiz do repositório ou use LABUTAR_DB_DRIVER=memoria."
    );
    erro.code = "DEPENDENCIA_AUSENTE";
    throw erro;
  }

  const pool = new pg.Pool({ connectionString: url, max: 10 });

  try {
    if (!permitirSuperusuario) await verificarPapel(pool);
    if (migrar) await aplicarMigracoes(pool);
  } catch (erro) {
    await pool.end();
    throw erro;
  }

  const colecaoDe = (colecao) => juntarCaminho(segmentosDeColecao(colecao));

  /** Executa `fn` numa transação com o tenant declarado para o RLS. */
  async function noTenant(tenantId, fn) {
    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      await cliente.query("SELECT set_config('labutar.tenant_id', $1, true)", [tenantId]);
      const resultado = await fn(cliente);
      await cliente.query("COMMIT");
      return resultado;
    } catch (erro) {
      await cliente.query("ROLLBACK").catch(() => {});
      throw erro;
    } finally {
      cliente.release();
    }
  }

  async function documentos(cliente, tenantId, colecao) {
    const { rows } = await cliente.query(
      "SELECT dados FROM labutar_documentos WHERE tenant_id = $1 AND colecao = $2",
      [tenantId, colecao]
    );
    return rows.map((r) => r.dados);
  }

  function valorEm(documento, campo) {
    return String(campo)
      .split(".")
      .reduce((acc, parte) => (acc == null ? acc : acc[parte]), documento);
  }

  return {
    nome: "postgres",
    persistente: true,

    async inserir(tenantId, colecao, documento) {
      exigirTenant(tenantId);
      const id = exigirId(documento?.id);
      const caminho = colecaoDe(colecao);
      return noTenant(tenantId, async (cliente) => {
        const { rowCount } = await cliente.query(
          `INSERT INTO labutar_documentos (tenant_id, colecao, id, dados)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [tenantId, caminho, id, JSON.stringify(documento)]
        );
        if (rowCount === 0) {
          const erro = new Error(`${colecao}/${id} já existe`);
          erro.status = 409;
          throw erro;
        }
        await cliente.query(
          "INSERT INTO labutar_tenants (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING",
          [tenantId]
        );
        return structuredClone(documento);
      });
    },

    async obter(tenantId, colecao, id) {
      exigirTenant(tenantId);
      exigirId(id);
      const caminho = colecaoDe(colecao);
      return noTenant(tenantId, async (cliente) => {
        const { rows } = await cliente.query(
          "SELECT dados FROM labutar_documentos WHERE tenant_id = $1 AND colecao = $2 AND id = $3",
          [tenantId, caminho, id]
        );
        return rows[0]?.dados ?? null;
      });
    },

    async listar(tenantId, colecao, filtro = {}, { ordenarPor, limite, iniciarEm = 0 } = {}) {
      exigirTenant(tenantId);
      const caminho = colecaoDe(colecao);
      let itens = (await noTenant(tenantId, (c) => documentos(c, tenantId, caminho))).filter((d) =>
        aplicarFiltro(d, filtro)
      );

      if (ordenarPor) {
        const [campo, direcao] = String(ordenarPor).split(":");
        const sinal = direcao === "desc" ? -1 : 1;
        itens.sort((a, b) => {
          const va = valorEm(a, campo);
          const vb = valorEm(b, campo);
          if (va === vb) return 0;
          return (va > vb ? 1 : -1) * sinal;
        });
      }

      const total = itens.length;
      if (iniciarEm) itens = itens.slice(iniciarEm);
      if (limite) itens = itens.slice(0, limite);
      return { itens, total, retornados: itens.length };
    },

    /** Mescla rasa, como `{ ...atual, ...patch, id }` no driver de memória. */
    async atualizar(tenantId, colecao, id, patch) {
      exigirTenant(tenantId);
      exigirId(id);
      const caminho = colecaoDe(colecao);
      return noTenant(tenantId, async (cliente) => {
        const { rows } = await cliente.query(
          `UPDATE labutar_documentos
              SET dados = dados || $4::jsonb || jsonb_build_object('id', id::text),
                  atualizado_em = now()
            WHERE tenant_id = $1 AND colecao = $2 AND id = $3
        RETURNING dados`,
          [tenantId, caminho, id, JSON.stringify(patch ?? {})]
        );
        if (rows.length === 0) throw new ErroNaoEncontrado(`${colecao}/${id} não encontrado`);
        return rows[0].dados;
      });
    },

    async remover(tenantId, colecao, id) {
      exigirTenant(tenantId);
      exigirId(id);
      const caminho = colecaoDe(colecao);
      return noTenant(tenantId, async (cliente) => {
        const { rowCount } = await cliente.query(
          "DELETE FROM labutar_documentos WHERE tenant_id = $1 AND colecao = $2 AND id = $3",
          [tenantId, caminho, id]
        );
        return rowCount > 0;
      });
    },

    async contar(tenantId, colecao, filtro = {}) {
      return (await this.listar(tenantId, colecao, filtro)).total;
    },

    /** LGPD art. 18, VI — eliminação de todos os dados do tenant, numa transação. */
    async removerTenant(tenantId) {
      exigirTenant(tenantId);
      return noTenant(tenantId, async (cliente) => {
        const { rows } = await cliente.query(
          "SELECT count(DISTINCT colecao)::int AS n FROM labutar_documentos WHERE tenant_id = $1",
          [tenantId]
        );
        await cliente.query("DELETE FROM labutar_documentos WHERE tenant_id = $1", [tenantId]);
        await cliente.query("DELETE FROM labutar_tenants WHERE tenant_id = $1", [tenantId]);
        return { tenantId, colecoesRemovidas: rows[0].n };
      });
    },

    /** Só para teste e seed: enumera tenants com dado gravado, sem expor conteúdo. */
    async tenants() {
      const { rows } = await pool.query("SELECT tenant_id FROM labutar_tenants ORDER BY tenant_id");
      return rows.map((r) => r.tenant_id);
    },

    async encerrar() {
      await pool.end();
    },
  };
}

/** Superusuário e BYPASSRLS ignoram Row-Level Security: o isolamento viraria só de código. */
export async function verificarPapel(pool) {
  const { rows } = await pool.query(
    "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user"
  );
  const papel = rows[0];
  if (papel?.rolsuper || papel?.rolbypassrls) {
    const erro = new Error(
      "o usuário do banco é superusuário ou tem BYPASSRLS, o que desliga o isolamento por tenant. " +
        "Crie um usuário próprio para a aplicação (NOSUPERUSER NOBYPASSRLS)."
    );
    erro.code = "PAPEL_INSEGURO";
    throw erro;
  }
}

/**
 * Aplica, em ordem, os arquivos de `migracoes/` ainda não registrados.
 * O advisory lock impede duas instâncias subindo juntas de migrar em dobro.
 */
export async function aplicarMigracoes(pool, diretorio = new URL("./migracoes/", import.meta.url)) {
  const arquivos = (await readdir(diretorio)).filter((f) => f.endsWith(".sql")).sort();
  const cliente = await pool.connect();
  const aplicadas = [];
  try {
    await cliente.query("SELECT pg_advisory_lock(hashtext('labutar_migracoes'))");
    await cliente.query(
      `CREATE TABLE IF NOT EXISTS labutar_migracoes (
         nome text PRIMARY KEY,
         aplicada_em timestamptz NOT NULL DEFAULT now()
       )`
    );
    const { rows } = await cliente.query("SELECT nome FROM labutar_migracoes");
    const jaAplicadas = new Set(rows.map((r) => r.nome));

    for (const arquivo of arquivos) {
      if (jaAplicadas.has(arquivo)) continue;
      const sql = await readFile(new URL(arquivo, diretorio), "utf8");
      await cliente.query("BEGIN");
      try {
        await cliente.query(sql);
        await cliente.query("INSERT INTO labutar_migracoes (nome) VALUES ($1)", [arquivo]);
        await cliente.query("COMMIT");
        aplicadas.push(arquivo);
      } catch (erro) {
        await cliente.query("ROLLBACK");
        throw new Error(`migração ${arquivo} falhou: ${erro.message}`, { cause: erro });
      }
    }
  } finally {
    await cliente.query("SELECT pg_advisory_unlock(hashtext('labutar_migracoes'))").catch(() => {});
    cliente.release();
  }
  return aplicadas;
}
