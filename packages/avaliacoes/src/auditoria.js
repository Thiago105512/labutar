import { novoId } from "../../core/src/ids.js";
import { dataNoFuso } from "../../core/src/datas.js";
import { DECISAO_REVISAO } from "./constantes.js";

export const REGISTRO_AUDITORIA = Object.freeze({
  APLICACAO: "APLICACAO_DISC",
  REVISAO: "REVISAO_HUMANA",
  ACESSO: "ACESSO_LAUDO",
});

/** Fundamentação mínima para caber numa explicação de verdade, não num "ok". */
const FUNDAMENTACAO_MINIMA = 30;

function agoraISO() {
  return new Date().toISOString();
}

function exigir(valor, campo, contexto) {
  if (valor === null || valor === undefined || String(valor).trim() === "") {
    throw new Error(`${contexto}: '${campo}' é obrigatório`);
  }
  return String(valor).trim();
}

/**
 * Registro da aplicação. Perfil comportamental é dado pessoal (e, na prática de
 * seleção, dado usado para decisão sobre a pessoa): a LGPD exige registro das
 * operações de tratamento (art. 37) e explicação da decisão automatizada
 * (art. 20). Sem esse registro, o Labutar não tem como provar em processo
 * trabalhista quando, por quem e com qual consentimento o laudo foi gerado.
 */
export function registrarAplicacaoDISC({
  tenantId,
  avaliacaoId,
  laudoId = null,
  codigoInstrumento,
  versaoInstrumento,
  idioma = null,
  candidaturaId = null,
  candidatoId,
  aplicadoPor = null,
  finalidade,
  baseLegal,
  consentimento,
  inicio = null,
  fim = null,
  tempoTotalSegundos = null,
  totalQuestoes = null,
  respondidas = null,
  em = agoraISO(),
} = {}) {
  exigir(tenantId, "tenantId", "registrarAplicacaoDISC");
  exigir(avaliacaoId, "avaliacaoId", "registrarAplicacaoDISC");
  exigir(codigoInstrumento, "codigoInstrumento", "registrarAplicacaoDISC");
  exigir(versaoInstrumento, "versaoInstrumento", "registrarAplicacaoDISC");
  exigir(candidatoId, "candidatoId", "registrarAplicacaoDISC");
  exigir(finalidade, "finalidade", "registrarAplicacaoDISC");
  exigir(baseLegal, "baseLegal", "registrarAplicacaoDISC");

  if (!consentimento || consentimento.aceito !== true) {
    throw new Error(
      "registrarAplicacaoDISC: consentimento explícito do titular é obrigatório (LGPD, art. 7º, I). " +
        "Avaliação comportamental de candidato não se apoia em obrigação legal nem em execução de contrato: sem consentimento registrado, não se aplica."
    );
  }
  exigir(consentimento.versaoTermo, "consentimento.versaoTermo", "registrarAplicacaoDISC");
  exigir(consentimento.em, "consentimento.em", "registrarAplicacaoDISC");

  return Object.freeze({
    id: novoId("AUD"),
    registro: REGISTRO_AUDITORIA.APLICACAO,
    em,
    tenantId: String(tenantId).trim(),
    avaliacaoId: String(avaliacaoId).trim(),
    laudoId: laudoId ? String(laudoId).trim() : null,
    codigoInstrumento: String(codigoInstrumento).trim(),
    versaoInstrumento: String(versaoInstrumento).trim(),
    idioma,
    candidaturaId: candidaturaId ? String(candidaturaId).trim() : null,
    candidatoId: String(candidatoId).trim(),
    aplicadoPor: aplicadoPor ? String(aplicadoPor).trim() : "AUTONOMATO",
    finalidade: String(finalidade).trim(),
    baseLegal: String(baseLegal).trim(),
    consentimento: {
      aceito: true,
      versaoTermo: String(consentimento.versaoTermo).trim(),
      em: String(consentimento.em).trim(),
      ip: consentimento.ip ?? null,
    },
    telemetria: { inicio, fim, tempoTotalSegundos, totalQuestoes, respondidas },
  });
}

/**
 * Revisão humana do laudo. LGPD art. 20 garante ao titular a revisão de decisão
 * automatizada; aqui a revisão deixa de ser promessa e vira registro com autor,
 * data e fundamentação. Fundamentação curta demais é rejeitada: "de acordo" não
 * explica nada a ninguém, muito menos a um juiz.
 */
export function registrarRevisaoHumana({ laudoId, revisorId, revisorPapel = null, decisao, fundamentacao, em = agoraISO() } = {}) {
  exigir(laudoId, "laudoId", "registrarRevisaoHumana");
  exigir(revisorId, "revisorId", "registrarRevisaoHumana");

  const escolhida = String(decisao ?? "").trim().toUpperCase();
  if (!Object.values(DECISAO_REVISAO).includes(escolhida)) {
    throw new Error(
      `registrarRevisaoHumana: decisão inválida "${decisao ?? ""}". Use ${Object.values(DECISAO_REVISAO).join(", ")}`
    );
  }

  const texto = String(fundamentacao ?? "").trim();
  if (texto.length < FUNDAMENTACAO_MINIMA) {
    throw new Error(
      `registrarRevisaoHumana: fundamentação com ${texto.length} caracteres; o mínimo é ${FUNDAMENTACAO_MINIMA}. ` +
        "A revisão precisa registrar o que foi considerado além do perfil (LGPD, art. 20)."
    );
  }

  return Object.freeze({
    id: novoId("AUD"),
    registro: REGISTRO_AUDITORIA.REVISAO,
    em,
    laudoId: String(laudoId).trim(),
    revisorId: String(revisorId).trim(),
    revisorPapel: revisorPapel ? String(revisorPapel).trim() : null,
    decisao: escolhida,
    fundamentacao: texto,
  });
}

/** Quem abriu o laudo, quando e por quê. Base do pedido de acesso do titular. */
export function registrarAcesso({ laudoId, usuarioId, papel = null, motivo = null, em = agoraISO() } = {}) {
  exigir(laudoId, "laudoId", "registrarAcesso");
  exigir(usuarioId, "usuarioId", "registrarAcesso");

  return Object.freeze({
    id: novoId("AUD"),
    registro: REGISTRO_AUDITORIA.ACESSO,
    em,
    laudoId: String(laudoId).trim(),
    usuarioId: String(usuarioId).trim(),
    papel: papel ? String(papel).trim() : null,
    motivo: motivo ? String(motivo).trim() : null,
  });
}

/**
 * Relatório das operações de tratamento (LGPD, art. 37), pronto para responder
 * à ANPD ou ao titular sem precisar montar query na hora.
 */
export function registroDeOperacoes(eventos = [], { tenantId = null } = {}) {
  if (!Array.isArray(eventos)) throw new Error("registroDeOperacoes exige uma lista de eventos de auditoria");

  const doTenant = tenantId ? eventos.filter((e) => !e.tenantId || e.tenantId === tenantId) : eventos;
  const ordenados = doTenant.slice().sort((a, b) => String(a.em).localeCompare(String(b.em)));
  const datas = ordenados.map((e) => dataNoFuso(e.em));

  return {
    tenantId: tenantId ? String(tenantId).trim() : null,
    totalEventos: ordenados.length,
    porTipo: {
      aplicacoes: ordenados.filter((e) => e.registro === REGISTRO_AUDITORIA.APLICACAO).length,
      revisoes: ordenados.filter((e) => e.registro === REGISTRO_AUDITORIA.REVISAO).length,
      acessos: ordenados.filter((e) => e.registro === REGISTRO_AUDITORIA.ACESSO).length,
    },
    periodo: { inicio: datas[0] ?? null, fim: datas[datas.length - 1] ?? null },
    laudosSemRevisao: laudosSemRevisaoHumana(ordenados),
    eventos: ordenados,
  };
}

/**
 * Laudos gerados sem revisão humana registrada. É a pendência que precisa
 * aparecer no painel: laudo automático não revisado não pode sustentar decisão.
 */
export function laudosSemRevisaoHumana(eventos = []) {
  if (!Array.isArray(eventos)) throw new Error("laudosSemRevisaoHumana exige uma lista de eventos de auditoria");

  const revisados = new Set(
    eventos.filter((e) => e.registro === REGISTRO_AUDITORIA.REVISAO).map((e) => String(e.laudoId))
  );
  const aplicados = eventos
    .filter((e) => e.registro === REGISTRO_AUDITORIA.APLICACAO)
    .map((e) => String(e.laudoId ?? e.avaliacaoId));

  return [...new Set(aplicados.filter((id) => !revisados.has(id)))];
}
