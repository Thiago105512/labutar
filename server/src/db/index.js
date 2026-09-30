import { criarRepositorioMemoria } from "./memoria.js";

export { criarRepositorioMemoria } from "./memoria.js";
export { criarRepositorioFirestore } from "./firestore.js";
export { criarRepositorioPostgres } from "./postgres.js";
export * from "./guard.js";
export * from "./caminho.js";

/**
 * Memória é o padrão deliberado: o produto sobe e é testável sem banco
 * provisionado, sem credencial e sem `npm install`. PostgreSQL é o banco de
 * produção (docs/10-decisao-postgresql.md); Firestore fica até a troca.
 */
export async function criarRepositorio(config) {
  if (config.driver === "postgres") {
    const { criarRepositorioPostgres } = await import("./postgres.js");
    return criarRepositorioPostgres({ url: config.urlBanco });
  }
  if (config.driver === "firestore") {
    const { criarRepositorioFirestore } = await import("./firestore.js");
    return criarRepositorioFirestore({
      projeto: config.projetoFirebase,
      databaseId: config.databaseId,
      raiz: config.raizColecao,
      credenciais: config.credenciais,
    });
  }
  return criarRepositorioMemoria({ raiz: config.raizColecao });
}
