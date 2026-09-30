import { exigirTenant } from "../db/guard.js";
import { erroNaoAutenticado, erroSemPermissao, ErroApi, CODIGOS } from "../http/resposta.js";
import {
  MODULOS,
  NOME_ACAO,
  acessoEfetivo,
  perfilPadrao,
  pode,
} from "../../../packages/acesso/src/index.js";

/**
 * Papéis do modo de identidade por cabeçalho (só desenvolvimento e testes),
 * traduzidos para perfis reais — a checagem de permissão é a mesma nos dois modos.
 */
export const PAPEL_PARA_PERFIL = Object.freeze({
  admin: "ADMINISTRADOR_GERAL",
  recrutador: "RECRUTADOR",
  gestor: "CONSULTA",
  entrevistador: "CONSULTA",
});
export const PAPEIS = Object.freeze(Object.keys(PAPEL_PARA_PERFIL));

function tokenDoCabecalho(req) {
  const valor = String(req.headers?.authorization ?? "");
  return valor.toLowerCase().startsWith("bearer ") ? valor.slice(7).trim() : null;
}

/**
 * Resolve quem está chamando.
 *
 * 1. `Authorization: Bearer <token>` → sessão real. Tenant, usuário e acesso
 *    vêm SÓ da sessão; cabeçalhos X-Labutar-* são ignorados. Token inválido
 *    ou expirado é 401 — nunca cai para o modo por cabeçalho.
 * 2. Sem token e com `permitirIdentidadePorCabecalho` (padrão fora de
 *    produção): identidade declarada em cabeçalho, para testes e
 *    desenvolvimento. Continua passando pela mesma checagem de permissão.
 * 3. Sem token e sem o modo acima: só o tenant (para rotas públicas, como o
 *    portal de vagas); qualquer rota interna responde 401.
 */
export async function resolverContexto(req, { acesso: servicoAcesso, config = {} } = {}) {
  const cabecalhos = req.headers ?? {};
  const url = new URL(req.url ?? "/", "http://interno");
  const query = Object.fromEntries(url.searchParams);
  const tenantDeclarado = (cabecalhos["x-labutar-tenant"] ?? url.searchParams.get("tenant") ?? "").trim() || null;

  const token = tokenDoCabecalho(req);
  if (token) {
    const sessao = servicoAcesso ? await servicoAcesso.resolverSessao(token) : null;
    if (!sessao) throw new ErroApi(401, CODIGOS.NAO_AUTENTICADO, "sessão inválida ou expirada; entre novamente");
    return {
      tenant: sessao.tenant,
      usuario: sessao.usuario.id,
      usuarioDados: sessao.usuario,
      tipoConta: sessao.usuario.tipo ?? "INTERNO",
      escopo: sessao.usuario.escopo ?? {},
      sessaoId: sessao.sessao.id,
      acesso: sessao.acesso,
      query,
      stub: false,
    };
  }

  if (config.permitirIdentidadePorCabecalho !== false) {
    const usuario = (cabecalhos["x-labutar-usuario"] ?? "").trim() || null;
    const papelBruto = (cabecalhos["x-labutar-papel"] ?? "recrutador").trim().toLowerCase();
    const papel = PAPEIS.includes(papelBruto) ? papelBruto : "recrutador";
    const acesso = usuario ? acessoEfetivo({ ativo: true }, perfilPadrao(PAPEL_PARA_PERFIL[papel])) : null;
    return { tenant: tenantDeclarado, usuario, papel, acesso, tipoConta: "INTERNO", query, stub: true };
  }

  return { tenant: tenantDeclarado, usuario: null, acesso: null, query, stub: false };
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

/**
 * Rotas de portal: exige conta do tipo indicado e devolve o escopo dela.
 * Toda consulta do portal filtra por esse escopo — nunca por id vindo da URL.
 */
export function exigirConta(ctx, tipo) {
  exigirUsuario(ctx);
  if (ctx.tipoConta !== tipo) throw erroSemPermissao("esta área não é do seu tipo de conta");
  return { tenant: ctx.tenant, escopo: ctx.escopo ?? {}, usuario: ctx.usuarioDados };
}

/** A checagem que toda rota interna faz: usuário autenticado com a ação liberada no módulo. */
export function exigirPermissao(ctx, modulo, acao) {
  exigirUsuario(ctx);
  if (ctx.tipoConta !== "INTERNO") throw erroSemPermissao("esta área é da equipe da empresa; use o seu portal");
  if (!pode(ctx.acesso, modulo, acao)) {
    const nomeModulo = MODULOS.find((m) => m.id === modulo)?.nome ?? modulo;
    throw erroSemPermissao(`seu perfil não permite "${NOME_ACAO[acao] ?? acao}" em ${nomeModulo}`);
  }
  return ctx.tenant;
}

export function avisosDeSeguranca(config = {}) {
  if (config.permitirIdentidadePorCabecalho === false) return [];
  return [
    "Identidade por cabeçalho HTTP ATIVA (X-Labutar-Usuario/Papel) — modo de desenvolvimento e testes.",
    "Qualquer cliente pode se declarar administrador nesse modo. Em produção ele fica desligado por padrão (LABUTAR_IDENTIDADE_POR_CABECALHO).",
  ];
}
