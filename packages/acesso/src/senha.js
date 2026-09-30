import { normalizar } from "../../core/src/texto.js";

/**
 * Política de senha. Segue a linha das recomendações atuais (NIST SP 800-63B):
 * comprimento pesa mais que regras de "uma maiúscula e um símbolo", e senhas
 * óbvias são recusadas. O hash (scrypt) fica no servidor — aqui só a regra,
 * para a tela avisar antes de enviar.
 */
export const SENHA_MINIMO = 10;
export const SENHA_MAXIMO = 128;

const COMUNS = new Set([
  "1234567890", "12345678910", "0123456789", "senha12345", "senha123456", "password123",
  "qwertyuiop", "abcdefghij", "labutar123", "labutar2026", "mudar12345", "trocar12345",
  "brasil1234", "admin12345", "administrador",
]);

const chave = (t) => normalizar(t).toLowerCase();

export function validarSenha(senha, { email = "", nome = "", empresa = "" } = {}) {
  const erros = [];
  const texto = String(senha ?? "");

  if (texto.length < SENHA_MINIMO) erros.push(`a senha precisa ter ao menos ${SENHA_MINIMO} caracteres`);
  if (texto.length > SENHA_MAXIMO) erros.push(`a senha pode ter no máximo ${SENHA_MAXIMO} caracteres`);
  if (erros.length) return { ok: false, erros };

  const k = chave(texto);
  if (COMUNS.has(k)) erros.push("senha muito comum; escolha outra");
  if (/^(.)\1+$/.test(texto)) erros.push("a senha não pode repetir um único caractere");
  if (/^\d+$/.test(texto)) erros.push("a senha não pode conter só números");

  const pedacos = [
    String(email).split("@")[0],
    ...String(nome).split(/\s+/),
    empresa,
  ].map(chave).filter((p) => p.length >= 4);
  if (pedacos.some((p) => k.includes(p))) erros.push("a senha não pode conter seu nome, e-mail ou o nome da empresa");

  return { ok: erros.length === 0, erros };
}
