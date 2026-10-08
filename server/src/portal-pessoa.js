/**
 * Quem é a pessoa da conta de colaborador no portal: pela pessoa do cadastro (escopo.pessoaId) ou,
 * para conta criada no recrutamento, pelo candidato que virou pessoa. Nunca por parâmetro da
 * requisição.
 */
export async function pessoaDoColaborador(repo, tenant, escopo) {
  const direta = escopo.pessoaId ? await repo.obter(tenant, "pessoas", escopo.pessoaId) : null;
  if (direta) return direta;
  const { itens } = await repo.listar(tenant, "pessoas", { candidatoId: escopo.pessoaId }, { limite: 1 });
  return itens[0] ?? null;
}

export async function matriculasDaPessoa(repo, tenant, pessoa) {
  if (!pessoa) return new Set();
  const { itens } = await repo.listar(tenant, "vinculos", { pessoaId: pessoa.id }, { limite: 100 });
  return new Set(itens.map((v) => v.matricula));
}
