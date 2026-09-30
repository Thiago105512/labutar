/**
 * Sindicatos laborais que o colaborador pode ter: os das convenções e acordos cadastrados e os
 * avulsos (categoria sem instrumento no sistema ainda). O sindicato do vínculo decide a convenção.
 */
import { normalizarCNPJ } from "../../packages/core/src/validacao.js";
import { carregarConvencoes } from "./convencoes.js";

export async function listarSindicatos(repo, tenant) {
  const [instrumentos, avulsos] = await Promise.all([
    carregarConvencoes(repo, tenant),
    repo.listar(tenant, "sindicatos", {}, { limite: 1000 }).then((r) => r.itens),
  ]);
  const porCnpj = new Map();
  for (const i of instrumentos) {
    const s = i.sindicatoLaboral;
    const atual = porCnpj.get(s.cnpj) ?? { cnpj: s.cnpj, nome: s.nome, sigla: s.sigla, instrumentos: [] };
    atual.instrumentos.push({ id: i.id, tipo: i.tipo, registroMTE: i.registroMTE, vigencia: i.vigencia });
    porCnpj.set(s.cnpj, atual);
  }
  for (const s of avulsos) if (!porCnpj.has(s.cnpj)) porCnpj.set(s.cnpj, { ...s, instrumentos: [] });
  return [...porCnpj.values()].sort((a, b) => a.sigla.localeCompare(b.sigla, "pt-BR"));
}

/** Sindicato do vínculo: o informado ou o padrão da empresa para o tipo de vínculo. */
export function resolverSindicato(sindicatos, { cnpj, tipo, empresa }) {
  const alvo = cnpj ? normalizarCNPJ(cnpj) : empresa?.sindicatosPadrao?.[tipo] ?? null;
  const s = alvo ? sindicatos.find((x) => x.cnpj === alvo) : null;
  return s ? { cnpj: s.cnpj, sigla: s.sigla, nome: s.nome } : null;
}
