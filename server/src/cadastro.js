/**
 * Leitura do cadastro no servidor: pessoas, vínculos, tomadores, contratos e postos de um tenant,
 * já indexados. Usado pelas rotas de cadastro e pela folha (que calcula a partir daqui).
 */
import { colaboradorDaFolha } from "../../packages/cadastro/src/index.js";

const TUDO = { limite: 100_000 };

export async function carregarCadastro(repo, tenant) {
  const [pessoas, vinculos, tomadores, contratos, postos] = await Promise.all(
    ["pessoas", "vinculos", "tomadores", "contratosTomador", "postos"].map((c) => repo.listar(tenant, c, {}, TUDO).then((r) => r.itens))
  );
  const porId = (lista) => new Map(lista.map((x) => [x.id, x]));
  return {
    pessoas, vinculos, tomadores, contratos, postos,
    pessoa: porId(pessoas), tomador: porId(tomadores), contrato: porId(contratos), posto: porId(postos),
  };
}

/** Colaboradores da folha na competência: todo vínculo admitido até o fim do mês. */
export function colaboradoresDaFolha(cad, competencia, empresa = {}) {
  return cad.vinculos
    .filter((v) => v.admissao.slice(0, 7) <= competencia && (!v.desligamento || v.desligamento.slice(0, 7) >= competencia))
    .map((v) => ({
      ...colaboradorDaFolha({ vinculo: v, pessoa: cad.pessoa.get(v.pessoaId), posto: cad.posto.get(v.postoId), tomador: cad.tomador.get(v.tomadorId), empresa }, competencia),
      pessoaId: v.pessoaId,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function lotacoesDoCadastro(cad, empresa = {}) {
  return [
    ...cad.tomadores.map((t) => ({ id: `TOM:${t.id}`, nome: t.nomeFantasia || t.razaoSocial, tipo: "TOMADOR" })),
    ...(empresa.setores ?? []).map((s) => ({ id: `SET:${s.id}`, nome: s.nome, tipo: "SETOR" })),
  ];
}
