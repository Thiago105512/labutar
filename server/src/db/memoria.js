import { aplicarFiltro, exigirId, exigirTenant, ErroNaoEncontrado } from "./guard.js";
import {
  caminhoColecao,
  juntarCaminho,
  prefixoDoTenant,
  tenantDoCaminho,
} from "./caminho.js";

/**
 * Driver padrão. Existe para o produto rodar sem nada provisionado: sem
 * Firebase, sem npm install, sem rede. Não sobrevive a restart e não é
 * seguro para produção — o driver Firestore assume assim que houver credencial.
 *
 * Espelha exatamente o layout de caminhos do Firestore, para que trocar de
 * driver não mude o formato de nada.
 */
export function criarRepositorioMemoria({ raiz = "labutar" } = {}) {
  const armazenamento = new Map();

  const chave = (tenantId, colecao) => juntarCaminho(caminhoColecao(tenantId, colecao, raiz));

  function mapaGravacao(tenantId, colecao) {
    const k = chave(tenantId, colecao);
    if (!armazenamento.has(k)) armazenamento.set(k, new Map());
    return armazenamento.get(k);
  }

  /**
   * Leitura nunca cria entrada. Sem isso, consultar um tenant inexistente
   * passava a listá-lo em `tenants()` — e `removerTenant` deixava de ser
   * verificável, porque a própria conferência recriava o que foi apagado.
   */
  function mapaLeitura(tenantId, colecao) {
    return armazenamento.get(chave(tenantId, colecao)) ?? new Map();
  }

  function caminho(documento, campo) {
    return String(campo)
      .split(".")
      .reduce((acc, parte) => (acc == null ? acc : acc[parte]), documento);
  }

  return {
    nome: "memoria",
    persistente: false,
    raiz,

    async inserir(tenantId, colecao, documento) {
      exigirTenant(tenantId);
      const id = exigirId(documento?.id);
      const mapa = mapaGravacao(tenantId, colecao);
      if (mapa.has(id)) {
        const erro = new Error(`${colecao}/${id} já existe`);
        erro.status = 409;
        throw erro;
      }
      mapa.set(id, structuredClone(documento));
      return structuredClone(documento);
    },

    async obter(tenantId, colecao, id) {
      exigirTenant(tenantId);
      exigirId(id);
      const documento = mapaLeitura(tenantId, colecao).get(id);
      return documento ? structuredClone(documento) : null;
    },

    async listar(tenantId, colecao, filtro = {}, { ordenarPor, limite, iniciarEm = 0 } = {}) {
      exigirTenant(tenantId);
      let itens = [...mapaLeitura(tenantId, colecao).values()].filter((d) => aplicarFiltro(d, filtro));

      if (ordenarPor) {
        const [campo, direcao] = String(ordenarPor).split(":");
        const sinal = direcao === "desc" ? -1 : 1;
        itens.sort((a, b) => {
          const va = caminho(a, campo);
          const vb = caminho(b, campo);
          if (va === vb) return 0;
          return (va > vb ? 1 : -1) * sinal;
        });
      }

      const total = itens.length;
      if (iniciarEm) itens = itens.slice(iniciarEm);
      if (limite) itens = itens.slice(0, limite);

      return { itens: itens.map((item) => structuredClone(item)), total, retornados: itens.length };
    },

    async atualizar(tenantId, colecao, id, patch) {
      exigirTenant(tenantId);
      exigirId(id);
      const atual = mapaLeitura(tenantId, colecao).get(id);
      if (!atual) throw new ErroNaoEncontrado(`${colecao}/${id} não encontrado`);

      const atualizado = { ...atual, ...structuredClone(patch), id };
      mapaGravacao(tenantId, colecao).set(id, atualizado);
      return structuredClone(atualizado);
    },

    async remover(tenantId, colecao, id) {
      exigirTenant(tenantId);
      exigirId(id);
      return mapaLeitura(tenantId, colecao).delete(id);
    },

    async contar(tenantId, colecao, filtro = {}) {
      exigirTenant(tenantId);
      return [...mapaLeitura(tenantId, colecao).values()].filter((d) => aplicarFiltro(d, filtro)).length;
    },

    /** LGPD art. 18, VI — eliminação de todos os dados de um titular no tenant. */
    async removerTenant(tenantId) {
      exigirTenant(tenantId);
      const prefixo = prefixoDoTenant(tenantId, raiz);
      let removidas = 0;
      for (const k of [...armazenamento.keys()]) {
        if (k.startsWith(prefixo)) {
          armazenamento.delete(k);
          removidas += 1;
        }
      }
      return { tenantId, colecoesRemovidas: removidas };
    },

    /** Só para teste e seed: enumera tenants com dado gravado, sem expor conteúdo. */
    tenants() {
      const encontrados = new Set();
      for (const k of armazenamento.keys()) {
        const tenant = tenantDoCaminho(k, raiz);
        if (tenant) encontrados.add(tenant);
      }
      return [...encontrados].sort();
    },
  };
}
