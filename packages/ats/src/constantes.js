export const STATUS_VAGA = Object.freeze({
  RASCUNHO: "RASCUNHO",
  ABERTA: "ABERTA",
  PAUSADA: "PAUSADA",
  ENCERRADA: "ENCERRADA",
  CANCELADA: "CANCELADA",
});

export const TIPO_ETAPA = Object.freeze({
  TRIAGEM: "TRIAGEM",
  CURRICULO: "CURRICULO",
  AVALIACAO: "AVALIACAO",
  ENTREVISTA: "ENTREVISTA",
  PROPOSTA: "PROPOSTA",
  APPROVACAO: "APPROVACAO",
  ADMISSAO: "ADMISSAO",
  SAIDA: "SAIDA",
});

export const MOTIVO_SAIDA = Object.freeze({
  REPROVADO: "REPROVADO",
  DESISTENTE: "DESISTENTE",
  BANCO_TALENTOS: "BANCO_TALENTOS",
  VAGA_CANCELADA: "VAGA_CANCELADA",
});

export const STATUS_CANDIDATURA = Object.freeze({
  EM_ANDAMENTO: "EM_ANDAMENTO",
  APROVADO: "APROVADO",
  REPROVADO: "REPROVADO",
  DESISTENTE: "DESISTENTE",
  BANCO: "BANCO",
});

export const DECISAO_TRIAGEM = Object.freeze({
  APROVADO_AUTOMATICO: "APROVADO_AUTOMATICO",
  ANALISE_MANUAL: "ANALISE_MANUAL",
  REPROVADO_AUTOMATICO: "REPROVADO_AUTOMATICO",
  REPROVADO_KNOCKOUT: "REPROVADO_KNOCKOUT",
});

export const TIPO_KNOCKOUT = Object.freeze({
  SIM_NAO: "SIM_NAO",
  MULTIPLA: "MULTIPLA",
  NUMERICA: "NUMERICA",
  TEXTO: "TEXTO",
  DATA: "DATA",
});

export const MODELO_TRABALHO = Object.freeze({
  PRESENCIAL: "PRESENCIAL",
  HIBRIDO: "HIBRIDO",
  REMOTO: "REMOTO",
});

export const NIVEL_FORMACAO = Object.freeze({
  FUNDAMENTAL: 1,
  MEDIO: 2,
  TECNICO: 3,
  SUPERIOR: 4,
  POS_GRADUACAO: 5,
  MESTRADO: 6,
  DOUTORADO: 7,
});

export const NIVEL_IDIOMA = Object.freeze({
  BASICO: 1,
  INTERMEDIARIO: 2,
  AVANCADO: 3,
  FLUENTE: 4,
  NATIVO: 5,
});

/** Etapa de triagem e etapas de saída existem sempre, mesmo em templates curtos. */
export const ETAPAS_PADRAO = Object.freeze([
  { id: "triagem", nome: "Triagem automática", ordem: 1, tipo: TIPO_ETAPA.TRIAGEM, slaDias: 1 },
  { id: "curriculo", nome: "Análise de currículo", ordem: 2, tipo: TIPO_ETAPA.CURRICULO, slaDias: 3 },
  { id: "avaliacao", nome: "Testes e avaliações", ordem: 3, tipo: TIPO_ETAPA.AVALIACAO, slaDias: 5 },
  { id: "entrevista-rh", nome: "Entrevista RH", ordem: 4, tipo: TIPO_ETAPA.ENTREVISTA, slaDias: 5 },
  { id: "entrevista-gestor", nome: "Entrevista com gestor", ordem: 5, tipo: TIPO_ETAPA.ENTREVISTA, slaDias: 5 },
  { id: "proposta", nome: "Proposta", ordem: 6, tipo: TIPO_ETAPA.PROPOSTA, slaDias: 3 },
  { id: "aprovado", nome: "Aprovado", ordem: 7, tipo: TIPO_ETAPA.APPROVACAO, slaDias: 2 },
  { id: "admissao", nome: "Admissão", ordem: 8, tipo: TIPO_ETAPA.ADMISSAO, slaDias: 10 },
  { id: "reprovado", nome: "Reprovado", ordem: 90, tipo: TIPO_ETAPA.SAIDA, motivo: MOTIVO_SAIDA.REPROVADO },
  { id: "desistente", nome: "Desistente", ordem: 91, tipo: TIPO_ETAPA.SAIDA, motivo: MOTIVO_SAIDA.DESISTENTE },
  { id: "banco", nome: "Banco de talentos", ordem: 92, tipo: TIPO_ETAPA.SAIDA, motivo: MOTIVO_SAIDA.BANCO_TALENTOS },
]);

export const REGRAS_TRIAGEM_PADRAO = Object.freeze({
  pesos: { competencias: 40, experiencia: 25, formacao: 15, idiomas: 10, localizacao: 10 },
  corteMinimo: 60,
  corteDestaque: 85,
  reprovacaoAutomatica: false,
  experienciaAnosMinimos: 0,
  /**
   * "todas" soma toda a experiência; "relacionadas" só a que tem competência
   * marcada em comum com a vaga. "relacionadas" subestima currículo não
   * tageado — deixar como opção, nunca como padrão.
   */
  experienciaRegra: "todas",
  salarioEliminatorio: false,
});
