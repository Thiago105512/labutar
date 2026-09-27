/**
 * Roteador mínimo sobre node:http. Express seria mais confortável, mas cada
 * dependência a menos é uma superfície de supply-chain a menos num produto que
 * vai guardar currículo e ASO.
 */
export function criarRoteador() {
  const rotas = [];

  function registrar(metodo, caminho, handler) {
    const segmentos = String(caminho).split("/").filter((s) => s !== "");
    rotas.push({ metodo, segmentos, handler, caminho });
    return api;
  }

  function casar(rota, segmentos) {
    if (rota.segmentos.length !== segmentos.length) return null;
    const params = {};
    for (let i = 0; i < rota.segmentos.length; i++) {
      const esperado = rota.segmentos[i];
      const recebido = decodeURIComponent(segmentos[i]);
      if (esperado.startsWith(":")) {
        params[esperado.slice(1)] = recebido;
      } else if (esperado !== recebido) {
        return null;
      }
    }
    return params;
  }

  const api = {
    get: (c, h) => registrar("GET", c, h),
    post: (c, h) => registrar("POST", c, h),
    put: (c, h) => registrar("PUT", c, h),
    patch: (c, h) => registrar("PATCH", c, h),
    delete: (c, h) => registrar("DELETE", c, h),

    /** Retorna a rota casada ou null. Não responde — quem responde é o app. */
    resolver(metodo, caminho) {
      const segmentos = String(caminho).split("?")[0].split("/").filter((s) => s !== "");
      let caminhoExistente = false;

      for (const rota of rotas) {
        const params = casar(rota, segmentos);
        if (!params) continue;
        caminhoExistente = true;
        if (rota.metodo === metodo) return { handler: rota.handler, params, caminho: rota.caminho };
      }
      // caminho existe mas o verbo não: 405, não 404 — 404 esconderia um bug do cliente
      return caminhoExistente ? { metodoNaoPermitido: true } : null;
    },

    rotas() {
      return rotas.map((r) => `${r.metodo} ${r.caminho}`);
    },
  };

  return api;
}
