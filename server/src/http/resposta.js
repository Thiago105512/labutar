import { ErroEscopo, ErroNaoEncontrado, ErroValidacao } from "../db/guard.js";

export const CODIGOS = Object.freeze({
  VALIDACAO: "VALIDACAO",
  TRANSICAO_INVALIDA: "TRANSICAO_INVALIDA",
  NAO_AUTENTICADO: "NAO_AUTENTICADO",
  SEM_ESCOPO: "SEM_ESCOPO",
  SEM_PERMISSAO: "SEM_PERMISSAO",
  NAO_ENCONTRADO: "NAO_ENCONTRADO",
  CONFLITO: "CONFLITO",
  CORPO_INVALIDO: "CORPO_INVALIDO",
  INTERNO: "INTERNO",
});

export class ErroApi extends Error {
  constructor(status, codigo, mensagem, detalhes = null) {
    super(mensagem);
    this.name = "ErroApi";
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}

export const erroValidacao = (mensagem, detalhes) => new ErroApi(400, CODIGOS.VALIDACAO, mensagem, detalhes);
export const erroTransicao = (mensagem, detalhes) => new ErroApi(400, CODIGOS.TRANSICAO_INVALIDA, mensagem, detalhes);
export const erroCorpo = (mensagem) => new ErroApi(400, CODIGOS.CORPO_INVALIDO, mensagem);
export const erroNaoAutenticado = () => new ErroApi(401, CODIGOS.NAO_AUTENTICADO, "identidade de usuário ausente");
export const erroSemPermissao = (mensagem) => new ErroApi(403, CODIGOS.SEM_PERMISSAO, mensagem);
export const erroNaoEncontrado = (mensagem) => new ErroApi(404, CODIGOS.NAO_ENCONTRADO, mensagem);
export const erroConflito = (mensagem, detalhes) => new ErroApi(409, CODIGOS.CONFLITO, mensagem, detalhes);

function enviar(res, status, corpo, cabecalhos = {}) {
  const payload = JSON.stringify(corpo);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    ...cabecalhos,
  });
  res.end(payload);
}

export function sucesso(res, dados, status = 200, cabecalhos) {
  enviar(res, status, { ok: true, dados }, cabecalhos);
}

export function falha(res, status, codigo, mensagem, detalhes, cabecalhos) {
  enviar(res, status, { ok: false, erro: mensagem, codigo, detalhes: detalhes ?? null }, cabecalhos);
}

/**
 * Converte qualquer exceção — do domínio, do driver ou inesperada — no envelope
 * do contrato. Nada que revele implementação sai daqui: sem stack, sem caminho
 * de arquivo, sem mensagem de driver.
 */
export function responderErro(res, erro, { log } = {}) {
  if (erro instanceof ErroApi) {
    return falha(res, erro.status, erro.codigo, erro.message, erro.detalhes);
  }
  if (erro instanceof ErroEscopo) {
    return falha(res, 403, CODIGOS.SEM_ESCOPO, erro.message);
  }
  if (erro instanceof ErroNaoEncontrado) {
    // 404, não 403: distinguir os dois confirma a existência de registro alheio
    return falha(res, 404, CODIGOS.NAO_ENCONTRADO, "recurso não encontrado");
  }
  if (erro instanceof ErroValidacao) {
    return falha(res, 400, CODIGOS.VALIDACAO, erro.message, erro.detalhes);
  }
  // erro que já traz status e codigo (ex.: corpo acima do limite)
  if (erro?.status && erro?.codigo) {
    return falha(res, erro.status, erro.codigo, erro.message);
  }
  if (erro?.status === 409) {
    return falha(res, 409, CODIGOS.CONFLITO, erro.message);
  }
  if (erro instanceof SyntaxError) {
    return falha(res, 400, CODIGOS.CORPO_INVALIDO, "corpo da requisição não é JSON válido");
  }

  if (log) log(erro);
  return falha(res, 500, CODIGOS.INTERNO, "erro interno inesperado");
}
