import { aplicarFiltro, exigirColecao, exigirId, exigirTenant } from "./guard.js";

/**
 * Driver Firestore. `firebase-admin` é importado de forma preguiçosa: o
 * servidor sobe no driver de memória sem a dependência instalada, e só falha
 * aqui se alguém realmente pedir Firestore.
 *
 * ⚠ NÃO EXERCITADO POR TESTES — `firebase-admin` não está instalado nesta
 * máquina. O que está testado é a composição do nome de coleção e a recusa
 * sem tenant; o caminho de rede precisa ser validado contra um projeto real
 * antes de qualquer uso.
 */
export async function criarRepositorioFirestore({ projeto, databaseId = "(default)", prefixo = "labutar_", credenciais = null } = {}) {
  let admin;
  try {
    admin = await import("firebase-admin/app");
  } catch {
    const erro = new Error(
      "firebase-admin não está instalado. Rode `npm install firebase-admin` no diretório server/ " +
        "ou use LABUTAR_DB_DRIVER=memoria."
    );
    erro.code = "DEPENDENCIA_AUSENTE";
    throw erro;
  }

  const { getFirestore } = await import("firebase-admin/firestore");

  if (!admin.getApps().length) {
    admin.initializeApp(
      credenciais
        ? { credential: admin.cert(JSON.parse(credenciais)), projectId: projeto }
        : { projectId: projeto }
    );
  }

  const firestore =
    databaseId === "(default)" ? getFirestore() : getFirestore(admin.getApp(), databaseId);

  /** O isolamento físico: nenhuma coleção do Labutar existe sem o prefixo. */
  const nomear = (colecao) => `${prefixo}${exigirColecao(colecao)}`;

  return {
    nome: "firestore",
    persistente: true,
    projeto,
    databaseId,
    prefixoColecao: prefixo,

    async inserir(tenantId, colecao, documento) {
      exigirTenant(tenantId);
      const id = exigirId(documento?.id);
      const ref = firestore.collection(nomear(colecao)).doc(`${tenantId}_${id}`);
      await ref.create({ ...documento, tenantId });
      return { ...documento, tenantId };
    },

    async obter(tenantId, colecao, id) {
      exigirTenant(tenantId);
      exigirId(id);
      const snap = await firestore.collection(nomear(colecao)).doc(`${tenantId}_${id}`).get();
      return snap.exists ? snap.data() : null;
    },

    async listar(tenantId, colecao, filtro = {}, { ordenarPor, limite, iniciarEm = 0 } = {}) {
      exigirTenant(tenantId);
      let query = firestore.collection(nomear(colecao)).where("tenantId", "==", tenantId);
      if (limite) query = query.limit(iniciarEm + limite);

      const snap = await query.get();
      let itens = snap.docs.map((d) => d.data()).filter((d) => aplicarFiltro(d, filtro));

      if (ordenarPor) {
        const [campo, direcao] = String(ordenarPor).split(":");
        const sinal = direcao === "desc" ? -1 : 1;
        itens.sort((a, b) => (a[campo] === b[campo] ? 0 : (a[campo] > b[campo] ? 1 : -1) * sinal));
      }

      const total = itens.length;
      if (iniciarEm) itens = itens.slice(iniciarEm);
      return { itens, total, retornados: itens.length };
    },

    async atualizar(tenantId, colecao, id, patch) {
      exigirTenant(tenantId);
      exigirId(id);
      const ref = firestore.collection(nomear(colecao)).doc(`${tenantId}_${id}`);
      await ref.update(patch);
      const snap = await ref.get();
      return snap.data();
    },

    async remover(tenantId, colecao, id) {
      exigirTenant(tenantId);
      exigirId(id);
      await firestore.collection(nomear(colecao)).doc(`${tenantId}_${id}`).delete();
      return true;
    },

    async contar(tenantId, colecao, filtro = {}) {
      const { total } = await this.listar(tenantId, colecao, filtro);
      return total;
    },

    async removerTenant(tenantId) {
      exigirTenant(tenantId);
      throw new Error(
        "removerTenant não está implementado no driver Firestore: apagar em lote num projeto " +
          "compartilhado exige dry-run e confirmação explícita. Use a exportação/anonimização por documento."
      );
    },
  };
}
