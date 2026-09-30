/**
 * Tipos de conta. A equipe da empresa usa módulos, níveis e perfis
 * (permissoes.js). Os três públicos externos usam portais próprios e só
 * enxergam o que é deles — o escopo de cada conta está gravado nela e é o
 * filtro de toda consulta do portal.
 */
export const TIPO_CONTA = Object.freeze({
  /** Equipe da empresa: painel, módulos e perfis. */
  INTERNO: "INTERNO",
  /** Candidato: vagas e as próprias candidaturas. Escopo: { candidatoId }. */
  CANDIDATO: "CANDIDATO",
  /** Trabalhador (temporário, terceirizado ou próprio): os próprios dados. Escopo: { pessoaId }. */
  COLABORADOR: "COLABORADOR",
  /** Usuário do cliente tomador: só o tomador (e contratos) dele. Escopo: { tomadorId, contratoIds }. */
  TOMADOR: "TOMADOR",
});

export const NOME_TIPO_CONTA = Object.freeze({
  INTERNO: "Equipe da empresa",
  CANDIDATO: "Candidato",
  COLABORADOR: "Colaborador",
  TOMADOR: "Cliente (tomador)",
});

/** Módulo interno cuja permissão governa quem cria e gerencia cada tipo de conta externa. */
export const MODULO_GESTOR_DA_CONTA = Object.freeze({
  CANDIDATO: "recrutamento",
  COLABORADOR: "colaboradores",
  TOMADOR: "tomadores",
});

/** O que o usuário do tomador pode fazer no portal do cliente. */
export const PAPEL_TOMADOR = Object.freeze({
  CONSULTA: "CONSULTA",
  GESTOR_CONTRATO: "GESTOR_CONTRATO",
  FINANCEIRO: "FINANCEIRO",
});

export const PAPEIS_TOMADOR = Object.freeze([
  { id: "CONSULTA", nome: "Consulta", descricao: "Vê trabalhadores alocados, presença e documentos" },
  { id: "GESTOR_CONTRATO", nome: "Gestor do contrato", descricao: "Aprova ponto e medição, pede reposição e novos postos" },
  { id: "FINANCEIRO", nome: "Financeiro", descricao: "Vê medições, faturas e notas fiscais" },
]);

const ACOES_TOMADOR = Object.freeze({
  CONSULTA: ["verAlocados", "verPresenca", "verDocumentos"],
  GESTOR_CONTRATO: ["verAlocados", "verPresenca", "verDocumentos", "aprovarPonto", "aprovarMedicao", "solicitarPosto", "verFaturas"],
  FINANCEIRO: ["verMedicao", "verFaturas", "verDocumentos"],
});

export const podeNoTomador = (papel, acao) => (ACOES_TOMADOR[papel] ?? []).includes(acao);

/** Escopo exigido por tipo de conta externa. Conta sem escopo válido não é criada. */
export function validarEscopo(tipo, escopo = {}) {
  const erros = [];
  if (tipo === TIPO_CONTA.CANDIDATO && !escopo.candidatoId) erros.push("conta de candidato precisa do candidato vinculado");
  if (tipo === TIPO_CONTA.COLABORADOR && !escopo.pessoaId) erros.push("conta de colaborador precisa da pessoa vinculada");
  if (tipo === TIPO_CONTA.TOMADOR) {
    if (!escopo.tomadorId) erros.push("conta de tomador precisa do tomador vinculado");
    if (!PAPEL_TOMADOR[escopo.papel]) erros.push("papel no tomador inválido (Consulta, Gestor do contrato ou Financeiro)");
    if (escopo.contratoIds != null && !Array.isArray(escopo.contratoIds)) erros.push("contratoIds deve ser uma lista");
  }
  return { ok: erros.length === 0, erros };
}
