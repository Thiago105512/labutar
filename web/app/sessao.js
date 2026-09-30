/**
 * Sessão do usuário no navegador e chamadas autenticadas à API.
 *
 * O token fica em sessionStorage: some ao fechar a aba e não é enviado
 * automaticamente como cookie (sem risco de CSRF). A proteção contra XSS é
 * o escape de todo conteúdo externo (ui.js/esc). A autorização de verdade é
 * sempre do servidor — o que a tela esconde é conveniência, não segurança.
 */
import { pode as podeNoAcesso } from "/packages/acesso/src/index.js";

const CHAVE = "labutar.sessao";
let atual = ler();
const ouvintesSaida = new Set();

function ler() {
  try {
    return JSON.parse(sessionStorage.getItem(CHAVE) ?? "null");
  } catch {
    return null;
  }
}

function gravar(valor) {
  atual = valor;
  try {
    if (valor) sessionStorage.setItem(CHAVE, JSON.stringify(valor));
    else sessionStorage.removeItem(CHAVE);
  } catch {
    /* navegação privada sem storage: a sessão vale só enquanto a página estiver aberta */
  }
}

export const sessao = {
  get ativa() { return Boolean(atual?.token); },
  get dados() { return atual; },
  get usuario() { return atual?.usuario ?? null; },
  get perfil() { return atual?.perfil ?? null; },
  get modulos() { return atual?.modulos ?? []; },
  get empresa() { return atual?.token?.split(".")[0] ?? null; },
  pode(modulo, acao) { return podeNoAcesso(atual?.acesso, modulo, acao); },
  modulo(id) { return this.modulos.find((m) => m.id === id) ?? null; },
  aoSair(fn) { ouvintesSaida.add(fn); },
};

export async function api(caminho, { metodo = "GET", corpo, anonimo = false } = {}) {
  const cabecalhos = {};
  if (corpo !== undefined) cabecalhos["Content-Type"] = "application/json";
  if (!anonimo && atual?.token) cabecalhos.Authorization = `Bearer ${atual.token}`;

  const resposta = await fetch(`/api${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  const json = await resposta.json().catch(() => ({}));

  if (resposta.status === 401 && !anonimo) {
    encerrarLocalmente("Sua sessão expirou. Entre novamente.");
    throw new Error("sessão expirada");
  }
  if (!resposta.ok || json.ok === false) {
    const erro = new Error(json.erro || `Falha na requisição (${resposta.status})`);
    erro.status = resposta.status;
    erro.detalhes = json.detalhes;
    throw erro;
  }
  return json.dados;
}

export async function entrar({ empresa, email, senha }) {
  const dados = await api("/auth/entrar", { metodo: "POST", corpo: { empresa, email, senha }, anonimo: true });
  gravar(dados);
  return dados;
}

/** Atualiza usuário, perfil e módulos a partir do servidor (ex.: depois de trocar a senha). */
export async function recarregarSessao() {
  const dados = await api("/auth/eu");
  gravar({ ...atual, ...dados });
  return dados;
}

export async function sair() {
  try {
    await api("/auth/sair", { metodo: "POST" });
  } catch {
    /* sessão já inválida no servidor: sair localmente basta */
  }
  encerrarLocalmente();
}

function encerrarLocalmente(motivo = null) {
  gravar(null);
  for (const fn of ouvintesSaida) fn(motivo);
}
