/**
 * Admissão digital — contrato reservado (ver ../README.md).
 *
 * Só as constantes existem. As funções entram na fase de admissão do roadmap;
 * até lá, nada neste pacote pode marcar uma admissão como concluída.
 */

export const STATUS_ADMISSAO = Object.freeze({
  PENDENTE: "PENDENTE",
  DOCUMENTOS_OK: "DOCUMENTOS_OK",
  ASO_OK: "ASO_OK",
  ENVIADA: "ENVIADA",
  CONCLUIDA: "CONCLUIDA",
  BLOQUEADA: "BLOQUEADA",
});

export const TIPO_REGIME = Object.freeze({
  CLT: "CLT",
  TEMPORARIO: "TEMPORARIO", // Lei 6.019/1974
  APRENDIZ: "APRENDIZ",
  ESTAGIO: "ESTAGIO",
});
