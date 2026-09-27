import { criarRepositorioMemoria } from "./memoria.js";

export { criarRepositorioMemoria } from "./memoria.js";
export { criarRepositorioFirestore } from "./firestore.js";
export * from "./guard.js";
export * from "./caminho.js";

/**
 * Memória é o padrão deliberado: o produto sobe e é testável sem Firebase
 * provisionado, sem credencial e sem `npm install`. Firestore é opt-in.
 */
export async function criarRepositorio(config) {
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
