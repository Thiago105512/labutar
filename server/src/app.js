import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registrarRotas } from "./rotas.js";
import { registrarRotasPublicas } from "./rotas-publicas.js";
import { resolverContexto } from "./middleware/contexto.js";
import { registrarRotasAcesso } from "./rotas-acesso.js";
import { registrarRotasPortal } from "./rotas-portal.js";
import { registrarRotasFolha } from "./rotas-folha.js";
import { registrarRotasCadastro } from "./rotas-cadastro.js";
import { criarServicoAcesso } from "./auth/servico.js";
import { cabecalhosCors, lerCorpo } from "./http/corpo.js";
import { responderErro, falha, CODIGOS } from "./http/resposta.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
// server/src → server → raiz do repositório. Um nível a mais aqui resolve para
// o diretório do usuário, o que além de quebrar o import map do front-end
// (que pede /packages/...) deixaria a guarda anti-travessia comparando com
// raízes que não são as do projeto.
const RAIZ_REPO = path.resolve(AQUI, "../..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

const CABECALHOS_SEGURANCA = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "geolocation=(), payment=(), interest-cohort=()",
});

/**
 * Serve `web/` na raiz e `packages/` para o import map do front-end.
 * Só essas duas árvores e só essas extensões — o resto do monorepo (docs,
 * node_modules, .git) não é alcançável por HTTP.
 */
const ARVORES_PERMITIDAS = ["web", "packages"];

async function servirEstatico(req, res, caminhoUrl) {
  const limpo = decodeURIComponent(caminhoUrl.split("?")[0]);
  const relativo = limpo === "/" ? "web/index.html" : limpo.replace(/^\/+/, "");
  const primeira = relativo.split("/")[0];

  if (!ARVORES_PERMITIDAS.includes(primeira) && relativo !== "web/index.html") {
    return false;
  }

  const absoluto = path.resolve(RAIZ_REPO, relativo);
  const raizWeb = path.resolve(RAIZ_REPO, "web");
  const raizPkg = path.resolve(RAIZ_REPO, "packages");
  const dentroDe = (p) => absoluto === p || absoluto.startsWith(p + path.sep);
  if (!dentroDe(raizWeb) && !dentroDe(raizPkg)) return false;

  const extensao = path.extname(absoluto).toLowerCase();
  if (!MIME[extensao]) return false;

  try {
    const info = await stat(absoluto);
    if (!info.isFile()) return false;
    res.writeHead(200, {
      "Content-Type": MIME[extensao],
      "Content-Length": info.size,
      // API e app mudam durante desenvolvimento; cache longo só atrapalha
      "Cache-Control": extensao === ".html" ? "no-cache" : "public, max-age=300",
      ...CABECALHOS_SEGURANCA,
    });
    createReadStream(absoluto).pipe(res);
    return true;
  } catch {
    return false;
  }
}

export async function criarAplicacao({ config = {}, repo, log = () => {}, limiteCorpoBytes, acesso } = {}) {
  const servicoAcesso = acesso ?? criarServicoAcesso({ repo });
  const internas = registrarRotas({ repo, log });
  registrarRotasAcesso(internas, { acesso: servicoAcesso });
  registrarRotasPortal(internas, { repo, acesso: servicoAcesso });
  registrarRotasFolha(internas, { repo });
  registrarRotasCadastro(internas, { repo });
  const publicas = registrarRotasPublicas({ repo, log });

  async function handler(req, res) {
    const cors = cabecalhosCors(req);
    const url = new URL(req.url ?? "/", "http://interno");

    // Centralizado de propósito: passar CORS como argumento para cada rota
    // dependia de a rota lembrar de usar, e nenhuma usava. Aqui é impossível
    // esquecer, inclusive nos caminhos de erro.
    for (const [chave, valor] of Object.entries(cors)) res.setHeader(chave, valor);
    for (const [chave, valor] of Object.entries(CABECALHOS_SEGURANCA)) res.setHeader(chave, valor);

    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...cors, ...CABECALHOS_SEGURANCA });
      return res.end();
    }

    try {
      if (!url.pathname.startsWith("/api/")) {
        if (await servirEstatico(req, res, url.pathname)) return undefined;
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8", ...cors });
        res.end(JSON.stringify({ ok: false, erro: "não encontrado", codigo: CODIGOS.NAO_ENCONTRADO, detalhes: null }));
        return undefined;
      }

      const roteador = url.pathname.startsWith("/api/publico/") ? publicas : internas;
      const rota = roteador.resolver(req.method, url.pathname);

      if (!rota) {
        falha(res, 404, CODIGOS.NAO_ENCONTRADO, "rota não encontrada", null, cors);
        return undefined;
      }
      if (rota.metodoNaoPermitido) {
        res.writeHead(405, { Allow: "GET, POST, PATCH, PUT, DELETE, OPTIONS", ...cors, "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, erro: "método não permitido para esta rota", codigo: "METODO_NAO_PERMITIDO", detalhes: null }));
        return undefined;
      }

      const ctx = await resolverContexto(req, { acesso: servicoAcesso, config });
      ctx.userAgent = req.headers["user-agent"] ?? null;
      ctx.params = rota.params;
      ctx.ip = (req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket?.remoteAddress || null;

      const corpo = ["POST", "PATCH", "PUT"].includes(req.method)
        ? await lerCorpo(req, limiteCorpoBytes)
        : null;
      await rota.handler(req, res, ctx, corpo, cors);
      return undefined;
    } catch (erro) {
      if (!res.headersSent) responderErro(res, erro, { log });
      else {
        log(erro);
        try { res.end(); } catch { /* conexão já encerrada */ }
      }
      return undefined;
    }
  }

  return { handler, internas, publicas, repo, config, acesso: servicoAcesso };
}
