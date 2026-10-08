/**
 * Fechamento da competência. A folha passa por conferência antes de fechar; fechada, ela vira
 * uma fotografia (holerites e totais congelados): os lançamentos travam, o holerite vai para o
 * portal do colaborador e é a base do pagamento e do eSocial. Reabrir exige motivo e fica no
 * histórico.
 *
 * Fluxo: ABERTA → EM_CONFERENCIA (DP envia) → FECHADA (gestor fecha)
 *        EM_CONFERENCIA → ABERTA (gestor devolve) · FECHADA → ABERTA (gestor reabre, com motivo)
 */

export const STATUS_COMPETENCIA = Object.freeze({ ABERTA: "ABERTA", EM_CONFERENCIA: "EM_CONFERENCIA", FECHADA: "FECHADA" });

export const ACAO_FECHAMENTO = Object.freeze({
  ENVIAR_CONFERENCIA: Object.freeze({ de: ["ABERTA"], para: "EM_CONFERENCIA", permissao: "editar", nome: "Enviar para conferência" }),
  DEVOLVER: Object.freeze({ de: ["EM_CONFERENCIA"], para: "ABERTA", permissao: "aprovar", nome: "Devolver para ajustes", exigeMotivo: true }),
  FECHAR: Object.freeze({ de: ["EM_CONFERENCIA"], para: "FECHADA", permissao: "aprovar", nome: "Fechar competência" }),
  REABRIR: Object.freeze({ de: ["FECHADA"], para: "ABERTA", permissao: "aprovar", nome: "Reabrir competência", exigeMotivo: true }),
});

/**
 * O que impede o fechamento (bloqueios) e o que só precisa de atenção (avisos).
 * @param folha saída da folha da competência (holerites, pendências, convencoes.conformidade)
 */
export function verificarFechamento(folha) {
  const bloqueios = [];
  const avisos = [];
  for (const c of folha.convencoes?.conformidade ?? []) {
    if (c.erros?.length) bloqueios.push({ matricula: c.matricula, nome: c.nome, motivo: c.erros.join("; ") });
  }
  for (const h of folha.holerites ?? []) {
    if (h.liquido < 0) bloqueios.push({ matricula: h.colaborador.matricula, nome: h.colaborador.nome, motivo: "líquido negativo" });
    if (!h.colaborador.cpf) avisos.push({ matricula: h.colaborador.matricula, nome: h.colaborador.nome, motivo: "sem CPF: não vai ao eSocial" });
  }
  for (const p of folha.pendencias ?? []) avisos.push({ matricula: p.matricula, nome: p.nome, motivo: `fora da folha mensal: ${p.motivo}` });
  return { podeFechar: bloqueios.length === 0, bloqueios, avisos };
}

/**
 * Aplica uma ação ao fechamento. Não grava nada: devolve o novo estado ou o erro.
 * @param atual { status, historico } (ausente = ABERTA)
 * @param dados { acao, motivo?, usuario?, em, verificacao? (obrigatória para FECHAR) }
 */
export function aplicarAcaoFechamento(atual, { acao, motivo = "", usuario = null, em, verificacao = null }) {
  const regra = ACAO_FECHAMENTO[acao];
  if (!regra) return { ok: false, erro: "ação de fechamento inválida" };
  const status = atual?.status ?? STATUS_COMPETENCIA.ABERTA;
  if (!regra.de.includes(status)) return { ok: false, erro: `não é possível "${regra.nome.toLowerCase()}" com a competência ${NOME_STATUS[status].toLowerCase()}` };
  if (regra.exigeMotivo && String(motivo).trim().length < 10) return { ok: false, erro: "informe o motivo (pelo menos 10 caracteres)" };
  if (acao === "FECHAR" && verificacao && !verificacao.podeFechar) {
    return { ok: false, erro: `há ${verificacao.bloqueios.length} bloqueio(s): ${verificacao.bloqueios.slice(0, 3).map((b) => `${b.nome} (${b.motivo})`).join("; ")}` };
  }
  return {
    ok: true,
    estado: {
      status: regra.para,
      historico: [...(atual?.historico ?? []), { acao, de: status, para: regra.para, motivo: String(motivo).trim() || null, por: usuario, em }],
    },
  };
}

export const NOME_STATUS = Object.freeze({ ABERTA: "Aberta", EM_CONFERENCIA: "Em conferência", FECHADA: "Fechada" });
