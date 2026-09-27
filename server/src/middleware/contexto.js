import { exigirTenant } from "../db/guard.js";
import { erroNaoAutenticado, erroSemPermissao, ErroApi, CODIGOS } from "../http/resposta.js";

export const PAPEIS = Object.freeze(["admin", "recrutador", "gestor", "entrevistador"]);

/**
 * ⚠ STUB DECLARADO — não é autenticação.
 *
 * Identidade e tenant vêm de cabeçalho, o que significa que qualquer cliente
 * pode se declarar admin. Serve para desenvolver o front-end contra a API
 * antes do Firebase Auth existir. `avisosDeSeguranca()` reporta isso e
 * `/api/saude` expõe, para que ninguém confunda este modo com produção.
 *
 * Em produção: tenant sai do subdomínio (resolvido pelo proxy) e a identidade
 * sai do token do Firebase Auth verificado com a chave pública do projeto.
 */
export function resolverContexto(req) {
  const cabecalhos = req.headers ?? {};
  const url = new URL(req.url ?? "/", "http://interno");

  const tenant = (cabecalhos["x-labutar-tenant"] ?? url.searchParams.get("tenant") ?? "").trim() || null;
  const usuario = (cabecalhos["x-labutar-usuario"] ?? "").trim() || null;
  const papelBruto = (cabecalhos["x-labutar-papel"] ?? "recrutador").trim().toLowerCase();
  const papel = PAPEIS.includes(papelBruto) ? papelBruto : "recrutador";

  return { tenant, usuario, papel, query: Object.fromEntries(url.searchParams), stub: true };
}

export function exigirEscopo(ctx) {
  try {
    exigirTenant(ctx.tenant);
  } catch (erro) {
    throw new ErroApi(403, CODIGOS.SEM_ESCOPO, erro.message);
  }
  return ctx.tenant;
}

export function exigirUsuario(ctx) {
  exigirEscopo(ctx);
  if (!ctx.usuario) throw erroNaoAutenticado();
  return ctx.usuario;
}

export function exigirPapel(ctx, ...permitidos) {
  exigirUsuario(ctx);
  if (!permitidos.includes(ctx.papel)) {
    throw erroSemPermissao(`papel "${ctx.papel}" não pode executar esta operação (exige ${permitidos.join(" ou ")})`);
  }
  return ctx.papel;
}

export function avisosDeSeguranca() {
  return [
    "Identidade e tenant vêm de cabeçalho HTTP — STUB de desenvolvimento, não autenticação.",
    "Qualquer cliente pode se declarar admin. Não expor fora de rede local.",
    "Produção exige Firebase Auth verificado no servidor e tenant resolvido por subdomínio.",
  ];
}
