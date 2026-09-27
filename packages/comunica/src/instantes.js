const MS_MINUTO = 60_000;

/**
 * Normaliza Date | número | texto ISO-8601 para ISO-8601 UTC.
 * Texto sem fuso ("2026-10-05T14:00") é interpretado no fuso do runtime, como
 * manda o ECMAScript — por isso horários do Labutar devem ser gravados com "Z"
 * ou offset explícito. Lançar erro aqui é proposital: um lembrete agendado numa
 * data ambígua vira entrevista perdida.
 */
export function paraInstante(valor) {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) throw new Error("Data inválida");
    return valor.toISOString();
  }
  if (typeof valor === "number") {
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) throw new Error(`Timestamp inválido: ${valor}`);
    return data.toISOString();
  }
  const texto = String(valor ?? "").trim();
  const data = new Date(texto);
  if (Number.isNaN(data.getTime())) throw new Error(`Data/hora inválida: "${valor}"`);
  return data.toISOString();
}

/** Como paraInstante, mas devolve `padrao` em vez de lançar quando vem vazio. */
export function instanteOpcional(valor, padrao = null) {
  if (valor === null || valor === undefined || valor === "") return padrao;
  return paraInstante(valor);
}

export function agora() {
  return new Date().toISOString();
}

export function somarMinutos(instante, minutos) {
  return new Date(new Date(paraInstante(instante)).getTime() + minutos * MS_MINUTO).toISOString();
}

export function minutosEntre(de, ate) {
  return Math.round((new Date(paraInstante(ate)).getTime() - new Date(paraInstante(de)).getTime()) / MS_MINUTO);
}

/** Minutos de "HH:MM" (segundos e fuso são ignorados). */
export function minutosDaHora(hora) {
  const partes = String(hora ?? "").trim().split(":");
  const horas = Number(partes[0] ?? "0");
  const minutos = Number(partes[1] ?? "0");
  if (!Number.isFinite(horas) || !Number.isFinite(minutos)) {
    throw new Error(`Horário inválido: "${hora}" (use HH:MM)`);
  }
  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) {
    throw new Error(`Horário fora do intervalo 00:00–23:59: "${hora}"`);
  }
  return horas * 60 + minutos;
}

/** Converte data civil + minutos do dia em instante UTC, dado o fuso em minutos. */
export function instanteCivil(dataISO, minutos, fusoMinutos) {
  const [ano, mes, dia] = String(dataISO).slice(0, 10).split("-").map(Number);
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return new Date(Date.UTC(ano, mes - 1, dia, horas, resto) - fusoMinutos * MS_MINUTO).toISOString();
}
