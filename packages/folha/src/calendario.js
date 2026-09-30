/**
 * Calendário da competência para DSR e proporcionalidade. Feriados vêm por local de
 * trabalho (nacionais + estado + município), porque o DSR de um posto em Manaus não é o
 * de um posto em Rio Branco. Datas estaduais e municipais: conferir a lei local.
 */
import { paraISO as iso } from "../../core/src/datas.js";

const FIXOS_NACIONAIS = Object.freeze([
  ["01-01", "Confraternização Universal"],
  ["04-21", "Tiradentes"],
  ["05-01", "Dia do Trabalho"],
  ["09-07", "Independência do Brasil"],
  ["10-12", "Nossa Senhora Aparecida"],
  ["11-02", "Finados"],
  ["11-15", "Proclamação da República"],
  ["11-20", "Dia Nacional de Zumbi e da Consciência Negra"],
  ["12-25", "Natal"],
]);

export const FERIADOS_LOCAIS = Object.freeze({
  AM: [["09-05", "Elevação do Amazonas à categoria de província"]],
  "AM/Manaus": [["10-24", "Aniversário de Manaus"], ["12-08", "Nossa Senhora da Conceição"]],
});

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher) para a Sexta-feira Santa.
function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}


/** Feriados do ano para um local ("AM", "AM/Manaus"): lista de { data, nome }. */
export function feriadosDoAno(ano, { uf = null, municipio = null } = {}) {
  const lista = FIXOS_NACIONAIS.map(([md, nome]) => ({ data: `${ano}-${md}`, nome }));
  const sexta = pascoa(ano);
  sexta.setUTCDate(sexta.getUTCDate() - 2);
  lista.push({ data: iso(sexta), nome: "Sexta-feira Santa" });
  for (const chave of [uf, uf && municipio ? `${uf}/${municipio}` : null]) {
    for (const [md, nome] of FERIADOS_LOCAIS[chave] ?? []) lista.push({ data: `${ano}-${md}`, nome });
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Dias da competência: úteis (segunda a sábado, sem feriado) e de descanso (domingos e
 * feriados), usados no DSR sobre verbas variáveis.
 */
export function calendarioDaCompetencia(competencia, local = {}) {
  const [ano, mes] = competencia.split("-").map(Number);
  const dias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const feriados = feriadosDoAno(ano, local).filter((f) => f.data.startsWith(competencia));
  const datasFeriado = new Set(feriados.map((f) => f.data));
  let domingos = 0, feriadosForaDoDomingo = 0;
  for (let d = 1; d <= dias; d++) {
    const data = new Date(Date.UTC(ano, mes - 1, d));
    const texto = iso(data);
    if (data.getUTCDay() === 0) domingos++;
    else if (datasFeriado.has(texto)) feriadosForaDoDomingo++;
  }
  const descanso = domingos + feriadosForaDoDomingo;
  return { competencia, dias, domingos, feriados, uteis: dias - descanso, descanso };
}
