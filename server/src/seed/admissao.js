/**
 * Admissão em andamento no demo: uma pessoa fictícia admitida como temporária na Eletrônica
 * Amazônia, com o exame admissional agendado e conta no portal para completar os dados e aceitar
 * o contrato (joana.lima@exemplo.com).
 */
import { proximaMatricula } from "../../../packages/mao-de-obra/src/index.js";
import { iniciarAdmissao } from "../rotas-admissao.js";
import { cpfFicticio } from "./folha.js";

export const ADMISSAO_DEMO = Object.freeze({ nome: "Joana Ribeiro Lima", email: "joana.lima@exemplo.com", admissao: "2026-10-19", exameEm: "2026-10-14" });

export async function semearAdmissaoDemo(repo, tenantId) {
  const { itens: vinculos } = await repo.listar(tenantId, "vinculos", {}, { limite: 10_000 });
  const modelo = vinculos.find((v) => v.tipo === "TEMPORARIO" && v.tomadorId === "TOM_ELETRONICA_AMAZONIA" && !v.desligamento);
  if (!modelo) return null;
  const pessoa = { id: "PES_ADM_DEMO", nome: ADMISSAO_DEMO.nome, cpf: cpfFicticio(901), email: ADMISSAO_DEMO.email, telefone: null, dependentes: [], banco: null };
  await repo.inserir(tenantId, "pessoas", pessoa);
  const matricula = proximaMatricula("TEMPORARIO", vinculos.map((v) => v.matricula));
  const vinculo = {
    ...modelo, id: matricula, matricula, pessoaId: pessoa.id, admissao: ADMISSAO_DEMO.admissao, desligamento: null,
    historicoSalarial: [{ desde: ADMISSAO_DEMO.admissao, valor: modelo.salario, motivo: "Admissão" }],
    temporario: { fimPrevisto: "2027-01-16", hipotese: modelo.temporario?.hipotese ?? null }, bancoHorasAdesao: false, origem: null, criadoPor: "SEED",
  };
  await repo.inserir(tenantId, "vinculos", vinculo);
  await iniciarAdmissao(repo, tenantId, vinculo, pessoa, "SEED");
  const { itens: [exame] } = await repo.listar(tenantId, "exames", { matricula }, { limite: 1 });
  await repo.atualizar(tenantId, "exames", exame.id, { status: "AGENDADO", agendadoPara: ADMISSAO_DEMO.exameEm, hora: "08:30", local: "Clínica do grupo — sala 2" });
  return matricula;
}
