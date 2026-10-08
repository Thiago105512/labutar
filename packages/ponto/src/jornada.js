/**
 * Apuração da jornada a partir das marcações: dia a dia (trabalhado, extras, atrasos, faltas,
 * adicional noturno, intervalo) e o mês (totais para a folha, DSR perdido). Regras da CLT:
 * - Tolerância de até 10 minutos no dia sem desconto nem extra (art. 58, § 1º).
 * - Intervalo mínimo de 1 h acima de 6 h trabalhadas e de 15 min entre 4 h e 6 h (art. 71);
 *   o tempo suprimido é pago com 50%, de natureza indenizatória (art. 71, § 4º).
 * - Noturno das 22 h às 5 h, com a hora de 52min30s (art. 73) — salvo regra da convenção.
 * - Trabalho em domingo ou feriado sem folga compensatória: 100% (Lei 605/1949, art. 9º).
 * - Falta injustificada na semana tira o DSR (Lei 605/1949, art. 6º).
 * Tempos em minutos.
 */
import { somarDias } from "../../core/src/datas.js";

export const ESCALAS = Object.freeze({
  "44H_SEG_SEX": Object.freeze({ nome: "44 h, segunda a sexta (8h48 por dia)", porDiaDaSemana: Object.freeze({ 1: 528, 2: 528, 3: 528, 4: 528, 5: 528 }) }),
  "44H_SEG_SAB": Object.freeze({ nome: "44 h, segunda a sábado (8 h + 4 h no sábado)", porDiaDaSemana: Object.freeze({ 1: 480, 2: 480, 3: 480, 4: 480, 5: 480, 6: 240 }) }),
  "40H_SEG_SEX": Object.freeze({ nome: "40 h, segunda a sexta", porDiaDaSemana: Object.freeze({ 1: 480, 2: 480, 3: 480, 4: 480, 5: 480 }) }),
  "12X36": Object.freeze({ nome: "12x36 diurno (plantão de 12 h a cada 48 h)", plantao: 720, alternada: true }),
  // Plantão que vira a noite: a saída da manhã seguinte é da jornada do dia anterior.
  "12X36_NOTURNO": Object.freeze({ nome: "12x36 noturno (19 h às 7 h)", plantao: 720, alternada: true, virada: "12:00" }),
});

const minutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const diaDaSemana = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** Minutos previstos no dia pela escala; feriado é descanso na escala semanal. */
export function previstoNoDia(escala, data, { feriados = new Set(), inicio12x36 = null } = {}) {
  const e = ESCALAS[escala];
  if (!e) throw new Error(`escala ${escala} não prevista`);
  if (e.alternada) {
    if (!inicio12x36) throw new Error("escala 12x36 sem o dia de referência de um plantão");
    return Math.abs(diasEntre(inicio12x36, data)) % 2 === 0 ? e.plantao : 0;
  }
  if (feriados.has(data)) return 0;
  return e.porDiaDaSemana[diaDaSemana(data)] ?? 0;
}

/** Sobreposição de [a, b) com as janelas noturnas (22 h–5 h) do dia e da madrugada seguinte. */
function minutosNoturnos(a, b) {
  const janelas = [[-120, 300], [1320, 1740], [2760, 3180]];
  return janelas.reduce((s, [i, f]) => s + Math.max(0, Math.min(b, f) - Math.max(a, i)), 0);
}

/**
 * @param dados { data, horas: ["HH:MM", ...] já da jornada (as da madrugada seguinte com +24 h em
 *   `horasDoDiaSeguinte`), previsto, descanso (domingo/feriado na escala semanal), abonado? }
 * @param opcoes { tolerancia = 10, noturnoReduzido = true, domingoFeriadoEm100 = true }
 */
export function apurarDia({ data, horas = [], horasDoDiaSeguinte = [], previsto, descanso = false, abonado = false }, opcoes = {}) {
  const tolerancia = opcoes.tolerancia ?? 10;
  const tempos = [...horas.map(minutos), ...horasDoDiaSeguinte.map((h) => minutos(h) + 1440)].sort((a, b) => a - b);
  const inconsistencias = [];
  if (tempos.length % 2 === 1) inconsistencias.push("marcação ímpar: falta entrada ou saída");
  const pares = [];
  for (let i = 0; i + 1 < tempos.length; i += 2) pares.push([tempos[i], tempos[i + 1]]);
  const trabalhado = pares.reduce((s, [a, b]) => s + (b - a), 0);
  const intervalo = pares.slice(1).reduce((s, [a], i) => s + (a - pares[i][1]), 0);
  const noturnoRelogio = pares.reduce((s, [a, b]) => s + minutosNoturnos(a, b), 0);

  // Intervalo mínimo pelo tempo trabalhado; o que faltar é suprimido.
  const minimo = trabalhado > 360 ? 60 : trabalhado > 240 ? 15 : 0;
  const intervaloSuprimido = minimo ? Math.max(0, minimo - intervalo) : 0;

  const saida = {
    data, marcacoes: tempos.map((t) => `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`),
    previsto, trabalhado, intervalo, intervaloSuprimido, noturno: noturnoRelogio,
    extra: 0, extra100: 0, debito: 0, falta: false, abonado, descanso, inconsistencias,
  };
  if (abonado) return saida;
  if (previsto > 0 && tempos.length === 0) return { ...saida, falta: true, debito: previsto };
  if (descanso && trabalhado > 0 && (opcoes.domingoFeriadoEm100 ?? true)) return { ...saida, extra100: trabalhado };
  const diferenca = trabalhado - previsto;
  if (Math.abs(diferenca) <= tolerancia) return saida;
  return diferenca > 0 ? { ...saida, extra: diferenca } : { ...saida, debito: -diferenca };
}

/**
 * Apuração do mês.
 * @param dados { competencia, escala, marcacoes: [{ data, hora }], feriados: Set, inicio12x36?,
 *   ajustes?: { [data]: { horas?: [...], abonado?: bool, motivo } }, admissao?, desligamento?,
 *   foraDoContrato?: Set (férias e afastamentos), virada?: "HH:MM" (marcação antes disso é do dia anterior) }
 * @param opcoes as de apurarDia, mais noturnoReduzido
 */
export function apurarMes({ competencia, escala, marcacoes = [], feriados = new Set(), inicio12x36 = null, ajustes = {}, admissao = null, desligamento = null, foraDoContrato = new Set(), virada = null }, opcoes = {}) {
  const e = ESCALAS[escala];
  if (!e) throw new Error(`escala ${escala} não prevista`);
  const corte = minutos(virada ?? e.virada ?? "04:00");
  const porDia = new Map();
  for (const m of marcacoes) {
    // Marcação antes da virada pertence à jornada do dia anterior (saída de quem virou a noite).
    const daJornada = minutos(m.hora) < corte ? somarDias(m.data, -1) : m.data;
    const lista = porDia.get(daJornada) ?? { horas: [], seguinte: [] };
    (daJornada === m.data ? lista.horas : lista.seguinte).push(m.hora);
    porDia.set(daJornada, lista);
  }
  const [ano, mes] = competencia.split("-").map(Number);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const dias = [];
  for (let d = 1; d <= ultimo; d++) {
    const data = `${competencia}-${String(d).padStart(2, "0")}`;
    if ((admissao && data < admissao) || (desligamento && data > desligamento) || foraDoContrato.has(data)) {
      dias.push({ data, foraDoContrato: true, previsto: 0, trabalhado: 0, extra: 0, extra100: 0, debito: 0, noturno: 0, intervaloSuprimido: 0, falta: false, marcacoes: [], inconsistencias: [] });
      continue;
    }
    const previsto = previstoNoDia(escala, data, { feriados, inicio12x36 });
    const descanso = !e.alternada && previsto === 0 && (diaDaSemana(data) === 0 || feriados.has(data));
    const ajuste = ajustes[data];
    const doRelogio = porDia.get(data) ?? { horas: [], seguinte: [] };
    const dia = apurarDia({
      data, previsto, descanso, abonado: Boolean(ajuste?.abonado),
      horas: ajuste?.horas ?? doRelogio.horas, horasDoDiaSeguinte: ajuste?.horas ? [] : doRelogio.seguinte,
    }, opcoes);
    if (ajuste) dia.ajuste = { motivo: ajuste.motivo, abonado: Boolean(ajuste.abonado), original: [...doRelogio.horas, ...doRelogio.seguinte] };
    dias.push(dia);
  }
  // DSR perdido: semanas (domingo a sábado) com falta injustificada.
  const semanas = new Set(dias.filter((x) => x.falta).map((x) => somarDias(x.data, -diaDaSemana(x.data))));
  const soma = (k) => dias.reduce((s, x) => s + (x[k] ?? 0), 0);
  const reduzido = opcoes.noturnoReduzido ?? true;
  return {
    competencia, escala, dias,
    totais: {
      previsto: soma("previsto"), trabalhado: soma("trabalhado"),
      extras: soma("extra"), extras100: soma("extra100"), debito: dias.filter((x) => !x.falta).reduce((s, x) => s + x.debito, 0),
      faltasDias: dias.filter((x) => x.falta).length, dsrPerdidos: semanas.size,
      noturnoRelogio: soma("noturno"), noturnoHoras: Math.round((soma("noturno") / (reduzido ? 52.5 : 60)) * 100) / 100,
      intervaloSuprimido: soma("intervaloSuprimido"),
      inconsistencias: dias.filter((x) => x.inconsistencias.length).length,
    },
  };
}

/**
 * Banco de horas da convenção (ex.: AM000038/2026, cláusula 19ª): as primeiras N horas extras do
 * mês são pagas com o adicional; o excedente vai ao banco por até P dias, compensado hora por
 * hora (atrasos e saídas antecipadas descontam do banco); saldo credor vencido é pago com o
 * adicional. Sem adesão escrita do colaborador, não há banco: tudo é pago ou descontado no mês.
 * @param regra instrumento.bancoHoras, @param lotes [{ competencia, minutos, vence }] (mais antigo primeiro)
 * @returns { pagas50, atrasos, lotes, creditado, compensado, vencido, saldo }
 */
export function aplicarBancoDeHoras(regra, { adesao, extras, debito, lotes = [], competencia, fimDoMes }) {
  if (!regra || !adesao) return { pagas50: extras, atrasos: debito, lotes, creditado: 0, compensado: 0, vencido: 0, saldo: lotes.reduce((s, l) => s + l.minutos, 0), banco: false };
  const limite = regra.horasPagasNoMes * 60;
  const pagas = Math.min(extras, limite);
  let credito = extras - pagas;
  const novos = lotes.map((l) => ({ ...l }));
  // Débitos do mês compensam primeiro o crédito mais antigo, depois o do próprio mês.
  let resto = debito;
  let compensado = 0;
  for (const l of novos) {
    if (resto <= 0) break;
    if (l.minutos <= 0) continue;
    const usar = Math.min(l.minutos, resto);
    l.minutos -= usar; resto -= usar; compensado += usar;
  }
  const doMes = Math.min(credito, resto);
  credito -= doMes; resto -= doMes; compensado += doMes;
  if (credito > 0) novos.push({ competencia, minutos: credito, vence: somarDias(fimDoMes, regra.prazoDias) });
  // Débito sem crédito para compensar fica como saldo negativo (compensado por extras futuras).
  if (resto > 0) novos.push({ competencia, minutos: -resto, vence: null });
  // Saldo credor vencido: pago com o adicional da convenção.
  let vencido = 0;
  for (const l of novos) if (l.minutos > 0 && l.vence && l.vence <= fimDoMes) { vencido += l.minutos; l.minutos = 0; }
  const ativos = consolidar(novos.filter((l) => l.minutos !== 0));
  return { pagas50: pagas + vencido, atrasos: 0, lotes: ativos, creditado: credito, compensado, vencido, saldo: ativos.reduce((s, l) => s + l.minutos, 0), banco: true };
}

/** Saldo negativo é abatido do crédito mais antigo, para o banco não ter os dois sinais. */
function consolidar(lotes) {
  let negativo = -lotes.filter((l) => l.minutos < 0).reduce((s, l) => s + l.minutos, 0);
  const positivos = lotes.filter((l) => l.minutos > 0).map((l) => ({ ...l }));
  for (const l of positivos) {
    if (!negativo) break;
    const usar = Math.min(l.minutos, negativo);
    l.minutos -= usar; negativo -= usar;
  }
  const saida = positivos.filter((l) => l.minutos > 0);
  if (negativo) saida.push({ competencia: lotes.find((l) => l.minutos < 0).competencia, minutos: -negativo, vence: null });
  return saida;
}

const horas = (min) => Math.round((min / 60) * 100) / 100;

/** Lançamentos da folha a partir da apuração e do banco de horas (horas com 2 casas). */
export function lancamentosDoPonto(apuracao, banco) {
  const t = apuracao.totais;
  const l = {
    horasExtras50: horas(banco.pagas50), horasExtras100: horas(t.extras100), horasNoturnas: t.noturnoHoras,
    faltasDias: t.faltasDias, dsrPerdidos: t.dsrPerdidos, atrasosHoras: horas(banco.atrasos), intervaloSuprimidoHoras: horas(t.intervaloSuprimido),
  };
  return Object.fromEntries(Object.entries(l).filter(([, v]) => v > 0));
}
