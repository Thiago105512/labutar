import {
  ID_ADMINISTRADOR_GERAL,
  MODULO_GESTOR_DA_CONTA,
  PERFIS_PADRAO,
  TIPO_CONTA,
  pode,
  validarEscopo,
  acessoEfetivo,
  modulosDoUsuario,
  podeConcederAcesso,
  validarPerfilPersonalizado,
  validarSenha,
  verificarAdministradorRestante,
} from "../../../packages/acesso/src/index.js";
import { novoId } from "../../../packages/core/src/ids.js";
import { validarEmail } from "../../../packages/core/src/validacao.js";
import { exigirTenant } from "../db/guard.js";
import { ErroApi, CODIGOS, erroValidacao, erroNaoEncontrado, erroConflito, erroSemPermissao } from "../http/resposta.js";
import { gerarHash, verificarSenha, precisaRehash, hashDeToken, novoSegredo } from "./senhas.js";

export const COLECOES_ACESSO = Object.freeze({
  usuarios: "usuarios",
  perfis: "perfis",
  sessoes: "sessoes",
  auditoria: "auditoria",
});

export const REGRAS_SESSAO = Object.freeze({
  duracaoHoras: 12,
  tentativasAntesDoBloqueio: 5,
  bloqueioMinutos: 15,
});

const C = COLECOES_ACESSO;
const normalizarEmail = (email) => String(email ?? "").trim().toLowerCase();
const tipoDe = (u) => u?.tipo ?? TIPO_CONTA.INTERNO;
/** Ator usado quando o próprio sistema cria a conta (autocadastro do candidato, seed). */
export const ATOR_SISTEMA = Object.freeze({ acessoTotal: true, niveis: {}, sistema: true });
const credenciaisInvalidas = () => new ErroApi(401, CODIGOS.NAO_AUTENTICADO, "e-mail ou senha incorretos");

/** O que sai do servidor sobre um usuário. Hash de senha nunca sai. */
export function usuarioPublico(u) {
  if (!u) return null;
  const { senhaHash, tentativasFalhas, ...resto } = u;
  return resto;
}

/**
 * Serviço de acesso: login, sessões, usuários, perfis e trilha de auditoria.
 * Tudo por tenant — um usuário existe dentro de uma empresa.
 */
export function criarServicoAcesso({ repo, agora = () => new Date(), regras = REGRAS_SESSAO } = {}) {
  // Hash fixo usado quando o e-mail não existe, para o tempo de resposta não
  // revelar quais e-mails têm conta.
  const hashFicticio = gerarHash(novoSegredo());

  async function registrar(tenant, evento, dados = {}) {
    await repo.inserir(tenant, C.auditoria, {
      id: novoId("AUD"),
      evento,
      em: agora().toISOString(),
      ...dados,
    });
  }

  async function perfisDoTenant(tenant) {
    const { itens } = await repo.listar(tenant, C.perfis, {}, { ordenarPor: "nome" });
    return [...PERFIS_PADRAO, ...itens];
  }

  async function perfil(tenant, id) {
    return PERFIS_PADRAO.find((p) => p.id === id) ?? (id ? await repo.obter(tenant, C.perfis, id) : null);
  }

  async function acessoDe(tenant, usuario) {
    if (tipoDe(usuario) !== TIPO_CONTA.INTERNO) return acessoEfetivo(usuario, null);
    return acessoEfetivo(usuario, await perfil(tenant, usuario?.perfilId));
  }

  /** O mesmo e-mail pode ter uma conta de cada tipo (ex.: colaborador que também é candidato). */
  async function usuarioPorEmail(tenant, email, tipo = TIPO_CONTA.INTERNO) {
    const { itens } = await repo.listar(tenant, C.usuarios, { email: normalizarEmail(email) });
    return itens.find((u) => tipoDe(u) === tipo) ?? null;
  }

  async function revogarSessoes(tenant, usuarioId) {
    const { itens } = await repo.listar(tenant, C.sessoes, { usuarioId });
    for (const s of itens) await repo.remover(tenant, C.sessoes, s.id);
    return itens.length;
  }

  async function validarNovaSenha(tenant, senha, usuario) {
    const r = validarSenha(senha, { email: usuario.email, nome: usuario.nome, empresa: tenant });
    if (!r.ok) throw erroValidacao(r.erros[0], r.erros);
  }

  // ------------------------------------------------------------ login

  async function entrar({ tenant, email, senha, tipo = TIPO_CONTA.INTERNO, ip = null, userAgent = null }) {
    if (!Object.values(TIPO_CONTA).includes(tipo)) throw credenciaisInvalidas();
    try {
      exigirTenant(tenant);
    } catch {
      await gerarHash("x"); // mantém o tempo parecido com o caminho normal
      throw credenciaisInvalidas();
    }

    const usuario = await usuarioPorEmail(tenant, email, tipo);
    const momento = agora();

    if (usuario?.bloqueadoAte && usuario.bloqueadoAte > momento.toISOString()) {
      await registrar(tenant, "LOGIN_BLOQUEADO", { usuarioId: usuario.id, ip });
      throw new ErroApi(429, "BLOQUEADO",
        `muitas tentativas incorretas; tente novamente após ${new Date(usuario.bloqueadoAte).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}`);
    }

    const confere = await verificarSenha(String(senha ?? ""), usuario?.senhaHash ?? (await hashFicticio));
    if (!usuario || !confere || !usuario.ativo) {
      if (usuario) {
        const tentativas = (usuario.tentativasFalhas ?? 0) + 1;
        const bloquear = tentativas >= regras.tentativasAntesDoBloqueio;
        await repo.atualizar(tenant, C.usuarios, usuario.id, {
          tentativasFalhas: bloquear ? 0 : tentativas,
          bloqueadoAte: bloquear ? new Date(momento.getTime() + regras.bloqueioMinutos * 60_000).toISOString() : null,
        });
      }
      await registrar(tenant, usuario && !usuario.ativo && confere ? "LOGIN_INATIVO" : "LOGIN_FALHA", {
        usuarioId: usuario?.id ?? null, email: normalizarEmail(email), ip,
      });
      throw credenciaisInvalidas();
    }

    const segredo = novoSegredo();
    const sessao = {
      id: hashDeToken(segredo),
      usuarioId: usuario.id,
      criadaEm: momento.toISOString(),
      expiraEm: new Date(momento.getTime() + regras.duracaoHoras * 3_600_000).toISOString(),
      ip,
      userAgent: userAgent ? String(userAgent).slice(0, 200) : null,
    };
    await repo.inserir(tenant, C.sessoes, sessao);

    const patch = { tentativasFalhas: 0, bloqueadoAte: null, ultimoAcesso: momento.toISOString() };
    if (precisaRehash(usuario.senhaHash)) patch.senhaHash = await gerarHash(senha);
    const atualizado = await repo.atualizar(tenant, C.usuarios, usuario.id, patch);
    await registrar(tenant, "LOGIN_OK", { usuarioId: usuario.id, tipo, ip });

    return { token: `${tenant}.${segredo}`, expiraEm: sessao.expiraEm, ...(await perfilDoUsuario(tenant, atualizado)) };
  }

  async function perfilDoUsuario(tenant, usuario) {
    if (tipoDe(usuario) !== TIPO_CONTA.INTERNO) {
      return { usuario: usuarioPublico(usuario), tipo: tipoDe(usuario), escopo: usuario.escopo ?? {}, perfil: null, acesso: acessoEfetivo(usuario, null), modulos: [] };
    }
    const p = await perfil(tenant, usuario.perfilId);
    const acesso = acessoEfetivo(usuario, p);
    return {
      usuario: usuarioPublico(usuario),
      tipo: TIPO_CONTA.INTERNO,
      perfil: p ? { id: p.id, nome: p.nome, acessoTotal: Boolean(p.acessoTotal) } : null,
      acesso,
      modulos: modulosDoUsuario(acesso),
    };
  }

  /** Token → contexto autenticado, ou null se inválido/expirado/usuário inativo. */
  async function resolverSessao(token) {
    const texto = String(token ?? "");
    const ponto = texto.indexOf(".");
    if (ponto < 1) return null;
    const tenant = texto.slice(0, ponto);
    const segredo = texto.slice(ponto + 1);
    try { exigirTenant(tenant); } catch { return null; }
    if (segredo.length < 20) return null;

    const sessao = await repo.obter(tenant, C.sessoes, hashDeToken(segredo));
    if (!sessao) return null;
    if (sessao.expiraEm <= agora().toISOString()) {
      await repo.remover(tenant, C.sessoes, sessao.id);
      return null;
    }
    const usuario = await repo.obter(tenant, C.usuarios, sessao.usuarioId);
    if (!usuario?.ativo) return null;
    return { tenant, usuario, sessao, acesso: await acessoDe(tenant, usuario) };
  }

  async function sair(tenant, sessaoId, usuarioId) {
    await repo.remover(tenant, C.sessoes, sessaoId);
    await registrar(tenant, "LOGOUT", { usuarioId });
  }

  async function trocarPropriaSenha(tenant, usuarioId, { senhaAtual, novaSenha }) {
    const usuario = await repo.obter(tenant, C.usuarios, usuarioId);
    if (!usuario || !(await verificarSenha(String(senhaAtual ?? ""), usuario.senhaHash))) {
      throw erroValidacao("senha atual incorreta");
    }
    await validarNovaSenha(tenant, novaSenha, usuario);
    await repo.atualizar(tenant, C.usuarios, usuarioId, { senhaHash: await gerarHash(novaSenha), trocarSenha: false });
    await registrar(tenant, "SENHA_ALTERADA", { usuarioId });
  }

  // ------------------------------------------------------------ usuários

  async function listarUsuarios(tenant) {
    const { itens } = await repo.listar(tenant, C.usuarios, {}, { ordenarPor: "nome" });
    return itens.filter((u) => tipoDe(u) === TIPO_CONTA.INTERNO).map(usuarioPublico);
  }

  function exigirConcessao(ator, acessoAlvo) {
    const r = podeConcederAcesso(ator, acessoAlvo);
    if (!r.ok) throw erroSemPermissao(r.erros.join("; "));
  }

  /**
   * Cria usuário. Toda criação passa pela checagem de escalada de privilégio
   * contra o acesso de quem cria (`atorAcesso`).
   */
  async function criarUsuario(tenant, dados, { atorAcesso, atorId }) {
    const nome = String(dados.nome ?? "").trim();
    const email = normalizarEmail(dados.email);
    if (nome.length < 3) throw erroValidacao("nome deve ter ao menos 3 caracteres", ["nome"]);
    if (!validarEmail(email).valido) throw erroValidacao("e-mail inválido", ["email"]);
    if (await usuarioPorEmail(tenant, email)) throw erroConflito("já existe usuário com este e-mail");

    const p = await perfil(tenant, dados.perfilId);
    if (!p) throw erroValidacao("perfil de acesso inexistente", ["perfilId"]);
    const novo = { ativo: true, perfilId: p.id, ajustes: dados.ajustes ?? {} };
    exigirConcessao(atorAcesso, acessoEfetivo(novo, p));

    const usuario = { id: novoId("USR"), tipo: TIPO_CONTA.INTERNO, nome, email, ...novo };
    await validarNovaSenha(tenant, dados.senha, usuario);
    const gravado = await repo.inserir(tenant, C.usuarios, {
      ...usuario,
      senhaHash: await gerarHash(dados.senha),
      trocarSenha: dados.trocarSenha !== false,
      tentativasFalhas: 0,
      bloqueadoAte: null,
      ultimoAcesso: null,
      criadoEm: agora().toISOString(),
      criadoPor: atorId ?? null,
    });
    await registrar(tenant, "USUARIO_CRIADO", { usuarioId: atorId ?? null, alvoId: gravado.id, perfilId: p.id });
    return usuarioPublico(gravado);
  }

  async function criarPrimeiroAdministrador(tenant, dados) {
    exigirTenant(tenant);
    if ((await repo.contar(tenant, C.usuarios)) > 0) {
      throw erroConflito("a empresa já tem usuários; o primeiro administrador só pode ser criado uma vez");
    }
    const admin = acessoEfetivo({ ativo: true }, PERFIS_PADRAO[0]);
    return criarUsuario(tenant, { ...dados, perfilId: ID_ADMINISTRADOR_GERAL }, { atorAcesso: admin, atorId: "SISTEMA" });
  }

  async function atualizarUsuario(tenant, id, patch, { atorAcesso, atorId }) {
    const atual = await repo.obter(tenant, C.usuarios, id);
    if (!atual || tipoDe(atual) !== TIPO_CONTA.INTERNO) throw erroNaoEncontrado("usuário não encontrado");

    const permitido = {};
    if (patch.nome !== undefined) permitido.nome = String(patch.nome).trim();
    if (patch.perfilId !== undefined) permitido.perfilId = patch.perfilId;
    if (patch.ajustes !== undefined) permitido.ajustes = patch.ajustes ?? {};
    if (patch.ativo !== undefined) permitido.ativo = Boolean(patch.ativo);
    if (permitido.nome !== undefined && permitido.nome.length < 3) throw erroValidacao("nome deve ter ao menos 3 caracteres");

    const futuro = { ...atual, ...permitido };
    const p = await perfil(tenant, futuro.perfilId);
    if (!p) throw erroValidacao("perfil de acesso inexistente", ["perfilId"]);

    // Quem concede precisa ter, no mínimo, o acesso que o usuário tem hoje e o que terá.
    exigirConcessao(atorAcesso, acessoEfetivo(futuro, p));
    exigirConcessao(atorAcesso, await acessoDe(tenant, atual));

    const todos = (await repo.listar(tenant, C.usuarios)).itens.map((u) => (u.id === id ? futuro : u));
    const restante = verificarAdministradorRestante(todos);
    if (!restante.ok) throw erroValidacao(restante.erros[0]);

    const gravado = await repo.atualizar(tenant, C.usuarios, id, permitido);
    const acessoMudou =
      permitido.ativo === false ||
      (permitido.perfilId !== undefined && permitido.perfilId !== atual.perfilId) ||
      (permitido.ajustes !== undefined && JSON.stringify(permitido.ajustes) !== JSON.stringify(atual.ajustes ?? {}));
    if (acessoMudou) {
      await revogarSessoes(tenant, id); // acesso mudou: força novo login com as permissões novas
    }
    await registrar(tenant, "USUARIO_ALTERADO", { usuarioId: atorId, alvoId: id, campos: Object.keys(permitido) });
    return usuarioPublico(gravado);
  }

  async function redefinirSenha(tenant, id, { novaSenha }, { atorAcesso, atorId }) {
    const alvo = await repo.obter(tenant, C.usuarios, id);
    if (!alvo || tipoDe(alvo) !== TIPO_CONTA.INTERNO) throw erroNaoEncontrado("usuário não encontrado");
    exigirConcessao(atorAcesso, await acessoDe(tenant, alvo));
    await validarNovaSenha(tenant, novaSenha, alvo);
    await repo.atualizar(tenant, C.usuarios, id, {
      senhaHash: await gerarHash(novaSenha), trocarSenha: true, tentativasFalhas: 0, bloqueadoAte: null,
    });
    await revogarSessoes(tenant, id);
    await registrar(tenant, "SENHA_REDEFINIDA", { usuarioId: atorId, alvoId: id });
  }

  // ------------------------------------------------------------ perfis

  async function salvarPerfil(tenant, dados, { atorAcesso, atorId, id = null }) {
    if (id && PERFIS_PADRAO.some((p) => p.id === id)) throw erroValidacao("perfis padrão não podem ser alterados; crie uma cópia");
    if (dados.acessoTotal) throw erroValidacao("acesso total é exclusivo do perfil Administrador geral");
    const existente = id ? await repo.obter(tenant, C.perfis, id) : null;
    if (id && !existente) throw erroNaoEncontrado("perfil não encontrado");

    const perfilNovo = {
      nome: String(dados.nome ?? existente?.nome ?? "").trim(),
      descricao: String(dados.descricao ?? existente?.descricao ?? "").trim(),
      niveis: { ...(existente?.niveis ?? {}), ...(dados.niveis ?? {}) },
    };
    const v = validarPerfilPersonalizado(perfilNovo);
    if (!v.ok) throw erroValidacao(v.erros[0], v.erros);
    exigirConcessao(atorAcesso, acessoEfetivo({ ativo: true }, perfilNovo));

    if (existente) {
      const salvo = await repo.atualizar(tenant, C.perfis, id, perfilNovo);
      // Quem usa o perfil precisa entrar de novo para receber as permissões novas.
      const { itens } = await repo.listar(tenant, C.usuarios, { perfilId: id });
      for (const u of itens) await revogarSessoes(tenant, u.id);
      await registrar(tenant, "PERFIL_ALTERADO", { usuarioId: atorId, alvoId: id });
      return salvo;
    }
    const salvo = await repo.inserir(tenant, C.perfis, { id: novoId("PRF"), sistema: false, ...perfilNovo, criadoEm: agora().toISOString() });
    await registrar(tenant, "PERFIL_CRIADO", { usuarioId: atorId, alvoId: salvo.id });
    return salvo;
  }

  // ------------------------------------------------------------ contas externas

  function exigirGestorDaConta(atorAcesso, tipo, acao) {
    if (atorAcesso === ATOR_SISTEMA) return;
    const modulo = MODULO_GESTOR_DA_CONTA[tipo];
    if (!modulo) throw erroValidacao("tipo de conta externa inválido");
    if (!pode(atorAcesso, modulo, acao)) {
      throw erroSemPermissao(`gerenciar contas de ${tipo.toLowerCase()} exige permissão de ${acao === "criar" ? "cadastro" : "alteração"} no módulo correspondente`);
    }
  }

  async function criarContaExterna(tenant, dados, { atorAcesso, atorId }) {
    const tipo = dados.tipo;
    if (!MODULO_GESTOR_DA_CONTA[tipo]) throw erroValidacao("tipo de conta externa inválido", ["tipo"]);
    exigirGestorDaConta(atorAcesso, tipo, "criar");

    const nome = String(dados.nome ?? "").trim();
    const email = normalizarEmail(dados.email);
    if (nome.length < 3) throw erroValidacao("nome deve ter ao menos 3 caracteres", ["nome"]);
    if (!validarEmail(email).valido) throw erroValidacao("e-mail inválido", ["email"]);
    const escopo = dados.escopo ?? {};
    const v = validarEscopo(tipo, escopo);
    if (!v.ok) throw erroValidacao(v.erros[0], v.erros);
    if (await usuarioPorEmail(tenant, email, tipo)) throw erroConflito("já existe conta deste tipo com este e-mail");

    const conta = { id: novoId("USR"), tipo, nome, email, ativo: true, escopo };
    await validarNovaSenha(tenant, dados.senha, conta);
    const gravada = await repo.inserir(tenant, C.usuarios, {
      ...conta,
      senhaHash: await gerarHash(dados.senha),
      trocarSenha: dados.trocarSenha !== false,
      tentativasFalhas: 0,
      bloqueadoAte: null,
      ultimoAcesso: null,
      criadoEm: agora().toISOString(),
      criadoPor: atorId ?? null,
    });
    await registrar(tenant, "CONTA_EXTERNA_CRIADA", { usuarioId: atorId ?? null, alvoId: gravada.id, tipo });
    return usuarioPublico(gravada);
  }

  async function listarContasExternas(tenant, { tipo, atorAcesso }) {
    exigirGestorDaConta(atorAcesso, tipo, "ver");
    const { itens } = await repo.listar(tenant, C.usuarios, { tipo }, { ordenarPor: "nome" });
    return itens.map(usuarioPublico);
  }

  async function atualizarContaExterna(tenant, id, patch, { atorAcesso, atorId }) {
    const atual = await repo.obter(tenant, C.usuarios, id);
    if (!atual || tipoDe(atual) === TIPO_CONTA.INTERNO) throw erroNaoEncontrado("conta não encontrada");
    exigirGestorDaConta(atorAcesso, atual.tipo, "editar");

    const permitido = {};
    if (patch.nome !== undefined) permitido.nome = String(patch.nome).trim();
    if (patch.ativo !== undefined) permitido.ativo = Boolean(patch.ativo);
    if (patch.escopo !== undefined) {
      const escopo = { ...atual.escopo, ...patch.escopo };
      const v = validarEscopo(atual.tipo, escopo);
      if (!v.ok) throw erroValidacao(v.erros[0], v.erros);
      permitido.escopo = escopo;
    }
    const gravada = await repo.atualizar(tenant, C.usuarios, id, permitido);
    if (permitido.ativo === false || permitido.escopo !== undefined) await revogarSessoes(tenant, id);
    if (patch.novaSenha) {
      await validarNovaSenha(tenant, patch.novaSenha, gravada);
      await repo.atualizar(tenant, C.usuarios, id, { senhaHash: await gerarHash(patch.novaSenha), trocarSenha: true, tentativasFalhas: 0, bloqueadoAte: null });
      await revogarSessoes(tenant, id);
    }
    await registrar(tenant, "CONTA_EXTERNA_ALTERADA", { usuarioId: atorId, alvoId: id, tipo: atual.tipo });
    return usuarioPublico(await repo.obter(tenant, C.usuarios, id));
  }

  async function listarAuditoria(tenant, { limite = 100 } = {}) {
    const { itens } = await repo.listar(tenant, C.auditoria, {}, { ordenarPor: "em:desc", limite });
    return itens;
  }

  return {
    entrar,
    sair,
    resolverSessao,
    perfilDoUsuario,
    trocarPropriaSenha,
    listarUsuarios,
    criarUsuario,
    criarPrimeiroAdministrador,
    atualizarUsuario,
    redefinirSenha,
    perfisDoTenant,
    salvarPerfil,
    listarAuditoria,
    registrar,
    usuarioPorEmail,
    criarContaExterna,
    listarContasExternas,
    atualizarContaExterna,
  };
}
