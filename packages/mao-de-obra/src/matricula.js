/**
 * Matrícula do vínculo no formato V-NNNNNN-D (docs/15-padroes.md, seção 7.1):
 * dígito do vínculo + sequência de 6 dígitos + dígito verificador (módulo 11).
 * Uma matrícula por vínculo, nunca derivada do CPF, nunca reaproveitada.
 */
import { TIPO_VINCULO } from "./constantes.js";

export const DIGITO_DO_VINCULO = Object.freeze({
  [TIPO_VINCULO.PROPRIO]: "1",
  [TIPO_VINCULO.TEMPORARIO]: "2",
  [TIPO_VINCULO.TERCEIRIZADO]: "3",
});

const VINCULO_DO_DIGITO = Object.freeze(Object.fromEntries(Object.entries(DIGITO_DO_VINCULO).map(([v, d]) => [d, v])));
export const MAIOR_SEQUENCIA = 999_999;

function digitoVerificador(base) {
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[base.length - 1 - i]) * (2 + (i % 8));
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Monta a matrícula; devolve só números ("20048217"), como vai à API e ao eSocial. */
export function gerarMatricula(tipoVinculo, sequencia) {
  const digito = DIGITO_DO_VINCULO[tipoVinculo];
  if (!digito) throw new Error(`vínculo desconhecido: ${tipoVinculo}`);
  if (!Number.isInteger(sequencia) || sequencia < 1 || sequencia > MAIOR_SEQUENCIA) {
    throw new Error(`sequência da matrícula deve ser inteiro de 1 a ${MAIOR_SEQUENCIA}`);
  }
  const base = digito + String(sequencia).padStart(6, "0");
  return base + digitoVerificador(base);
}

/** Próxima matrícula do vínculo, dada a maior sequência já usada (de qualquer vínculo, ativo ou não). */
export function proximaMatricula(tipoVinculo, matriculasExistentes = []) {
  const digito = DIGITO_DO_VINCULO[tipoVinculo];
  let maior = 0;
  for (const m of matriculasExistentes) {
    const limpa = String(m ?? "").replace(/\D/g, "");
    if (limpa[0] === digito && limpa.length === 8) maior = Math.max(maior, Number(limpa.slice(1, 7)));
  }
  return gerarMatricula(tipoVinculo, maior + 1);
}

export function validarMatricula(valor) {
  const m = String(valor ?? "").replace(/[-.\s]/g, "");
  if (!/^\d{8}$/.test(m)) return { valido: false, motivo: "Matrícula deve ter 8 dígitos (V-NNNNNN-D)" };
  const vinculo = VINCULO_DO_DIGITO[m[0]];
  if (!vinculo) return { valido: false, motivo: "Primeiro dígito deve indicar o vínculo: 1, 2 ou 3" };
  if (Number(m.slice(1, 7)) < 1) return { valido: false, motivo: "Sequência da matrícula não pode ser zero" };
  if (digitoVerificador(m.slice(0, 7)) !== Number(m[7])) return { valido: false, motivo: "Dígito verificador inválido" };
  return { valido: true, motivo: null, matricula: m, vinculo };
}

/** "20048217" → "2-004821-7", como aparece na tela, no crachá e no holerite. */
export function formatarMatricula(valor) {
  const m = String(valor ?? "").replace(/\D/g, "");
  return m.length === 8 ? `${m[0]}-${m.slice(1, 7)}-${m[7]}` : String(valor ?? "");
}
