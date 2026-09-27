export const PRIORIDADE_AVISO = Object.freeze({
  BAIXA: "BAIXA",
  NORMAL: "NORMAL",
  ALTA: "ALTA",
  URGENTE: "URGENTE",
});

/** Peso de ordenação do mural: quanto menor, mais alto o aviso aparece. */
export const PESO_PRIORIDADE = Object.freeze({
  URGENTE: 0,
  ALTA: 1,
  NORMAL: 2,
  BAIXA: 3,
});

export const PUBLICO_ALVO = Object.freeze({
  TODOS: "TODOS",
  PAPEIS: "PAPEIS",
  USUARIOS: "USUARIOS",
  VAGA: "VAGA",
});

export const URGENCIA = Object.freeze({
  BAIXA: "BAIXA",
  NORMAL: "NORMAL",
  ALTA: "ALTA",
  CRITICA: "CRITICA",
});

export const STATUS_LEMBRETE = Object.freeze({
  AGENDADO: "AGENDADO",
  PENDENTE: "PENDENTE",
  ATRASADO: "ATRASADO",
  ENVIADO: "ENVIADO",
  CANCELADO: "CANCELADO",
});

export const TIPO_LEMBRETE = Object.freeze({
  ENTREVISTA: "ENTREVISTA",
  PROPOSTA: "PROPOSTA",
  DOCUMENTO: "DOCUMENTO",
  RETORNO_CANDIDATO: "RETORNO_CANDIDATO",
  FEEDBACK_GESTOR: "FEEDBACK_GESTOR",
  GENERICO: "GENERICO",
});

/**
 * Atraso a partir do qual um lembrete vencido deixa de ser só "pendente" e
 * passa a ser tratado como falha de operação (aparece em lembretesAtrasados).
 */
export const ATRASO_TOLERADO_MINUTOS = 60;

/** Entrevista é o caso principal: 24h e 1h antes, no WhatsApp e no e-mail. */
export const LEMBRETES_ENTREVISTA_PADRAO = Object.freeze([
  Object.freeze({ antesMinutos: 1440 }),
  Object.freeze({ antesMinutos: 60 }),
]);

export const CATEGORIA_TEMPLATE = Object.freeze({
  CANDIDATO: "CANDIDATO",
  INTERNO: "INTERNO",
});
