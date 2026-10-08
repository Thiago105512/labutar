/**
 * Chave PIX do favorecido (Resolução BCB 1/2020): CPF, CNPJ, e-mail, celular (+55) ou chave
 * aleatória (EVP). O tipo define a "forma de iniciação" do segmento B do CNAB 240.
 */
import { validarCPF, validarCNPJ, validarEmail, somenteDigitos } from "../../core/src/validacao.js";

export const TIPO_CHAVE_PIX = Object.freeze({
  TELEFONE: Object.freeze({ nome: "Celular", iniciacao: "01" }),
  EMAIL: Object.freeze({ nome: "E-mail", iniciacao: "02" }),
  CPF_CNPJ: Object.freeze({ nome: "CPF ou CNPJ", iniciacao: "03" }),
  ALEATORIA: Object.freeze({ nome: "Chave aleatória", iniciacao: "04" }),
});

const EVP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @returns { valida, tipo?, chave? (normalizada), motivo? } */
export function validarChavePix(valor) {
  const texto = String(valor ?? "").trim();
  if (!texto) return { valida: false, motivo: "chave vazia" };
  if (EVP.test(texto)) return { valida: true, tipo: "ALEATORIA", chave: texto.toLowerCase() };
  if (texto.includes("@")) {
    if (texto.length > 77 || !validarEmail(texto).valido) return { valida: false, motivo: "e-mail inválido" };
    return { valida: true, tipo: "EMAIL", chave: texto.toLowerCase() };
  }
  if (/^\+/.test(texto)) {
    const d = somenteDigitos(texto);
    if (!/^55\d{10,11}$/.test(d)) return { valida: false, motivo: "celular no formato +55 DDD número" };
    return { valida: true, tipo: "TELEFONE", chave: `+${d}` };
  }
  const d = somenteDigitos(texto);
  if (d.length === 11 && validarCPF(d).valido) return { valida: true, tipo: "CPF_CNPJ", chave: d };
  if (d.length === 14 && validarCNPJ(d).valido) return { valida: true, tipo: "CPF_CNPJ", chave: d };
  return { valida: false, motivo: "chave PIX não reconhecida (CPF, CNPJ, e-mail, celular +55 ou chave aleatória)" };
}
