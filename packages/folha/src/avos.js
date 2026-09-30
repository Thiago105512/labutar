/**
 * Avos (1/12) do 13º e das férias e os períodos aquisitivos. Datas ISO (AAAA-MM-DD).
 *
 * - 13º (Lei 4.090/1962, art. 1º, § 2º): conta o mês do ano civil com 15 dias ou mais de contrato.
 * - Férias (CLT, art. 146, parágrafo único): conta cada mês do período aquisitivo completo e a
 *   fração final maior que 14 dias.
 * - O aviso prévio indenizado projeta o fim do contrato para os dois (CLT, art. 487, § 1º;
 *   OJ 82 da SDI-1 do TST).
 */
import { paraData, paraISO, somarDias, somarMeses, diferencaDias } from "../../core/src/datas.js";

const ultimoDiaDoMes = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** Avos do 13º no ano civil, entre a admissão e o fim do contrato (ou 31/12). */
export function avosDecimoTerceiro(ano, { admissao, fim = null }) {
  let avos = 0;
  for (let mes = 1; mes <= 12; mes++) {
    const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const fimMes = `${ano}-${String(mes).padStart(2, "0")}-${ultimoDiaDoMes(ano, mes)}`;
    const de = admissao > inicioMes ? admissao : inicioMes;
    const ate = fim && fim < fimMes ? fim : fimMes;
    if (ate < de) continue;
    if (diferencaDias(de, ate) + 1 >= 15) avos += 1;
  }
  return avos;
}

/**
 * Períodos aquisitivos desde a admissão até `ate` (inclusive). Cada um com início, fim e se
 * está completo. O concessivo é de 12 meses depois do fim do aquisitivo (art. 134).
 */
export function periodosAquisitivos(admissao, ate) {
  const periodos = [];
  let inicio = admissao;
  while (inicio <= ate) {
    const fim = somarDias(somarMeses(inicio, 12), -1);
    periodos.push({ inicio, fim, completo: fim <= ate, fimConcessivo: somarMeses(fim, 12) });
    inicio = somarDias(fim, 1);
  }
  return periodos;
}

/** Avos de férias de um período aquisitivo que termina (ou é interrompido) em `ate`. */
export function avosFerias(inicioAquisitivo, ate) {
  if (ate < inicioAquisitivo) return 0;
  let avos = 0;
  let inicio = inicioAquisitivo;
  while (avos < 12) {
    const proximo = somarMeses(inicio, 1);
    const fimDoMes = somarDias(proximo, -1);
    if (fimDoMes <= ate) {
      avos += 1;
      inicio = proximo;
      continue;
    }
    if (diferencaDias(inicio, ate) + 1 > 14) avos += 1;
    break;
  }
  return avos;
}

/** Dias corridos de um período, para o saldo de salário no mês comercial de 30 dias. */
export function diasNoMesComercial(de, ate) {
  const a = paraData(de), b = paraData(ate);
  const ultimo = ultimoDiaDoMes(b.getUTCFullYear(), b.getUTCMonth() + 1);
  // Mês inteiro trabalhado conta 30 (mesmo em fevereiro ou em mês de 31 dias).
  if (a.getUTCDate() === 1 && b.getUTCDate() === ultimo) return 30;
  return Math.min(30, diferencaDias(paraISO(a), paraISO(b)) + 1);
}
