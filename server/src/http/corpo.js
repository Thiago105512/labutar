const ORIGENS_PERMITIDAS = [/^https:\/\/([a-z0-9-]+\.)*labutar\.com\.br$/i, /^http:\/\/localhost(:\d+)?$/i, /^http:\/\/127\.0\.0\.1(:\d+)?$/i];

export function origemPermitida(origem) {
  if (!origem) return null;
  return ORIGENS_PERMITIDAS.some((padrao) => padrao.test(origem)) ? origem : null;
}

/**
 * Espelha a origem somente se ela estiver na lista. `*` com credencial não
 * funciona e sem credencial abre o endpoint para qualquer site.
 */
export function cabecalhosCors(req) {
  const origem = origemPermitida(req.headers?.origin);
  if (!origem) return {};
  return {
    "Access-Control-Allow-Origin": origem,
    "Access-Control-Allow-Headers": "Content-Type, X-Labutar-Tenant, X-Labutar-Usuario, X-Labutar-Papel",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export const LIMITE_CORPO_BYTES = 1_048_576;

/**
 * Lê o corpo com teto de tamanho. Sem limite, um POST de 2 GB derruba o
 * processo — e este servidor vai receber currículo em JSON.
 */
export function lerCorpo(req, limite = LIMITE_CORPO_BYTES) {
  return new Promise((resolver, rejeitar) => {
    const pedacos = [];
    let tamanho = 0;

    req.on("data", (pedaco) => {
      tamanho += pedaco.length;
      if (tamanho > limite) {
        // Não destruir a socket: o cliente precisa receber o 400. Destruir aqui
        // fazia o `fetch` do outro lado falhar com erro de rede em vez de ler
        // a resposta, e um erro de rede não diz "seu corpo é grande demais".
        rejeitar(Object.assign(new Error(`corpo acima de ${limite} bytes`), { status: 400, codigo: "CORPO_INVALIDO" }));
        req.pause();
        return;
      }
      pedacos.push(pedaco);
    });
    req.on("end", () => {
      if (!pedacos.length) return resolver(null);
      const texto = Buffer.concat(pedacos).toString("utf8");
      if (!texto.trim()) return resolver(null);
      try {
        resolver(JSON.parse(texto));
      } catch {
        rejeitar(new SyntaxError("JSON inválido"));
      }
    });
    req.on("error", rejeitar);
  });
}
