import { somenteDigitos } from "./validacao.js";

const ALFABETO_SEM_AMBIGUOS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function bytesAleatorios(tamanho) {
  const buffer = new Uint8Array(tamanho);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buffer);
    return buffer;
  }
  for (let i = 0; i < tamanho; i++) buffer[i] = Math.floor(Math.random() * 256);
  return buffer;
}

export function novoId(prefixo, tamanhoAleatorio = 8) {
  const parte = Array.from(bytesAleatorios(tamanhoAleatorio))
    .map((b) => ALFABETO_SEM_AMBIGUOS[b % ALFABETO_SEM_AMBIGUOS.length])
    .join("");
  const tempo = Date.now().toString(36).toUpperCase();
  return prefixo ? `${prefixo}_${tempo}${parte}` : `${tempo}${parte}`;
}

export function gerarToken(tamanho = 32) {
  return Array.from(bytesAleatorios(tamanho))
    .map((b) => ALFABETO_SEM_AMBIGUOS[b % ALFABETO_SEM_AMBIGUOS.length])
    .join("");
}

function compactar(data) {
  return data.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

/**
 * Identificador do evento no padrão eSocial (36 caracteres):
 * "ID" + tpInsc (1) + nrInsc (14, zeros à esquerda) + AAAAMMDDHHMMSS (14) + sequencial (5).
 * Conferir contra o XSD vigente do portal antes de enviar em produção.
 */
export function idEventoESocial({ tpInsc, nrInsc, sequencial = 1, quando = new Date() }) {
  const digitos = somenteDigitos(nrInsc);
  if (digitos.length > 14) {
    throw new Error(`nrInsc com ${digitos.length} dígitos; o máximo no eSocial é 14`);
  }
  const inscricao = digitos.padStart(14, "0");
  const tipo = somenteDigitos(tpInsc).slice(0, 1);
  const seq = String(sequencial).padStart(5, "0").slice(0, 5);
  const id = `ID${tipo}${inscricao}${compactar(quando)}${seq}`;
  if (id.length !== 36) {
    throw new Error(`Id do eSocial inválido (${id.length} caracteres, esperado 36): ${id}`);
  }
  return id;
}

export function validarIdEventoESocial(id) {
  if (!/^ID\d{34}$/.test(String(id ?? ""))) {
    return { valido: false, motivo: "Id deve ter 36 caracteres: ID + 34 dígitos" };
  }
  return { valido: true, motivo: null };
}
