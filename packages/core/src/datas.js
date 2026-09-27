const MS_DIA = 86_400_000;
const OFFSET_BRASIL_MIN = -180;

/**
 * Todas as funções tratam datas civis (AAAA-MM-DD), não instantes.
 * O fuso de referência é configurável porque férias, aviso prévio e
 * vencimento de ASO são contados em data civil, e o servidor pode estar em UTC.
 */
export function hoje(offsetMinutos = OFFSET_BRASIL_MIN) {
  const deslocado = new Date(Date.now() + offsetMinutos * 60_000);
  return deslocado.toISOString().slice(0, 10);
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
