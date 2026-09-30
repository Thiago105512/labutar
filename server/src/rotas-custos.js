/**
 * Centro de custos: itens de custo (catálogo com preço), lançamentos (entregas de uniforme, EPI,
 * crachá, exames, preposto, despesas) e o resultado por contrato. Lançar custo é de quem entrega
 * (Estoque) ou de quem controla (Financeiro); o resultado é do Financeiro.
 */
import {
  validarItemDeCusto, validarLancamentoDeCusto, apurarResultado, TIPO_CUSTO, DESTINO_CUSTO, MODALIDADE_FATURAMENTO, CRITERIO_RATEIO,
} from "../../packages/custos/src/index.js";
import { validarCompetencia } from "../../packages/folha/src/index.js";
import { novoId } from "../../packages/core/src/ids.js";
import { sucesso, erroValidacao, erroNaoEncontrado, erroSemPermissao } from "./http/resposta.js";
import { exigirPermissao } from "./middleware/contexto.js";
import { carregarCadastro } from "./cadastro.js";
import { dadosDaFolha, folhaComConvencoes } from "./rotas-folha.js";

const TUDO = { limite: 100_000 };

/** Financeiro ou Estoque: o primeiro que o perfil permitir. */
function exigirCustos(ctx, acao) {
  try { return exigirPermissao(ctx, "financeiro", acao); } catch (e) {
    try { return exigirPermissao(ctx, "estoque", acao); } catch { throw e.status === 403 ? erroSemPermissao("seu perfil não permite lançar ou ver custos (Financeiro ou Estoque)") : e; }
  }
}

/**
 * Grava lançamentos de custo já validados. Usado também pela admissão (kit do colaborador novo).
 * @returns lançamentos gravados
 */
export async function gravarLancamentos(repo, tenant, lista, { usuario = null, origem = "MANUAL" } = {}) {
  const gravados = [];
  for (const l of lista) gravados.push(await repo.inserir(tenant, "custosLancamentos", { ...l, id: novoId("CUS"), origem, criadoPor: usuario }));
  return gravados;
}

export function registrarRotasCustos(r, { repo }) {
  r.get("/api/custos/tipos", async (req, res, ctx) => {
    exigirCustos(ctx, "ver");
    sucesso(res, { tipos: Object.entries(TIPO_CUSTO).map(([id, t]) => ({ id, ...t })), modalidades: Object.values(MODALIDADE_FATURAMENTO), criterios: Object.values(CRITERIO_RATEIO) });
  });

  r.get("/api/custos/itens", async (req, res, ctx) => {
    const tenant = exigirCustos(ctx, "ver");
    const { itens } = await repo.listar(tenant, "itensCusto", {}, TUDO);
    sucesso(res, itens.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome, "pt-BR")));
  });

  r.post("/api/custos/itens", async (req, res, ctx, corpo) => {
    const tenant = exigirCustos(ctx, "criar");
    const v = validarItemDeCusto({ ...corpo, custoUnitario: Number(corpo?.custoUnitario), amortizarMeses: corpo?.amortizarMeses == null ? undefined : Number(corpo.amortizarMeses) });
    if (!v.ok) throw erroValidacao(v.erros.join("; "), v.erros);
    sucesso(res, await repo.inserir(tenant, "itensCusto", { ...v.item, id: novoId("ITC") }), 201);
  });

  r.get("/api/custos/lancamentos", async (req, res, ctx) => {
    const tenant = exigirCustos(ctx, "ver");
    const competencia = String(ctx.query.competencia ?? "");
    const { itens } = await repo.listar(tenant, "custosLancamentos", competencia ? { competencia } : {}, TUDO);
    sucesso(res, itens.sort((a, b) => b.data.localeCompare(a.data)));
  });

  /**
   * Lança um custo. Com `itemId`, tipo, preço e amortização vêm do catálogo (a quantidade é da
   * entrega). O destino precisa existir: colaborador (matrícula) ou contrato.
   */
  r.post("/api/custos/lancamentos", async (req, res, ctx, corpo) => {
    const tenant = exigirCustos(ctx, "criar");
    const item = corpo?.itemId ? await repo.obter(tenant, "itensCusto", corpo.itemId) : null;
    if (corpo?.itemId && !item) throw erroNaoEncontrado("item de custo não encontrado");
    const dados = {
      data: corpo?.data, quantidade: Number(corpo?.quantidade ?? 1),
      tipo: item?.tipo ?? corpo?.tipo, descricao: corpo?.descricao || item?.nome,
      custoUnitario: corpo?.custoUnitario != null && corpo.custoUnitario !== "" ? Number(corpo.custoUnitario) : item?.custoUnitario,
      amortizarMeses: corpo?.amortizarMeses != null && corpo.amortizarMeses !== "" ? Number(corpo.amortizarMeses) : item?.amortizarMeses ?? 1,
      itemId: item?.id ?? null, destino: corpo?.destino,
    };
    const v = validarLancamentoDeCusto(dados);
    if (!v.ok) throw erroValidacao(v.erros.join("; "), v.erros);
    const d = v.lancamento.destino;
    if (d.tipo === DESTINO_CUSTO.COLABORADOR && !(await repo.obter(tenant, "vinculos", d.matricula))) throw erroNaoEncontrado("colaborador não encontrado");
    if (d.tipo === DESTINO_CUSTO.CONTRATO && !(await repo.obter(tenant, "contratosTomador", d.contratoId))) throw erroNaoEncontrado("contrato não encontrado");
    const [gravado] = await gravarLancamentos(repo, tenant, [v.lancamento], { usuario: ctx.usuario ?? null });
    sucesso(res, gravado, 201);
  });

  r.delete("/api/custos/lancamentos/:id", async (req, res, ctx) => {
    const tenant = exigirCustos(ctx, "excluir");
    if (!(await repo.obter(tenant, "custosLancamentos", ctx.params.id))) throw erroNaoEncontrado("lançamento não encontrado");
    await repo.remover(tenant, "custosLancamentos", ctx.params.id);
    sucesso(res, { excluido: ctx.params.id });
  });

  /** Resultado por contrato na competência (?criterio=COLABORADORES|CUSTO_DIRETO). */
  r.get("/api/custos/resultado/:competencia", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "financeiro", "ver");
    const competencia = ctx.params.competencia;
    if (!validarCompetencia(competencia)) throw erroValidacao("competência inválida: use AAAA-MM", ["competencia"]);
    const criterio = CRITERIO_RATEIO[ctx.query.criterio] ?? CRITERIO_RATEIO.COLABORADORES;
    const d = await dadosDaFolha(repo, tenant, competencia);
    const folha = folhaComConvencoes(d, competencia);
    // Lançamentos que podem ter parcela na competência (amortização de até 60 meses).
    const { itens: lancamentos } = await repo.listar(tenant, "custosLancamentos", {}, TUDO);
    const resultado = apurarResultado({
      competencia, contratos: d.cadastro.contratos, tomadores: d.cadastro.tomadores, vinculos: d.cadastro.vinculos,
      holerites: folha.holerites, custosExtras: d.calculo.custosExtras,
      lancamentos: lancamentos.filter((l) => l.data.slice(0, 7) <= competencia),
      contribuicoesPatronais: (folha.convencoes?.contribuicoesPatronais ?? []).reduce((s, c) => s + c.valor, 0),
      empresa: d.empresa, criterio,
    });
    sucesso(res, { ...resultado, pendenciasDaFolha: folha.pendencias.length });
  });

  /** Preço de faturamento do contrato (base da receita no resultado). */
  r.patch("/api/contratos/:id/faturamento", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "financeiro", "editar");
    const contrato = await repo.obter(tenant, "contratosTomador", ctx.params.id);
    if (!contrato) throw erroNaoEncontrado("contrato não encontrado");
    const modalidade = corpo?.modalidade;
    if (!Object.values(MODALIDADE_FATURAMENTO).includes(modalidade)) throw erroValidacao("modalidade de faturamento inválida", ["modalidade"]);
    const f = { modalidade };
    if (modalidade === MODALIDADE_FATURAMENTO.TAXA_SOBRE_CUSTO) {
      f.taxaPercentual = Number(corpo.taxaPercentual);
      if (!(f.taxaPercentual >= 0 && f.taxaPercentual <= 300)) throw erroValidacao("taxa de administração entre 0% e 300%", ["taxaPercentual"]);
    } else {
      f.valor = Number(corpo.valor);
      if (!(Number.isInteger(f.valor) && f.valor > 0)) throw erroValidacao("valor em centavos, maior que zero", ["valor"]);
    }
    sucesso(res, await repo.atualizar(tenant, "contratosTomador", contrato.id, { faturamento: f }));
  });

  /**
   * Rateio do custo de um colaborador próprio entre contratos (preposto, supervisor que atende
   * vários tomadores). Percentuais somam 100; lista vazia volta para os custos indiretos.
   */
  r.patch("/api/colaboradores/:matricula/rateio", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "financeiro", "editar");
    const v = await repo.obter(tenant, "vinculos", ctx.params.matricula);
    if (!v) throw erroNaoEncontrado("colaborador não encontrado");
    if (v.contratoId) throw erroValidacao("colaborador alocado em posto já vai inteiro para o contrato dele", ["matricula"]);
    const cad = await carregarCadastro(repo, tenant);
    const rateio = (corpo?.rateioContratos ?? []).map((x) => ({ contratoId: x.contratoId, percentual: Number(x.percentual) }));
    if (rateio.some((x) => !cad.contrato.has(x.contratoId) || !(x.percentual > 0))) throw erroValidacao("contrato inexistente ou percentual inválido no rateio", ["rateioContratos"]);
    const soma = rateio.reduce((s, x) => s + x.percentual, 0);
    if (rateio.length && Math.abs(soma - 100) > 0.001) throw erroValidacao(`percentuais somam ${soma}%: devem somar 100%`, ["rateioContratos"]);
    sucesso(res, await repo.atualizar(tenant, "vinculos", v.id, { rateioContratos: rateio }));
  });
}
