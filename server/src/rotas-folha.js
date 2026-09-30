import { CATALOGO_VERBAS, calcularFolha, calcularHolerite, tabelaDaCompetencia, validarCompetencia } from "../../packages/folha/src/index.js";
import { sucesso, erroValidacao, erroNaoEncontrado, erroConflito } from "./http/resposta.js";
import { validarCPF } from "../../packages/core/src/validacao.js";
import { exigirPermissao } from "./middleware/contexto.js";
import { carregarCadastro, colaboradoresDaFolha, lotacoesDoCadastro } from "./cadastro.js";

/** Campos de lançamento aceitos e seus limites: horas no mês, dias, valores em centavos. */
const CAMPOS = Object.freeze({
  horasExtras50: [0, 200], horasExtras100: [0, 200], horasNoturnas: [0, 250],
  faltasDias: [0, 30], dsrPerdidos: [0, 6],
  adiantamento: [0, 100_000_000], custoValeTransporte: [0, 10_000_000], pensao: [0, 100_000_000],
  outrosDescontos: [0, 100_000_000], eConsignado: [0, 100_000_000], outrosRendimentosIRNoMes: [0, 1_000_000_000], irrfRetidoNoMes: [0, 100_000_000],
});

const opcoesDaEmpresa = (empresa, colaborador) => ({
  local: colaborador.local ?? empresa.local,
  arredondamentoINSS: empresa.arredondamentoINSS,
  arredondamentoFGTS: empresa.arredondamentoFGTS,
  dispensarIRRFAte10: empresa.dispensarIRRFAte10,
});

function lerLancamentos(corpo) {
  const saida = {};
  const erros = [];
  for (const [campo, [min, max]] of Object.entries(CAMPOS)) {
    if (corpo?.[campo] === undefined || corpo[campo] === null || corpo[campo] === "") continue;
    const n = Number(corpo[campo]);
    if (!Number.isFinite(n) || n < min || n > max) erros.push(campo);
    else saida[campo] = campo.startsWith("horas") ? Math.round(n * 100) / 100 : Math.round(n);
  }
  if (erros.length) throw erroValidacao(`valores fora do permitido: ${erros.join(", ")}`, erros);
  return saida;
}

function competenciaValida(ctx) {
  const competencia = ctx.params.competencia;
  if (!validarCompetencia(competencia)) throw erroValidacao("competência inválida: use AAAA-MM", ["competencia"]);
  try { tabelaDaCompetencia(competencia); } catch (e) { throw erroValidacao(e.message, ["competencia"]); }
  return competencia;
}

async function dadosDaFolha(repo, tenant, competencia) {
  const [empresa, cad, lancamentos] = await Promise.all([
    repo.obter(tenant, "folhaParametros", "empresa"),
    carregarCadastro(repo, tenant),
    repo.listar(tenant, "folhaLancamentos", { competencia }, { limite: 100_000 }),
  ]);
  return {
    empresa: empresa ?? {},
    lotacoes: lotacoesDoCadastro(cad, empresa ?? {}),
    colaboradores: colaboradoresDaFolha(cad, competencia, empresa ?? {}),
    cadastro: cad,
    lancamentos: Object.fromEntries(lancamentos.itens.map(({ id, competencia: _c, matricula, ...l }) => [matricula, l])),
  };
}

export function registrarRotasFolha(r, { repo }) {
  /**
   * CPF do colaborador: é o código da pessoa, como no eSocial (cpfTrab). A mesma pessoa pode
   * ter mais de um vínculo (matrícula), sempre com o mesmo CPF; CPF de outra pessoa é recusado.
   */
  r.patch("/api/folha/colaboradores/:matricula", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "folha", "editar");
    const vinculo = await repo.obter(tenant, "vinculos", ctx.params.matricula);
    if (!vinculo) throw erroNaoEncontrado("colaborador não encontrado na folha");
    sucesso(res, await gravarCPF(repo, tenant, vinculo.pessoaId, corpo?.cpf));
  });

  r.get("/api/folha/parametros", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "folha", "ver");
    const empresa = await repo.obter(tenant, "folhaParametros", "empresa");
    const lotacoes = lotacoesDoCadastro(await carregarCadastro(repo, tenant), empresa ?? {});
    sucesso(res, { empresa, lotacoes, verbas: CATALOGO_VERBAS });
  });

  r.get("/api/folha/:competencia", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "folha", "ver");
    const competencia = competenciaValida(ctx);
    const d = await dadosDaFolha(repo, tenant, competencia);
    const folha = calcularFolha({ empresa: d.empresa, competencia, colaboradores: d.colaboradores, lancamentos: d.lancamentos });
    sucesso(res, { ...folha, empresa: d.empresa, lotacoes: d.lotacoes, lancamentos: d.lancamentos });
  });

  r.put("/api/folha/:competencia/lancamentos/:matricula", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "folha", "editar");
    const competencia = competenciaValida(ctx);
    const d0 = await dadosDaFolha(repo, tenant, competencia);
    const colaborador = d0.colaboradores.find((c) => c.matricula === ctx.params.matricula);
    if (!colaborador) throw erroNaoEncontrado("colaborador não encontrado na folha desta competência");
    const lancamentos = lerLancamentos(corpo);
    const id = `${competencia}:${colaborador.matricula}`;
    const documento = { id, competencia, matricula: colaborador.matricula, ...lancamentos, alteradoPor: ctx.usuario ?? null };
    if (await repo.obter(tenant, "folhaLancamentos", id)) {
      await repo.remover(tenant, "folhaLancamentos", id);
    }
    await repo.inserir(tenant, "folhaLancamentos", documento);
    const empresa = d0.empresa;
    try {
      sucesso(res, calcularHolerite(colaborador, competencia, lancamentos, opcoesDaEmpresa(empresa, colaborador)));
    } catch (e) {
      throw erroValidacao(e.message, ["matricula"]);
    }
  });
}

/**
 * Grava o CPF da pessoa (o código do trabalhador). A mesma pessoa pode ter vários vínculos;
 * CPF já usado por outra pessoa é recusado.
 */
export async function gravarCPF(repo, tenant, pessoaId, cpf) {
  const pessoa = await repo.obter(tenant, "pessoas", pessoaId);
  if (!pessoa) throw erroNaoEncontrado("pessoa não encontrada no cadastro");
  const v = validarCPF(cpf);
  if (!v.valido) throw erroValidacao(`CPF inválido: ${v.motivo}`, ["cpf"]);
  const { itens } = await repo.listar(tenant, "pessoas", { cpf: v.digitos }, { limite: 5 });
  const outra = itens.find((p) => p.id !== pessoa.id);
  if (outra) throw erroConflito(`este CPF já está no cadastro de ${outra.nome}`);
  return repo.atualizar(tenant, "pessoas", pessoa.id, { cpf: v.digitos });
}
