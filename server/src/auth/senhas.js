import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

/**
 * Hash de senha com scrypt (node:crypto, sem dependência externa).
 *
 * Formato armazenado: scrypt$N$r$p$salt$hash (base64url). Os parâmetros vão
 * junto do hash para que o custo possa subir no futuro sem invalidar as
 * senhas antigas — `precisaRehash` indica quando regravar no próximo login.
 */
export const PARAMETROS = Object.freeze({ N: 2 ** 15, r: 8, p: 1, tamanho: 64 });

const maxmem = (N, r) => 256 * N * r; // folga acima dos 128·N·r exigidos

export async function gerarHash(senha, parametros = PARAMETROS) {
  const { N, r, p, tamanho } = parametros;
  const salt = randomBytes(16);
  const hash = await scrypt(String(senha).normalize("NFKC"), salt, tamanho, { N, r, p, maxmem: maxmem(N, r) });
  return ["scrypt", N, r, p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verificarSenha(senha, armazenado) {
  const partes = String(armazenado ?? "").split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const [, N, r, p, salt64, hash64] = partes;
  const esperado = Buffer.from(hash64, "base64url");
  const calculado = await scrypt(String(senha).normalize("NFKC"), Buffer.from(salt64, "base64url"), esperado.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: maxmem(Number(N), Number(r)),
  });
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

export function precisaRehash(armazenado, parametros = PARAMETROS) {
  const [, N, r, p] = String(armazenado ?? "").split("$");
  return Number(N) !== parametros.N || Number(r) !== parametros.r || Number(p) !== parametros.p;
}

/** Tokens de sessão são guardados só como hash: vazamento do banco não entrega sessões. */
export const hashDeToken = (token) => createHash("sha256").update(String(token)).digest("hex");
export const novoSegredo = () => randomBytes(32).toString("base64url");
