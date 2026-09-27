import { aplicarFiltro, exigirId, exigirTenant } from "./guard.js";
import { caminhoColecao, caminhoDocumento, juntarCaminho, RAIZ_PADRAO } from "./caminho.js";

/**
 * Driver Firestore. `firebase-admin` é importado de forma preguiçosa: o
 * servidor sobe no driver de memória sem a dependência instalada, e só falha
 * aqui se alguém realmente pedir Firestore.
 *
 * ⚠ NÃO EXERCITADO POR TESTES — `firebase-admin` não está instalado nesta
 * máquina. O que está testado é a composição dos caminhos e a recusa sem
 * tenant; o caminho de rede precisa ser validado contra um projeto real
 * antes de qualquer uso.
 */
export async function criarRepositorioFirestore({
  projeto,
  databaseId = "(default)",
  raiz = RAIZ_PADRAO,
  credenciais = null,
} = {}) {
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

  const firestore = databaseId === "(default)" ? getFirestore() : getFirestore(admin.getApp(), databaseId);

  const colecao = (tenantId, nome) => firestore.collection(juntarCaminho(caminhoColecao(tenantId, nome, raiz)));
  const documento = (tenantId, nome, id) =>
    firestore.doc(juntarCaminho(caminhoDocumento(tenantId, nome, id, raiz)));

  return {
    nome: "firestore",
    persistente: true,
    projeto,
    databaseId,
    raiz,

    async inserir(tenantId, nome, doc) {
      exigirTenant(tenantId);
      const id = exigirId(doc?.id);
      await documento(tenantId, nome, id).create({ ...doc, tenantId });
      return { ...doc, tenantId };
    },

    async obter(tenantId, nome, id) {
      exigirTenant(tenantId);
      exigirId(id);
      const snap = await documento(tenantId, nome, id).get();
      return snap.exists ? snap.data() : null;
    },

    /**
     * Consulta sempre ancorada no tenant: o caminho já contém o escopo, então
     * não existe lista sem filtro de tenant nem por acidente.
     */
    async listar(tenantId, nome, filtro = {}, { ordenarPor, limite, iniciarEm = 0 } = {}) {
      exigirTenant(tenantId);
      let query = colecao(tenantId, nome);
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

    async atualizar(tenantId, nome, id, patch) {
      exigirTenant(tenantId);
      exigirId(id);
      const ref = documento(tenantId, nome, id);
      await ref.update(patch);
      return (await ref.get()).data();
    },

    async remover(tenantId, nome, id) {
      exigirTenant(tenantId);
      exigirId(id);
      await documento(tenantId, nome, id).delete();
      return true;
    },

    async contar(tenantId, nome, filtro = {}) {
      return (await this.listar(tenantId, nome, filtro)).total;
    },

    async removerTenant(tenantId) {
      exigirTenant(tenantId);
      throw new Error(
        "removerTenant não está implementado no driver Firestore: apagar subcoleções em lote exige " +
          "travessia recursiva, dry-run e confirmação explícita. Use a anonimização por documento."
      );
    },
  };
}
