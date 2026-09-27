import { exigirId, exigirTenant, ErroValidacao } from "./guard.js";

/**
 * Layout físico dos dados do Labutar dentro do Firestore.
 *
 * Firestore não tem pasta: a hierarquia é coleção → documento → subcoleção.
 * O que parece pasta aqui é essa alternância. Tudo do Labutar vive sob uma
 * única raiz, o que dá duas propriedades de graça:
 *
 *   1. Um só bloco de regras cobre o produto inteiro
 *      (`match /labutar/{document=**}`), sem risco de esbarrar no ruleset de
 *      outro produto que divida o banco.
 *   2. Nenhum caminho existe sem o tenant no meio — vazar dado de uma empresa
 *      para outra exige construir o caminho errado, não esquecer um filtro.
 *
 *   labutar/tenants/{tenantId}/vagas/{vagaId}
 *   labutar/tenants/{tenantId}/vagas/{vagaId}/candidaturas/{candidaturaId}
 *   labutar/tenants/{tenantId}/candidatos/{candidatoId}
 */
export const RAIZ_PADRAO = "labutar";
export const COLECAO_TENANTS = "tenants";

const SEGMENTO_VALIDO = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

/**
 * Caminho de coleção tem número ÍMPAR de segmentos (coleção/doc/subcoleção).
 * Aceita "vagas" e "vagas/VAGA_1/candidaturas"; recusa "vagas/VAGA_1".
 */
export function segmentosDeColecao(colecao) {
  const partes = String(colecao ?? "")
    .split("/")
    .filter((p) => p !== "");

  if (partes.length === 0) throw new ErroValidacao("caminho de coleção vazio");
  if (partes.length % 2 === 0) {
    throw new ErroValidacao(
      `caminho de coleção precisa de número ímpar de segmentos, veio ${partes.length}: "${colecao}"`
    );
  }
  for (const parte of partes) {
    if (!SEGMENTO_VALIDO.test(parte)) {
      throw new ErroValidacao(`segmento de caminho inválido: "${parte}"`);
    }
  }
  return partes;
}

export function caminhoColecao(tenantId, colecao, raiz = RAIZ_PADRAO) {
  exigirTenant(tenantId);
  if (!SEGMENTO_VALIDO.test(String(raiz))) throw new ErroValidacao(`raiz inválida: "${raiz}"`);
  return [raiz, COLECAO_TENANTS, tenantId, ...segmentosDeColecao(colecao)];
}

export function caminhoDocumento(tenantId, colecao, id, raiz = RAIZ_PADRAO) {
  return [...caminhoColecao(tenantId, colecao, raiz), exigirId(id)];
}

export const juntarCaminho = (segmentos) => segmentos.join("/");

/** Inverso de `caminhoColecao`: usado pelo driver de memória para listar e apagar por tenant. */
export function prefixoDoTenant(tenantId, raiz = RAIZ_PADRAO) {
  exigirTenant(tenantId);
  return `${raiz}/${COLECAO_TENANTS}/${tenantId}/`;
}

export function tenantDoCaminho(caminho, raiz = RAIZ_PADRAO) {
  const partes = String(caminho).split("/");
  if (partes[0] !== raiz || partes[1] !== COLECAO_TENANTS) return null;
  return partes[2] ?? null;
}
