import { novoId } from "../../core/src/ids.js";
import { CANAIS } from "./canais.js";
import {
  ATRASO_TOLERADO_MINUTOS,
  LEMBRETES_ENTREVISTA_PADRAO,
  STATUS_LEMBRETE,
  TIPO_LEMBRETE,
} from "./constantes.js";
import { agora, minutosEntre, paraInstante, somarMinutos } from "./instantes.js";

const VALOR_CANAIS = Object.values(CANAIS);

function normalizarCanais(canais) {
  const lista = (Array.isArray(canais) ? canais : [canais]).map((c) => String(c ?? "").toUpperCase());
  const conhecidos = lista.filter((c) => VALOR_CANAIS.includes(c));
  if (conhecidos.length !== lista.length) {
    const desconhecidos = lista.filter((c) => !VALOR_CANAIS.includes(c)).join(", ");
    throw new Error(`Canal de lembrete inexistente: ${desconhecidos}. Use um de: ${VALOR_CANAIS.join(", ")}.`);
  }
  return [...new Set(conhecidos)];
}

function dataDe(instante) {
  return new Date(paraInstante(instante));
}

/**
 * Agenda um lembrete. `quando` é o instante do evento (início da entrevista);
 * `disparoEm` sai subtraído de `antesMinutos`. Data ilegível lança erro em vez de
 * agendar no passado: lembrete errado é candidato esperando sozinho na sala.
 */
export function agendarLembrete({
  id = null,
  tipo = TIPO_LEMBRETE.GENERICO,
  destino = null,
  quando,
  antesMinutos = 0,
  canais = [CANAIS.EMAIL],
  templateId = null,
  contexto = {},
  referenciaId = null,
  criadoEm = null,
} = {}) {
  const eventoEm = paraInstante(quando);
  const listaCanais = normalizarCanais(canais);
  if (listaCanais.length === 0) throw new Error("Um lembrete precisa de ao menos um canal.");

  const antes = Number(antesMinutos ?? 0);
  if (!Number.isFinite(antes) || antes < 0) {
    throw new Error(`antesMinutos precisa ser um número >= 0 (recebido: ${antesMinutos}).`);
  }

  return {
    id: id ?? novoId("LEMB"),
    tipo,
    referenciaId,
    destino,
    eventoEm,
    antesMinutos: antes,
    disparoEm: somarMinutos(eventoEm, -antes),
    canais: listaCanais,
    templateId,
    contexto: { ...contexto },
    envios: [],
    status: STATUS_LEMBRETE.AGENDADO,
    enviadoEm: null,
    canceladoEm: null,
    motivoCancelamento: null,
    criadoEm: criadoEm ? paraInstante(criadoEm) : agora(),
  };
}

/** Várias antecedências de uma vez — o caso típico é [1440, 60]. */
export function agendarLembretes(configuracao = {}) {
  const { antesMinutos = [0], ...resto } = configuracao;
  const lista = Array.isArray(antesMinutos) ? antesMinutos : [antesMinutos];
  return lista.map((antes) => agendarLembrete({ ...resto, antesMinutos: antes }));
}

/**
 * Lembretes de entrevista seguindo o modelo de dados: usa `entrevista.lembretes`
 * quando configurado (respeitando `enviar: false`) e cai no padrão 24h + 1h.
 */
export function lembretesParaEntrevista(entrevista, { canais = [CANAIS.WHATSAPP, CANAIS.EMAIL], templateId = null, contexto = {}, destino = null } = {}) {
  const inicio = entrevista?.agenda?.inicio;
  const configurados = Array.isArray(entrevista?.lembretes) && entrevista.lembretes.length
    ? entrevista.lembretes
    : LEMBRETES_ENTREVISTA_PADRAO;

  return configurados
    .filter((item) => item && item.enviar !== false)
    .map((item) =>
      agendarLembrete({
        tipo: TIPO_LEMBRETE.ENTREVISTA,
        referenciaId: entrevista?.id ?? null,
        destino: destino ?? item.destino ?? null,
        quando: item.quando ?? inicio,
        antesMinutos: item.antesMinutos ?? 0,
        canais: item.canais ?? canais,
        templateId: item.templateId ?? templateId,
        contexto: { entrevistaId: entrevista?.id ?? null, ...contexto },
      })
    );
}

/** Canais que ainda não foram disparados. É essa lista que o servidor percorre. */
export function canaisPendentes(lembrete) {
  const enviados = new Set((lembrete?.envios ?? []).map((envio) => String(envio.canal)));
  return (lembrete?.canais ?? []).filter((canal) => !enviados.has(String(canal)));
}

export function estaCompleto(lembrete) {
  const canais = lembrete?.canais ?? [];
  return canais.length > 0 && canaisPendentes(lembrete).length === 0;
}

/** Minutos desde o disparo previsto; 0 enquanto o lembrete não venceu. */
export function minutosAtraso(lembrete, referencia = new Date()) {
  if (!lembrete?.disparoEm) return 0;
  const atraso = minutosEntre(lembrete.disparoEm, referencia instanceof Date ? referencia : paraInstante(referencia));
  return atraso > 0 ? atraso : 0;
}

export function detalheAtraso(lembrete, referencia = new Date()) {
  const ref = referencia instanceof Date ? referencia.toISOString() : paraInstante(referencia);
  const atraso = minutosAtraso(lembrete, ref);
  const eventoJaOcorreu = !!lembrete?.eventoEm && dataDe(lembrete.eventoEm).getTime() <= dataDe(ref).getTime();
  return {
    minutosAtraso: atraso,
    eventoJaOcorreu,
    motivo: eventoJaOcorreu
      ? "O evento já começou: lembrar não adianta, revisar ou cancelar."
      : atraso > ATRASO_TOLERADO_MINUTOS
        ? `Disparo previsto há ${atraso} minutos e ainda não saiu.`
        : null,
  };
}

export function statusLembrete(lembrete, referencia = new Date()) {
  if (lembrete?.status === STATUS_LEMBRETE.CANCELADO) return STATUS_LEMBRETE.CANCELADO;
  if (estaCompleto(lembrete)) return STATUS_LEMBRETE.ENVIADO;

  const ref = referencia instanceof Date ? referencia.toISOString() : paraInstante(referencia);
  if (dataDe(lembrete.disparoEm).getTime() > dataDe(ref).getTime()) return STATUS_LEMBRETE.AGENDADO;

  const atraso = minutosAtraso(lembrete, ref);
  const { eventoJaOcorreu } = detalheAtraso(lembrete, ref);
  return atraso > ATRASO_TOLERADO_MINUTOS || eventoJaOcorreu ? STATUS_LEMBRETE.ATRASADO : STATUS_LEMBRETE.PENDENTE;
}

function porDisparo(a, b) {
  const instanteA = String(a?.disparoEm ?? "");
  const instanteB = String(b?.disparoEm ?? "");
  if (instanteA === instanteB) return String(a?.id ?? "") < String(b?.id ?? "") ? -1 : 1;
  return instanteA < instanteB ? -1 : 1;
}

function acionaveis(lembretes, ref) {
  return (Array.isArray(lembretes) ? lembretes : [])
    .filter((lembrete) => lembrete && lembrete.status !== STATUS_LEMBRETE.CANCELADO)
    .filter((lembrete) => !estaCompleto(lembrete))
    .filter((lembrete) => lembrete.disparoEm && dataDe(lembrete.disparoEm).getTime() <= dataDe(ref).getTime())
    .sort(porDisparo);
}

/**
 * Fila acionável: disparo previsto já venceu e ainda falta canal. Inclui os
 * atrasados — quem filtra o que é grave é `lembretesAtrasados`.
 */
export function lembretesPendentes(lembretes = [], referencia = new Date()) {
  const ref = referencia instanceof Date ? referencia.toISOString() : paraInstante(referencia);
  return acionaveis(lembretes, ref);
}

/**
 * Pendentes que já não são apenas fila: estouraram a tolerância de atraso ou o
 * evento começou (lembrete de entrevista que chegou depois da entrevista).
 */
export function lembretesAtrasados(lembretes = [], referencia = new Date()) {
  const ref = referencia instanceof Date ? referencia.toISOString() : paraInstante(referencia);
  return acionaveis(lembretes, ref).filter((lembrete) => {
    const { minutosAtraso: atraso, eventoJaOcorreu } = detalheAtraso(lembrete, ref);
    return eventoJaOcorreu || atraso > ATRASO_TOLERADO_MINUTOS;
  });
}

/**
 * Marca o disparo em um canal. Idempotente por canal: o segundo registro do
 * mesmo canal devolve o mesmo objeto e preserva o horário do primeiro.
 * Só vira ENVIADO quando TODOS os canais configurados dispararam — lembrete de
 * 2 canais não pode ser dado como concluído depois do primeiro.
 */
export function marcarEnviado(lembrete, canal, em = agora()) {
  if (!lembrete || !canal) return lembrete;
  const nomeCanal = String(canal).toUpperCase();
  const instante = paraInstante(em);
  const envios = Array.isArray(lembrete.envios) ? lembrete.envios : [];

  const repetido = envios.find((envio) => String(envio.canal) === nomeCanal);
  if (repetido) return lembrete;

  const atualizado = { ...lembrete, envios: [...envios, { canal: nomeCanal, em: instante }] };
  if (atualizado.status !== STATUS_LEMBRETE.CANCELADO) {
    atualizado.status = statusLembrete(atualizado, instante);
  }
  atualizado.enviadoEm = estaCompleto(atualizado) ? instante : null;
  return atualizado;
}

export function cancelarLembrete(lembrete, motivo = null, em = agora()) {
  if (!lembrete || lembrete.status === STATUS_LEMBRETE.CANCELADO) return lembrete;
  return {
    ...lembrete,
    status: STATUS_LEMBRETE.CANCELADO,
    motivoCancelamento: motivo === null ? null : String(motivo),
    canceladoEm: paraInstante(em),
  };
}

/** Reagenda (entrevista remarcada): zera os envios e recalcula o disparo. */
export function reagendarLembrete(lembrete, quando, em = agora()) {
  if (!lembrete) return lembrete;
  const eventoEm = paraInstante(quando);
  return {
    ...lembrete,
    eventoEm,
    disparoEm: somarMinutos(eventoEm, -(Number(lembrete.antesMinutos) || 0)),
    envios: [],
    enviadoEm: null,
    status: STATUS_LEMBRETE.AGENDADO,
    canceladoEm: null,
    motivoCancelamento: null,
    atualizadoEm: paraInstante(em),
  };
}
