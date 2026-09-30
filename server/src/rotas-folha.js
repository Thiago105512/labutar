import { CATALOGO_VERBAS, calcularFolha, calcularHolerite, tabelaDaCompetencia, validarCompetencia } from "../../packages/folha/src/index.js";
import { sucesso, erroValidacao, erroNaoEncontrado, erroConflito } from "./http/resposta.js";
import { validarCPF } from "../../packages/core/src/validacao.js";
import { exigirPermissao } from "./middleware/contexto.js";

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
  const [empresa, lotacoes, colaboradores, lancamentos] = await Promise.all([
    repo.obter(tenant, "folhaParametros", "empresa"),
    repo.listar(tenant, "folhaLotacoes", {}, { limite: 1000 }),
    repo.listar(tenant, "folhaColaboradores", {}, { limite: 10000, ordenarPor: "nome" }),
    repo.listar(tenant, "folhaLancamentos", { competencia }, { limite: 10000 }),
  ]);
  return {
    empresa: empresa ?? {},
    lotacoes: lotacoes.itens,
    colaboradores: colaboradores.itens,
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
    const colaborador = await repo.obter(tenant, "folhaColaboradores", ctx.params.matricula);
    if (!colaborador) throw erroNaoEncontrado("colaborador não encontrado na folha");
    const v = validarCPF(corpo?.cpf);
    if (!v.valido) throw erroValidacao(`CPF inválido: ${v.motivo}`, ["cpf"]);
    const { itens } = await repo.listar(tenant, "folhaColaboradores", { cpf: v.digitos }, { limite: 50 });
    const outraPessoa = itens.find((c) => c.matricula !== colaborador.matricula && c.nome.trim().toLowerCase() !== colaborador.nome.trim().toLowerCase());
    if (outraPessoa) throw erroConflito(`este CPF já está no cadastro de ${outraPessoa.nome} (matrícula ${outraPessoa.matricula})`);
    sucesso(res, await repo.atualizar(tenant, "folhaColaboradores", colaborador.matricula, { cpf: v.digitos }));
  });

  r.get("/api/folha/parametros", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "folha", "ver");
    const empresa = await repo.obter(tenant, "folhaParametros", "empresa");
    const { itens: lotacoes } = await repo.listar(tenant, "folhaLotacoes", {}, { limite: 1000 });
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
    const colaborador = await repo.obter(tenant, "folhaColaboradores", ctx.params.matricula);
    if (!colaborador) throw erroNaoEncontrado("colaborador não encontrado na folha");
    const lancamentos = lerLancamentos(corpo);
    const id = `${competencia}:${colaborador.matricula}`;
    const documento = { id, competencia, matricula: colaborador.matricula, ...lancamentos, alteradoPor: ctx.usuario ?? null };
    if (await repo.obter(tenant, "folhaLancamentos", id)) {
      await repo.remover(tenant, "folhaLancamentos", id);
    }
    await repo.inserir(tenant, "folhaLancamentos", documento);
    const empresa = (await repo.obter(tenant, "folhaParametros", "empresa")) ?? {};
    try {
      sucesso(res, calcularHolerite(colaborador, competencia, lancamentos, opcoesDaEmpresa(empresa, colaborador)));
    } catch (e) {
      throw erroValidacao(e.message, ["matricula"]);
    }
  });
}
