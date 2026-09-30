const MS_DIA = 86_400_000;

/**
 * Fuso de referência do produto: o foco da operação é o Polo Industrial de Manaus.
 * Toda data civil ("que dia é") nasce neste fuso — nunca de UTC nem de Brasília por
 * conta própria. Quando houver configuração por empresa, ela substitui este padrão.
 */
export const FUSO_PADRAO = "America/Manaus";

const formatadoresDeData = new Map();
function formatadorDeData(fuso) {
  if (!formatadoresDeData.has(fuso)) {
    formatadoresDeData.set(
      fuso,
      new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" })
    );
  }
  return formatadoresDeData.get(fuso);
}

/**
 * Todas as funções tratam datas civis (AAAA-MM-DD), não instantes.
 * Férias, aviso prévio, prazos do temporário e vencimento de ASO são contados em
 * data civil no fuso da empresa, e o servidor roda em UTC.
 * Aceita o nome do fuso (padrão) ou, por compatibilidade, o deslocamento em minutos.
 */
export function hoje(fuso = FUSO_PADRAO) {
  if (typeof fuso === "number") return new Date(Date.now() + fuso * 60_000).toISOString().slice(0, 10);
  return dataNoFuso(new Date(), fuso);
}

/**
 * Data civil (AAAA-MM-DD) de um instante no fuso indicado. Uma data civil já pronta
 * volta como está. É a única forma correta de transformar instante em dia:
 * `instante.slice(0, 10)` devolve o dia em UTC, que em Manaus vira o dia seguinte às 20h.
 */
export function dataNoFuso(valor, fuso = FUSO_PADRAO) {
  if (valor == null || valor === "") return null;
  // Só instante ISO completo é convertido; qualquer outro texto segue como está para a validação recusar.
  if (typeof valor === "string" && !/^\d{4}-\d{2}-\d{2}T/.test(valor)) return valor.slice(0, 10);
  const instante = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(instante.getTime())) return null;
  return formatadorDeData(fuso).format(instante);
}

/** Deslocamento do fuso em relação a UTC no instante dado, no formato ISO ("-04:00"). */
export function deslocamentoDoFuso(fuso = FUSO_PADRAO, instante = new Date()) {
  const nome = new Intl.DateTimeFormat("en-US", { timeZone: fuso, timeZoneName: "longOffset" })
    .formatToParts(instante)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(nome ?? "");
  return m ? `${m[1]}:${m[2] ?? "00"}` : "+00:00";
}

export function paraData(iso) {
  const [ano, mes, dia] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

export function paraISO(data) {
  return data.toISOString().slice(0, 10);
}

export function somarDias(iso, dias) {
  return paraISO(new Date(paraData(iso).getTime() + dias * MS_DIA));
}

export function somarMeses(iso, meses) {
  const origem = paraData(iso);
  const diaOriginal = origem.getUTCDate();
  const alvo = new Date(Date.UTC(origem.getUTCFullYear(), origem.getUTCMonth() + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(diaOriginal, ultimoDia));
  return paraISO(alvo);
}

export function somarAnos(iso, anos) {
  return somarMeses(iso, anos * 12);
}

export function diferencaDias(de, ate) {
  return Math.round((paraData(ate).getTime() - paraData(de).getTime()) / MS_DIA);
}

export function mesesEntre(de, ate) {
  const a = paraData(de);
  const b = paraData(ate);
  let meses = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) meses -= 1;
  return Math.max(0, meses);
}

export function periodoEntre(de, ate) {
  const a = paraData(de);
  const b = paraData(ate);
  if (b < a) return { anos: 0, meses: 0, dias: 0, negativo: true };

  let anos = b.getUTCFullYear() - a.getUTCFullYear();
  let meses = b.getUTCMonth() - a.getUTCMonth();
  let dias = b.getUTCDate() - a.getUTCDate();

  if (dias < 0) {
    meses -= 1;
    dias += new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 0)).getUTCDate();
  }
  if (meses < 0) {
    anos -= 1;
    meses += 12;
  }
  return { anos, meses, dias, negativo: false };
}

export function idadeEmAnos(nascimento, referencia = hoje()) {
  return periodoEntre(nascimento, referencia).anos;
}

export function anosCompletosEntre(de, ate) {
  return periodoEntre(de, ate).anos;
}

function ehFimDeSemana(iso) {
  const dia = paraData(iso).getUTCDay();
  return dia === 0 || dia === 6;
}

function normalizarFeriados(feriados = []) {
  return new Set(feriados.map((f) => String(f).slice(0, 10)));
}

export function ehDiaUtil(iso, feriados = []) {
  return !ehFimDeSemana(iso) && !normalizarFeriados(feriados).has(String(iso).slice(0, 10));
}

export function proximoDiaUtil(iso, feriados = []) {
  const lista = normalizarFeriados(feriados);
  let cursor = String(iso).slice(0, 10);
  while (ehFimDeSemana(cursor) || lista.has(cursor)) {
    cursor = somarDias(cursor, 1);
  }
  return cursor;
}

export function diaUtilAnterior(iso, feriados = []) {
  const lista = normalizarFeriados(feriados);
  let cursor = String(iso).slice(0, 10);
  while (ehFimDeSemana(cursor) || lista.has(cursor)) {
    cursor = somarDias(cursor, -1);
  }
  return cursor;
}

export function diasUteisEntre(de, ate, feriados = []) {
  const lista = normalizarFeriados(feriados);
  const total = diferencaDias(de, ate);
  if (total <= 0) return 0;
  let contador = 0;
  for (let i = 1; i <= total; i++) {
    const dia = somarDias(de, i);
    if (!ehFimDeSemana(dia) && !lista.has(dia)) contador += 1;
  }
  return contador;
}

/**
 * Lei 12.506/2011: 30 dias + 3 dias por ano completo de serviço na mesma
 * empresa, limitado a 60 dias adicionais (90 no total).
 */
export function avisoPrevioProporcional(dataAdmissao, dataComunicacao) {
  const anos = anosCompletosEntre(dataAdmissao, dataComunicacao);
  const adicional = Math.min(anos, 20) * 3;
  return { anosCompletos: anos, diasAdicionais: adicional, diasTotais: 30 + adicional };
}

export function estaVencendo(dataLimite, diasAntes = 30, referencia = hoje()) {
  const restantes = diferencaDias(referencia, dataLimite);
  return {
    vencendo: restantes >= 0 && restantes <= diasAntes,
    vencido: restantes < 0,
    diasRestantes: restantes,
    urgencia: restantes < 0 ? "VENCIDO" : restantes <= 7 ? "ALTA" : restantes <= 15 ? "MEDIA" : "BAIXA",
  };
}

export function competenciaDe(iso) {
  const texto = String(iso).slice(0, 10);
  return `${texto.slice(0, 4)}-${texto.slice(5, 7)}`;
}

export function formatarDataBR(iso) {
  const texto = String(iso).slice(0, 10);
  return `${texto.slice(8, 10)}/${texto.slice(5, 7)}/${texto.slice(0, 4)}`;
}
