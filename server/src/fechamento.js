/**
 * Fechamento da competência no servidor: estado (collection folhaFechamentos, id = competência) e
 * a fotografia da folha fechada, com hash para provar que não mudou depois.
 */
import { createHash } from "node:crypto";
import { STATUS_COMPETENCIA } from "../../packages/folha/src/index.js";
import { erroConflito } from "./http/resposta.js";

export async function obterFechamento(repo, tenant, competencia) {
  return (await repo.obter(tenant, "folhaFechamentos", competencia)) ?? { id: competencia, status: STATUS_COMPETENCIA.ABERTA, historico: [] };
}

/** Hash dos holerites fechados (ordem estável por matrícula). */
export function hashDaFotografia(holerites) {
  const ordenados = [...holerites].sort((a, b) => a.colaborador.matricula.localeCompare(b.colaborador.matricula));
  return createHash("sha256").update(JSON.stringify(ordenados)).digest("hex");
}

/** Lançamentos e ajustes só com a competência aberta. */
export async function exigirCompetenciaAberta(repo, tenant, competencia) {
  const f = await obterFechamento(repo, tenant, competencia);
  if (f.status !== STATUS_COMPETENCIA.ABERTA) {
    throw erroConflito(f.status === STATUS_COMPETENCIA.FECHADA
      ? `competência ${competencia} fechada: reabra para alterar`
      : `competência ${competencia} em conferência: devolva para ajustes antes de alterar`);
  }
  return f;
}

export async function gravarFechamento(repo, tenant, competencia, dados) {
  const existe = await repo.obter(tenant, "folhaFechamentos", competencia);
  if (existe) return repo.atualizar(tenant, "folhaFechamentos", competencia, dados);
  return repo.inserir(tenant, "folhaFechamentos", { id: competencia, ...dados });
}
