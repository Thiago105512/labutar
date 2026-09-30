import { ACOES, MODULOS, NIVEIS, NOME_ACAO } from "../../packages/acesso/src/index.js";
import { sucesso, erroValidacao, erroNaoAutenticado } from "./http/resposta.js";
import { exigirPermissao, exigirUsuario } from "./middleware/contexto.js";

/**
 * Rotas de login e de administração de acessos. Registradas no roteador
 * interno: usam o mesmo contexto e o mesmo tratamento de erro das demais.
 */
export function registrarRotasAcesso(r, { acesso }) {
  // ------------------------------------------------------------ sessão

  r.post("/api/auth/entrar", async (req, res, ctx, corpo) => {
    const empresa = String(corpo?.empresa ?? ctx.tenant ?? "").trim().toLowerCase();
    if (!corpo?.email || !corpo?.senha) throw erroValidacao("informe e-mail e senha", ["email", "senha"]);
    const resultado = await acesso.entrar({
      tenant: empresa, email: corpo.email, senha: corpo.senha, tipo: corpo.tipo ?? "INTERNO", ip: ctx.ip, userAgent: ctx.userAgent,
    });
    sucesso(res, resultado);
  });

  r.post("/api/auth/sair", async (req, res, ctx) => {
    if (!ctx.sessaoId) throw erroNaoAutenticado();
    await acesso.sair(ctx.tenant, ctx.sessaoId, ctx.usuario);
    sucesso(res, { saiu: true });
  });

  r.get("/api/auth/eu", async (req, res, ctx) => {
    exigirUsuario(ctx);
    if (!ctx.usuarioDados) throw erroNaoAutenticado();
    sucesso(res, await acesso.perfilDoUsuario(ctx.tenant, ctx.usuarioDados));
  });

  r.post("/api/auth/senha", async (req, res, ctx, corpo) => {
    exigirUsuario(ctx);
    if (!ctx.usuarioDados) throw erroNaoAutenticado();
    await acesso.trocarPropriaSenha(ctx.tenant, ctx.usuario, corpo ?? {});
    sucesso(res, { alterada: true });
  });

  // ------------------------------------------------------------ catálogo

  r.get("/api/acesso/catalogo", async (req, res, ctx) => {
    exigirUsuario(ctx);
    sucesso(res, {
      modulos: MODULOS,
      niveis: NIVEIS,
      acoes: Object.entries(ACOES).map(([id, nivelMinimo]) => ({ id, nome: NOME_ACAO[id], nivelMinimo })),
    });
  });

  // ------------------------------------------------------------ usuários

  const ator = (ctx) => ({ atorAcesso: ctx.acesso, atorId: ctx.usuario });

  r.get("/api/usuarios", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "administracao", "ver");
    sucesso(res, { itens: await acesso.listarUsuarios(tenant) });
  });

  r.post("/api/usuarios", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "administracao", "criar");
    sucesso(res, await acesso.criarUsuario(tenant, corpo ?? {}, ator(ctx)), 201);
  });

  r.patch("/api/usuarios/:id", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "administracao", "editar");
    sucesso(res, await acesso.atualizarUsuario(tenant, ctx.params.id, corpo ?? {}, ator(ctx)));
  });

  r.post("/api/usuarios/:id/senha", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "administracao", "editar");
    await acesso.redefinirSenha(tenant, ctx.params.id, corpo ?? {}, ator(ctx));
    sucesso(res, { redefinida: true });
  });

  // ------------------------------------------------------------ perfis

  r.get("/api/perfis", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "administracao", "ver");
    sucesso(res, { itens: await acesso.perfisDoTenant(tenant) });
  });

  r.post("/api/perfis", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "administracao", "configurar");
    sucesso(res, await acesso.salvarPerfil(tenant, corpo ?? {}, ator(ctx)), 201);
  });

  r.patch("/api/perfis/:id", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "administracao", "configurar");
    sucesso(res, await acesso.salvarPerfil(tenant, corpo ?? {}, { ...ator(ctx), id: ctx.params.id }));
  });

  // ------------------------------------------------------------ auditoria

  r.get("/api/auditoria", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "administracao", "ver");
    sucesso(res, { itens: await acesso.listarAuditoria(tenant, { limite: 200 }) });
  });

  return r;
}
