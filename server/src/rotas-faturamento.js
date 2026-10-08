/**
 * Faturamento por medição. Para cada contrato com o tomador e competência:
 * RASCUNHO (calculada a partir do centro de custos e do ponto aprovado) → ENVIADA (Financeiro
 * manda ao tomador) → APROVADA ou CONTESTADA (tomador, no portal) → FATURADA (RPS emitido com as
 * retenções; a receita do contrato no centro de custos passa a ser a faturada).
 *
 * A NFS-e de Manaus é emitida no sistema da prefeitura a partir do RPS: aqui o número é do RPS
 * (fictício no demo), sem transmissão.
 */
import { calcularMedicao, calcularRetencoes, discriminacaoDoRPS } from "../../packages/faturamento/src/index.js";
import { validarCompetencia } from "../../packages/folha/src/index.js";
import { PAPEIS_TOMADOR, TIPO_CONTA, podeNoTomador } from "../../packages/acesso/src/index.js";
import { somarDias, hoje } from "../../packages/core/src/datas.js";
import { sucesso, erroValidacao, erroNaoEncontrado, erroConflito, erroSemPermissao } from "./http/resposta.js";
import { exigirPermissao, exigirConta } from "./middleware/contexto.js";
import { carregarCadastro } from "./cadastro.js";
import { resultadoDaCompetencia } from "./rotas-custos.js";

const TUDO = { limite: 100_000 };
export const STATUS_MEDICAO = Object.freeze({ RASCUNHO: "RASCUNHO", ENVIADA: "ENVIADA", APROVADA: "APROVADA", CONTESTADA: "CONTESTADA", FATURADA: "FATURADA" });

function competenciaValida(ctx) {
  const c = ctx.params.competencia;
  if (!validarCompetencia(c)) throw erroValidacao("competência inválida: use AAAA-MM", ["competencia"]);
  return c;
}

/** Medições calculadas de todos os contratos ativos com preço, junto com as já salvas. */
async function medicoesDaCompetencia(repo, tenant, competencia) {
  const [cad, { resultado }, { itens: salvas }, { itens: espelhos }, empresa] = await Promise.all([
    carregarCadastro(repo, tenant),
    resultadoDaCompetencia(repo, tenant, competencia),
    repo.listar(tenant, "medicoes", { competencia }, TUDO),
    repo.listar(tenant, "pontoEspelhos", { competencia }, TUDO),
    repo.obter(tenant, "folhaParametros", "empresa"),
  ]);
  const porContrato = new Map(salvas.map((m) => [m.contratoId, m]));
  const ponto = new Map(espelhos.filter((e) => e.status === "APROVADO" || e.status === "LANCADO").map((e) => [e.matricula, e.lancamentos ?? {}]));
  const lista = [];
  for (const c of resultado.contratos) {
    const contrato = cad.contrato.get(c.contratoId);
    const tomador = cad.tomador.get(contrato.tomadorId);
    const salva = porContrato.get(c.contratoId);
    if (salva && salva.status !== STATUS_MEDICAO.RASCUNHO && salva.status !== STATUS_MEDICAO.CONTESTADA) { lista.push({ ...salva, tomador: tomador?.nomeFantasia || tomador?.razaoSocial }); continue; }
    if (!contrato.faturamento) { lista.push({ contratoId: c.contratoId, tomadorId: contrato.tomadorId, tomador: tomador?.nomeFantasia || tomador?.razaoSocial, competencia, status: "SEM_PRECO", valorBruto: 0, itens: [] }); continue; }
    const custoDe = new Map(c.detalhe.colaboradores.filter((x) => !x.rateio).map((x) => [x.matricula, x.custo]));
    const colaboradores = cad.vinculos.filter((v) => v.contratoId === c.contratoId).map((v) => ({
      matricula: v.matricula, nome: cad.pessoa.get(v.pessoaId)?.nome ?? v.matricula, admissao: v.admissao, desligamento: v.desligamento,
      jornadaMensal: v.jornadaMensal, custo: custoDe.get(v.matricula) ?? 0, ...(ponto.get(v.matricula) ?? {}),
    }));
    const medicao = calcularMedicao({ contrato, competencia, colaboradores });
    const retencoes = calcularRetencoes(medicao.valorBruto, { ...(empresa?.retencoes ?? {}), ...(contrato.retencoes ?? {}) });
    lista.push({
      id: salva?.id ?? `${competencia}:${c.contratoId}`, contratoId: c.contratoId, tomadorId: contrato.tomadorId, tomador: tomador?.nomeFantasia || tomador?.razaoSocial,
      tipoContrato: contrato.tipo, competencia, status: salva?.status ?? STATUS_MEDICAO.RASCUNHO, contestacao: salva?.contestacao ?? null,
      modalidade: medicao.modalidade, itens: medicao.itens, valorBruto: medicao.valorBruto, retencoes,
      pontoAprovado: colaboradores.filter((x) => ponto.has(x.matricula)).length, colaboradores: colaboradores.length, historico: salva?.historico ?? [],
    });
  }
  return { lista, cad };
}

const passo = (acao, para, por, motivo = null) => ({ acao, para, por, motivo, em: new Date().toISOString() });

export function registrarRotasFaturamento(r, { repo }) {
  r.get("/api/faturamento/:competencia", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "financeiro", "ver");
    const competencia = competenciaValida(ctx);
    const { lista } = await medicoesDaCompetencia(repo, tenant, competencia);
    const soma = (f) => lista.reduce((s, m) => s + (f(m) ?? 0), 0);
    sucesso(res, {
      competencia, medicoes: lista,
      totais: { bruto: soma((m) => m.valorBruto), retido: soma((m) => m.retencoes?.totalRetido), liquido: soma((m) => m.retencoes?.liquido), faturadas: lista.filter((m) => m.status === "FATURADA").length },
    });
  });

  /** Financeiro manda a medição ao tomador (congela o cálculo). */
  r.post("/api/faturamento/:competencia/:contratoId/enviar", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "financeiro", "editar");
    const competencia = competenciaValida(ctx);
    const { lista } = await medicoesDaCompetencia(repo, tenant, competencia);
    const m = lista.find((x) => x.contratoId === ctx.params.contratoId);
    if (!m) throw erroNaoEncontrado("contrato sem medição na competência");
    if (m.status === "SEM_PRECO") throw erroConflito("contrato sem preço de faturamento: cadastre o preço antes");
    if (m.status !== STATUS_MEDICAO.RASCUNHO && m.status !== STATUS_MEDICAO.CONTESTADA) throw erroConflito("medição já enviada");
    if (!m.valorBruto) throw erroConflito("medição sem valor");
    const id = `${competencia}:${m.contratoId}`;
    const doc = { ...m, id, status: STATUS_MEDICAO.ENVIADA, enviadaEm: new Date().toISOString(), historico: [...m.historico, passo("ENVIAR", "ENVIADA", ctx.usuario ?? null)] };
    delete doc.tomador;
    if (await repo.obter(tenant, "medicoes", id)) await repo.atualizar(tenant, "medicoes", id, doc); else await repo.inserir(tenant, "medicoes", doc);
    sucesso(res, { status: doc.status, valorBruto: doc.valorBruto });
  });

  /** Aprovada pelo tomador: emite o RPS com as retenções e o vencimento do contrato. */
  r.post("/api/faturamento/:competencia/:contratoId/faturar", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "financeiro", "criar");
    const competencia = competenciaValida(ctx);
    const id = `${competencia}:${ctx.params.contratoId}`;
    const m = await repo.obter(tenant, "medicoes", id);
    if (!m) throw erroNaoEncontrado("medição não encontrada");
    if (m.status !== STATUS_MEDICAO.APROVADA) throw erroConflito("só medição aprovada pelo tomador é faturada");
    const cad = await carregarCadastro(repo, tenant);
    const contrato = cad.contrato.get(m.contratoId);
    const { itens: faturadas } = await repo.listar(tenant, "medicoes", { status: STATUS_MEDICAO.FATURADA }, TUDO);
    const numero = faturadas.reduce((mx, x) => Math.max(mx, x.rps?.numero ?? 0), 0) + 1;
    const emissao = hoje();
    const rps = {
      numero, serie: "RPS", emissao, vencimento: somarDias(emissao, contrato.prazoPagamentoDias ?? 30),
      discriminacao: discriminacaoDoRPS({ contrato, tomador: cad.tomador.get(m.tomadorId), competencia, medicao: m, retencoes: m.retencoes }),
      nfse: null, situacao: "RPS emitido; NFS-e a converter no sistema da prefeitura",
    };
    await repo.atualizar(tenant, "medicoes", id, { status: STATUS_MEDICAO.FATURADA, rps, historico: [...(m.historico ?? []), passo("FATURAR", "FATURADA", ctx.usuario ?? null)] });
    sucesso(res, { status: STATUS_MEDICAO.FATURADA, rps, retencoes: m.retencoes });
  });

  // ------------------------------------------------------------ portal do tomador

  function exigirTomador(ctx, acao) {
    const conta = exigirConta(ctx, TIPO_CONTA.TOMADOR);
    if (!podeNoTomador(conta.escopo.papel, acao)) throw erroSemPermissao(`seu papel (${PAPEIS_TOMADOR.find((p) => p.id === conta.escopo.papel)?.nome ?? "—"}) não permite esta ação`);
    return conta;
  }

  r.get("/api/portal/tomador/medicoes", async (req, res, ctx) => {
    const conta = exigirConta(ctx, TIPO_CONTA.TOMADOR);
    const pode = (a) => podeNoTomador(conta.escopo.papel, a);
    if (!pode("aprovarMedicao") && !pode("verMedicao") && !pode("verFaturas")) throw erroSemPermissao("seu papel não vê medições");
    const { itens } = await repo.listar(conta.tenant, "medicoes", { tomadorId: conta.escopo.tomadorId }, TUDO);
    sucesso(res, {
      podeAprovar: pode("aprovarMedicao"),
      itens: itens.sort((a, b) => b.competencia.localeCompare(a.competencia)).map((m) => ({
        id: m.id, competencia: m.competencia, contratoId: m.contratoId, tipoContrato: m.tipoContrato, status: m.status, modalidade: m.modalidade,
        itens: m.itens, valorBruto: m.valorBruto, retencoes: m.retencoes, rps: m.rps ?? null, contestacao: m.contestacao ?? null,
      })),
    });
  });

  r.post("/api/portal/tomador/medicoes/:competencia/:contratoId", async (req, res, ctx, corpo) => {
    const { tenant, escopo, usuario } = exigirTomador(ctx, "aprovarMedicao");
    const id = `${competenciaValida(ctx)}:${ctx.params.contratoId}`;
    const m = await repo.obter(tenant, "medicoes", id);
    if (!m || m.tomadorId !== escopo.tomadorId) throw erroNaoEncontrado("medição não encontrada");
    if (m.status !== STATUS_MEDICAO.ENVIADA) throw erroConflito("esta medição não está aguardando aprovação");
    const acao = corpo?.acao;
    const motivo = String(corpo?.motivo ?? "").trim();
    if (acao !== "APROVAR" && acao !== "CONTESTAR") throw erroValidacao("ação: APROVAR ou CONTESTAR", ["acao"]);
    if (acao === "CONTESTAR" && motivo.length < 10) throw erroValidacao("descreva o que está errado (pelo menos 10 caracteres)", ["motivo"]);
    const para = acao === "APROVAR" ? STATUS_MEDICAO.APROVADA : STATUS_MEDICAO.CONTESTADA;
    const quem = `${usuario.nome} (${escopo.tomadorNome ?? escopo.tomadorId})`;
    await repo.atualizar(tenant, "medicoes", id, {
      status: para, ...(acao === "CONTESTAR" ? { contestacao: { por: quem, motivo, em: new Date().toISOString() } } : { aprovacao: { por: quem, em: new Date().toISOString() } }),
      historico: [...(m.historico ?? []), passo(acao, para, quem, motivo || null)],
    });
    sucesso(res, { status: para });
  });
}
