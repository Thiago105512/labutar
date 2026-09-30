import { ACOES, IDS_MODULOS, MODULOS, NIVEL, NIVEIS, acoesDoNivel, nomeDoNivel } from "./catalogo.js";
import { ID_ADMINISTRADOR_GERAL } from "./perfis.js";

/**
 * Acesso efetivo de um usuário: nível de cada módulo, resolvido a partir do
 * perfil e dos ajustes individuais do usuário.
 *
 *   usuario: { ativo, perfilId, ajustes?: { modulo: nivel } }
 *   perfil:  { id, acessoTotal?, niveis: { modulo: nivel } }
 *
 * Usuário inativo ou sem perfil não acessa nada. Acesso total ignora ajustes:
 * é irrestrito por definição, e um "ajuste para baixo" no administrador geral
 * criaria um administrador que não consegue administrar.
 */
export function acessoEfetivo(usuario, perfil) {
  const vazio = Object.fromEntries(IDS_MODULOS.map((id) => [id, NIVEL.SEM_ACESSO]));
  if (!usuario?.ativo || !perfil) return { acessoTotal: false, perfilId: perfil?.id ?? null, niveis: vazio };

  if (perfil.acessoTotal) {
    return {
      acessoTotal: true,
      perfilId: perfil.id,
      niveis: Object.fromEntries(IDS_MODULOS.map((id) => [id, NIVEL.ADMINISTRADOR])),
    };
  }

  const niveis = {};
  for (const id of IDS_MODULOS) {
    const ajuste = usuario.ajustes?.[id];
    niveis[id] = nivelValido(ajuste) ? ajuste : nivelValido(perfil.niveis?.[id]) ? perfil.niveis[id] : NIVEL.SEM_ACESSO;
  }
  return { acessoTotal: false, perfilId: perfil.id, niveis };
}

const nivelValido = (v) => Number.isInteger(v) && v >= NIVEL.SEM_ACESSO && v <= NIVEL.ADMINISTRADOR;

/** Pode executar `acao` em `modulo`? Ação ou módulo desconhecidos: não. */
export function pode(acesso, modulo, acao) {
  if (!acesso || !(acao in ACOES) || !IDS_MODULOS.includes(modulo)) return false;
  if (acesso.acessoTotal) return true;
  return (acesso.niveis?.[modulo] ?? NIVEL.SEM_ACESSO) >= ACOES[acao];
}

/** Lista de módulos com o que o usuário pode fazer em cada um — alimenta a tela de escolha. */
export function modulosDoUsuario(acesso) {
  return MODULOS.map((m) => {
    const nivel = acesso?.acessoTotal ? NIVEL.ADMINISTRADOR : acesso?.niveis?.[m.id] ?? NIVEL.SEM_ACESSO;
    return { ...m, nivel, nomeNivel: nomeDoNivel(nivel), liberado: nivel > NIVEL.SEM_ACESSO, acoes: acoesDoNivel(nivel) };
  });
}

/** Perfil criado pela empresa. Nunca pode ter acesso total — esse é exclusivo do perfil de sistema. */
export function validarPerfilPersonalizado(perfil = {}) {
  const erros = [];
  const nome = String(perfil.nome ?? "").trim();
  if (nome.length < 3 || nome.length > 60) erros.push("nome do perfil deve ter de 3 a 60 caracteres");
  if (perfil.acessoTotal) erros.push("acesso total é exclusivo do perfil Administrador geral");
  const niveis = perfil.niveis ?? {};
  for (const [modulo, nivel] of Object.entries(niveis)) {
    if (!IDS_MODULOS.includes(modulo)) erros.push(`módulo desconhecido: ${modulo}`);
    else if (!nivelValido(nivel)) erros.push(`nível inválido em ${modulo}: use ${NIVEIS.map((n) => n.valor).join(", ")}`);
  }
  if (!Object.values(niveis).some((n) => n > NIVEL.SEM_ACESSO)) erros.push("o perfil precisa liberar ao menos um módulo");
  return { ok: erros.length === 0, erros };
}

/**
 * Protege contra escalada de privilégio: ninguém concede acesso maior que o
 * próprio. Só quem tem acesso total atribui o perfil Administrador geral ou
 * o nível Administrador na administração do sistema.
 *
 *   ator:  acesso efetivo de quem está concedendo
 *   alvo:  acesso efetivo que o usuário/perfil passará a ter
 */
export function podeConcederAcesso(ator, alvo) {
  const erros = [];
  if (!pode(ator, "administracao", "editar")) {
    return { ok: false, erros: ["sem permissão para gerenciar usuários e perfis"] };
  }
  if (ator.acessoTotal) return { ok: true, erros };

  if (alvo.acessoTotal) erros.push("só um Administrador geral pode conceder acesso total");
  if ((alvo.niveis?.administracao ?? 0) >= NIVEL.ADMINISTRADOR) {
    erros.push("só um Administrador geral pode conceder o nível Administrador na administração do sistema");
  }
  for (const id of IDS_MODULOS) {
    const pedido = alvo.niveis?.[id] ?? 0;
    const proprio = ator.niveis?.[id] ?? 0;
    if (pedido > proprio) {
      const modulo = MODULOS.find((m) => m.id === id).nome;
      erros.push(`${modulo}: não é possível conceder "${nomeDoNivel(pedido)}", acima do seu nível ("${nomeDoNivel(proprio)}")`);
    }
  }
  return { ok: erros.length === 0, erros };
}

/**
 * A empresa nunca pode ficar sem um Administrador geral ativo — senão
 * ninguém mais consegue gerenciar acessos. `usuarios` é a lista já com a
 * alteração aplicada.
 */
export function verificarAdministradorRestante(usuarios = []) {
  const ativos = usuarios.filter((u) => u.ativo && u.perfilId === ID_ADMINISTRADOR_GERAL);
  return ativos.length > 0
    ? { ok: true, erros: [] }
    : { ok: false, erros: ["a empresa precisa manter ao menos um Administrador geral ativo"] };
}
