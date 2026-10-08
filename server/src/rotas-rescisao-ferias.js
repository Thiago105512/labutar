/**
 * 13º salário, férias e rescisão a partir do cadastro. As rotas "simular" só calculam: nada é
 * gravado, e por isso bastam permissão de ver a folha. As rotas "registros" gravam: a rescisão
 * desliga o vínculo e, aprovada, lança o custo no centro de custos; as férias entram na folha dos
 * meses de gozo. O cálculo é do motor (packages/folha).
 */
import {
  calcularRescisao, calcularFerias, validarProgramacaoFerias, calcularPrimeiraParcela, calcularDecimoTerceiro,
  periodosAquisitivos, MOTIVO_DESLIGAMENTO, tabelaDaCompetencia,
  STATUS_RESCISAO, NOME_STATUS_RESCISAO, ACAO_RESCISAO, STATUS_FERIAS, NOME_STATUS_FERIAS, ACAO_FERIAS,
  aplicarAcaoRegistro, custoDaRescisao, diasUsadosNoPeriodo, feriasSobrepostas, montarTRCT, montarReciboFerias,
} from "../../packages/folha/src/index.js";
import { validarLancamentoDeCusto } from "../../packages/custos/src/index.js";
import { novoId } from "../../packages/core/src/ids.js";
import { sucesso, erroValidacao, erroNaoEncontrado, erroConflito } from "./http/resposta.js";
import { exigirCompetenciaAberta } from "./fechamento.js";
import { gravarLancamentos } from "./rotas-custos.js";
import { exigirPermissao } from "./middleware/contexto.js";
import { carregarCadastro, colaboradoresDaFolha } from "./cadastro.js";
import { colaboradorDaFolha } from "../../packages/cadastro/src/index.js";
import { hoje, somarDias } from "../../packages/core/src/datas.js";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const TUDO = { limite: 100_000 };

const opcoesDaEmpresa = (empresa, colaborador) => ({
  local: colaborador.local ?? empresa.local,
  arredondamentoINSS: empresa.arredondamentoINSS,
  arredondamentoFGTS: empresa.arredondamentoFGTS,
  dispensarIRRFAte10: empresa.dispensarIRRFAte10,
});

function centavos(valor, campo) {
  if (valor === undefined || valor === null || valor === "") return 0;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0) throw erroValidacao(`${campo}: valor em centavos, inteiro e não negativo`, [campo]);
  return n;
}

function tabelaVigente(data, campo) {
  try { return tabelaDaCompetencia(data.slice(0, 7)); } catch (e) { throw erroValidacao(e.message, [campo]); }
}

async function carregar(repo, tenant, matricula, dataReferencia) {
  const [cad, empresa] = await Promise.all([carregarCadastro(repo, tenant), repo.obter(tenant, "folhaParametros", "empresa")]);
  const vinculo = cad.vinculos.find((v) => v.matricula === matricula);
  if (!vinculo) throw erroNaoEncontrado("colaborador não encontrado");
  const colaborador = colaboradorDaFolha({
    vinculo, pessoa: cad.pessoa.get(vinculo.pessoaId), posto: cad.posto.get(vinculo.postoId), tomador: cad.tomador.get(vinculo.tomadorId), empresa: empresa ?? {},
  }, dataReferencia.slice(0, 7));
  return { vinculo, colaborador, empresa: empresa ?? {} };
}

/**
 * Períodos aquisitivos já gozados. Sem histórico de férias no cadastro (dados importados), os
 * períodos anteriores ao último completo são tratados como gozados — com aviso para conferir.
 */
function gozados(vinculo, ate, avisos) {
  if (Array.isArray(vinculo.periodosGozados)) return vinculo.periodosGozados;
  const completos = periodosAquisitivos(vinculo.admissao, ate).filter((p) => p.completo);
  if (completos.length > 1) avisos.push("Sem histórico de férias no cadastro: considerados gozados os períodos anteriores ao último completo. Confira antes de pagar.");
  return completos.slice(0, -1).map((p) => p.inicio);
}

function entradaDaRescisao(d) {
  return {
    avisoIndenizado: Boolean(d.avisoIndenizado), avisoNaoCumprido: Boolean(d.avisoNaoCumprido),
    medias: centavos(d.medias, "medias"), saldoFGTS: centavos(d.saldoFGTS, "saldoFGTS"),
    primeiraParcela13: centavos(d.primeiraParcela13, "primeiraParcela13"), adiantamento: centavos(d.adiantamento, "adiantamento"),
  };
}

/** Rescisão calculada a partir do cadastro (mesma conta para simular e para gravar). */
async function calcularRescisaoDoCadastro(repo, tenant, d) {
  if (!DATA.test(d.desligamento ?? "")) throw erroValidacao("data de desligamento inválida", ["desligamento"]);
  if (!MOTIVO_DESLIGAMENTO[d.motivo]) throw erroValidacao("motivo de desligamento inválido (Tabela 19 do eSocial)", ["motivo"]);
  const tabela = tabelaVigente(d.desligamento, "desligamento");
  const { vinculo, colaborador, empresa } = await carregar(repo, tenant, d.matricula, d.desligamento);
  if (d.desligamento < vinculo.admissao) throw erroValidacao("desligamento antes da admissão", ["desligamento"]);
  const e = entradaDaRescisao(d);
  const avisosCadastro = [];
  const { itens: registros } = await repo.listar(tenant, "ferias", { matricula: vinculo.matricula }, TUDO);
  const parciais = new Set(registros.filter((f) => f.status !== STATUS_FERIAS.CANCELADA && f.restanteDoPeriodo > 0).map((f) => f.periodo.inicio));
  if (parciais.size) avisosCadastro.push("Há período de férias gozado em parte: a rescisão paga o período inteiro como vencido. Desconte os dias já gozados.");
  const resultado = calcularRescisao({
    colaborador: { ...colaborador, desligamento: null },
    desligamento: d.desligamento,
    motivo: d.motivo,
    avisoIndenizado: e.avisoIndenizado,
    avisoNaoCumprido: e.avisoNaoCumprido,
    medias: e.medias,
    saldoFGTS: e.saldoFGTS,
    primeiraParcela13: e.primeiraParcela13,
    periodosGozados: gozados(vinculo, d.desligamento, avisosCadastro),
    lancamentos: { adiantamento: e.adiantamento },
  }, { ...opcoesDaEmpresa(empresa, colaborador), tabela });
  resultado.avisos.unshift(...avisosCadastro);
  return { resultado, vinculo, colaborador };
}

/**
 * Férias calculadas a partir do cadastro e das férias já gravadas: o período aquisitivo é o mais
 * antigo completo com dias em aberto (gozo em mais de um período é permitido, art. 134, § 1º).
 */
async function calcularFeriasDoCadastro(repo, tenant, d) {
  if (!DATA.test(d.inicio ?? "")) throw erroValidacao("data de início inválida", ["inicio"]);
  const dias = Number(d.dias), abonoDias = Number(d.abonoDias ?? 0);
  if (!Number.isInteger(dias) || dias < 5 || dias > 30) throw erroValidacao("dias de gozo entre 5 e 30", ["dias"]);
  if (!Number.isInteger(abonoDias) || abonoDias < 0 || abonoDias > 10) throw erroValidacao("abono de 0 a 10 dias", ["abonoDias"]);
  const tabela = tabelaVigente(d.inicio, "inicio");
  const { vinculo, colaborador, empresa } = await carregar(repo, tenant, d.matricula, d.inicio);
  const { itens: registros } = await repo.listar(tenant, "ferias", { matricula: vinculo.matricula }, TUDO);
  const avisosCadastro = [];
  const listaGozados = gozados(vinculo, d.inicio, avisosCadastro);
  const jaGozados = new Set(listaGozados);
  const local = colaborador.local ?? empresa.local;
  const faltas = Number(d.faltas ?? 0);
  const direitoDe = (periodo) => validarProgramacaoFerias({ periodo, parcelas: [], faltas, local }).direito;
  const periodo = periodosAquisitivos(vinculo.admissao, d.inicio)
    .find((p) => p.completo && p.fim < d.inicio && !jaGozados.has(p.inicio) && diasUsadosNoPeriodo(registros, vinculo.matricula, p.inicio) < direitoDe(p));
  if (!periodo) throw erroValidacao("sem período aquisitivo completo em aberto nesta data", ["inicio"]);
  const usados = diasUsadosNoPeriodo(registros, vinculo.matricula, periodo.inicio);
  const programacao = validarProgramacaoFerias({ periodo, parcelas: [{ inicio: d.inicio, dias }], abonoDias, faltas, hoje: hoje(), local });
  const restante = programacao.direito - usados - dias - abonoDias;
  // Uma parcela por vez: a regra de "dias de gozo = direito" vale para o conjunto, conferida aqui pelo restante.
  programacao.erros = programacao.erros.filter((e) => !e.startsWith("dias de gozo"));
  if (usados) avisosCadastro.push(`${usados} dia(s) deste período já registrados em outra parcela.`);
  const abonoAnterior = registros.some((f) => f.status !== STATUS_FERIAS.CANCELADA && f.periodo.inicio === periodo.inicio && f.abonoDias > 0);
  if (abonoDias && abonoAnterior) programacao.erros.push("o abono pecuniário deste período já foi registrado em outra parcela");
  if (restante > 0 && restante < 5) programacao.erros.push(`sobrariam ${restante} dias: nenhum período de férias pode ter menos de 5 dias (art. 134, § 1º)`);
  if (restante < 0) programacao.erros.push(`dias de gozo + abono passam do saldo de ${programacao.direito - usados} dias do período`);
  else if (restante > 0) programacao.avisos.push(`Restam ${restante} dias deste período para outro gozo (mínimo de 5 dias, e um dos períodos com 14 ou mais).`);
  const recibo = calcularFerias({
    colaborador, inicio: d.inicio, dias, abonoDias, medias: centavos(d.medias, "medias"), diasEmDobro: programacao.parcelas[0]?.diasEmDobro ?? 0,
  }, { ...opcoesDaEmpresa(empresa, colaborador), tabela });
  return {
    periodo, recibo, restante, usados, vinculo, colaborador, registros, gozados: listaGozados,
    programacao: { ...programacao, ok: programacao.erros.length === 0, avisos: [...avisosCadastro, ...programacao.avisos] },
  };
}

/** Empresa, pessoa e vínculo para montar o TRCT e o recibo. */
async function documentoBase(repo, tenant, matricula) {
  const [cad, empresa] = await Promise.all([carregarCadastro(repo, tenant), repo.obter(tenant, "folhaParametros", "empresa")]);
  const vinculo = cad.vinculos.find((v) => v.matricula === matricula);
  if (!vinculo) throw erroNaoEncontrado("colaborador não encontrado");
  const posto = cad.posto.get(vinculo.postoId);
  return { empresa: empresa ?? {}, pessoa: cad.pessoa.get(vinculo.pessoaId) ?? null, vinculo: { ...vinculo, cargo: vinculo.cargo ?? posto?.funcao ?? null } };
}

const resumoRescisao = (x) => ({
  id: x.id, matricula: x.matricula, nome: x.nome, vinculo: x.vinculo, desligamento: x.desligamento, motivo: x.motivo,
  liquido: x.resultado.liquido, proventos: x.resultado.proventos, descontos: x.resultado.descontos, custo: x.custo.total,
  prazoPagamento: x.prazoPagamento, status: x.status, pagoEm: x.pagoEm ?? null, foraDoPrazo: x.foraDoPrazo ?? false,
});

const resumoFerias = (x) => ({
  id: x.id, matricula: x.matricula, nome: x.nome, periodo: x.periodo, inicio: x.inicio, fim: x.fim, retorno: x.retorno,
  dias: x.dias, abonoDias: x.abonoDias, restanteDoPeriodo: x.restanteDoPeriodo, liquido: x.recibo.liquido,
  prazoPagamento: x.prazoPagamento, status: x.status, pagoEm: x.pagoEm ?? null, foraDoPrazo: x.foraDoPrazo ?? false,
});

export function registrarRotasRescisaoFerias(r, { repo }) {
  r.get("/api/folha/rescisao/motivos", async (req, res, ctx) => {
    exigirPermissao(ctx, "folha", "ver");
    sucesso(res, Object.entries(MOTIVO_DESLIGAMENTO).sort(([a], [b]) => a.localeCompare(b)).map(([codigo, m]) => ({ codigo, nome: m.nome, aviso: m.aviso, multaFGTS: m.multaFGTS })));
  });

  r.post("/api/folha/rescisao/simular", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "folha", "ver");
    sucesso(res, (await calcularRescisaoDoCadastro(repo, tenant, corpo ?? {})).resultado);
  });

  r.post("/api/folha/ferias/simular", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "folha", "ver");
    const f = await calcularFeriasDoCadastro(repo, tenant, corpo ?? {});
    sucesso(res, { periodo: f.periodo, programacao: f.programacao, recibo: f.recibo });
  });

  // ------------------------------------------------------------- rescisões gravadas

  r.get("/api/folha/rescisao/registros", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "folha", "ver");
    const { itens } = await repo.listar(tenant, "rescisoes", {}, TUDO);
    sucesso(res, itens.sort((a, b) => b.desligamento.localeCompare(a.desligamento)).map(resumoRescisao));
  });

  r.get("/api/folha/rescisao/registros/:id", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "folha", "ver");
    const reg = await repo.obter(tenant, "rescisoes", ctx.params.id);
    if (!reg) throw erroNaoEncontrado("rescisão não encontrada");
    const { empresa, pessoa, vinculo } = await documentoBase(repo, tenant, reg.matricula);
    sucesso(res, { ...reg, trct: montarTRCT({ empresa, pessoa, vinculo, rescisao: reg }) });
  });

  r.post("/api/folha/rescisao/registros", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "folha", "editar");
    const d = corpo ?? {};
    const { resultado, vinculo, colaborador } = await calcularRescisaoDoCadastro(repo, tenant, d);
    if (vinculo.desligamento) throw erroConflito(`colaborador já desligado em ${vinculo.desligamento}`);
    await exigirCompetenciaAberta(repo, tenant, d.desligamento.slice(0, 7));
    const { itens: ferias } = await repo.listar(tenant, "ferias", { matricula: vinculo.matricula }, TUDO);
    const depois = ferias.find((f) => f.status !== STATUS_FERIAS.CANCELADA && f.fim > d.desligamento);
    if (depois) throw erroConflito(`há férias registradas de ${depois.inicio} a ${depois.fim}: cancele antes de desligar`);
    const em = new Date().toISOString();
    const reg = await repo.inserir(tenant, "rescisoes", {
      id: novoId("RES"), matricula: vinculo.matricula, nome: colaborador.nome, cpf: colaborador.cpf ?? null, vinculo: vinculo.tipo,
      contratoId: vinculo.contratoId ?? null, tomadorId: vinculo.tomadorId ?? null,
      desligamento: d.desligamento, motivo: resultado.motivo, entrada: entradaDaRescisao(d), resultado,
      prazoPagamento: resultado.prazoPagamento, custo: custoDaRescisao(resultado),
      status: STATUS_RESCISAO.CALCULADA, historico: [{ acao: "CALCULAR", de: null, para: STATUS_RESCISAO.CALCULADA, motivo: null, por: ctx.usuario ?? null, em }],
      custoLancamentoId: null, pagoEm: null,
    });
    await repo.atualizar(tenant, "vinculos", vinculo.id, { desligamento: d.desligamento, motivoDesligamento: d.motivo, rescisaoId: reg.id });
    sucesso(res, reg, 201);
  });

  r.post("/api/folha/rescisao/registros/:id/acao", async (req, res, ctx, corpo) => {
    const d = corpo ?? {};
    const regra = ACAO_RESCISAO[d.acao];
    if (!regra) throw erroValidacao("ação inválida", ["acao"]);
    const tenant = exigirPermissao(ctx, "folha", regra.permissao);
    const reg = await repo.obter(tenant, "rescisoes", ctx.params.id);
    if (!reg) throw erroNaoEncontrado("rescisão não encontrada");
    const em = new Date().toISOString();
    const r2 = aplicarAcaoRegistro(ACAO_RESCISAO, NOME_STATUS_RESCISAO, reg, { acao: d.acao, motivo: d.motivo ?? "", usuario: ctx.usuario ?? null, em });
    if (!r2.ok) throw erroConflito(r2.erro);
    const dados = { ...r2.estado };
    const avisos = [];
    if (d.acao === "APROVAR" && reg.custo.total > 0) {
      // O custo da rescisão vai para o contrato em que o colaborador trabalhava.
      const v = validarLancamentoDeCusto({
        data: reg.desligamento, tipo: "RESCISAO", descricao: `Rescisão de ${reg.nome}: ${reg.motivo.nome}`,
        quantidade: 1, custoUnitario: reg.custo.total, destino: { tipo: "COLABORADOR", matricula: reg.matricula },
      });
      const [l] = await gravarLancamentos(repo, tenant, [v.lancamento], { usuario: ctx.usuario ?? null, origem: "RESCISAO" });
      dados.custoLancamentoId = l.id;
    }
    if (d.acao === "PAGAR") {
      const data = d.data ?? hoje();
      if (!DATA.test(data)) throw erroValidacao("data de pagamento inválida", ["data"]);
      dados.pagoEm = data;
      dados.foraDoPrazo = data > reg.prazoPagamento;
      if (dados.foraDoPrazo) avisos.push(`Pago depois do prazo (${reg.prazoPagamento}): é devida a multa do art. 477, § 8º, da CLT (um salário).`);
    }
    if (d.acao === "CANCELAR") {
      await exigirCompetenciaAberta(repo, tenant, reg.desligamento.slice(0, 7));
      if (reg.custoLancamentoId) await repo.remover(tenant, "custosLancamentos", reg.custoLancamentoId);
      dados.custoLancamentoId = null;
      const { itens } = await repo.listar(tenant, "vinculos", { matricula: reg.matricula }, TUDO);
      if (itens[0]) await repo.atualizar(tenant, "vinculos", itens[0].id, { desligamento: null, motivoDesligamento: null, rescisaoId: null });
    }
    const gravado = await repo.atualizar(tenant, "rescisoes", reg.id, dados);
    sucesso(res, { ...resumoRescisao(gravado), historico: gravado.historico, avisos });
  });

  // ---------------------------------------------------------------- férias gravadas

  r.get("/api/folha/ferias/registros", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "folha", "ver");
    const { itens } = await repo.listar(tenant, "ferias", {}, TUDO);
    sucesso(res, itens.sort((a, b) => b.inicio.localeCompare(a.inicio)).map(resumoFerias));
  });

  r.get("/api/folha/ferias/registros/:id", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "folha", "ver");
    const reg = await repo.obter(tenant, "ferias", ctx.params.id);
    if (!reg) throw erroNaoEncontrado("férias não encontradas");
    const { empresa, pessoa, vinculo } = await documentoBase(repo, tenant, reg.matricula);
    sucesso(res, { ...reg, documento: montarReciboFerias({ empresa, pessoa, vinculo, ferias: reg }) });
  });

  r.post("/api/folha/ferias/registros", async (req, res, ctx, corpo) => {
    const tenant = exigirPermissao(ctx, "folha", "editar");
    const f = await calcularFeriasDoCadastro(repo, tenant, corpo ?? {});
    if (!f.programacao.ok) throw erroValidacao(f.programacao.erros.join("; "), ["inicio"]);
    if (f.vinculo.desligamento) throw erroConflito(`colaborador desligado em ${f.vinculo.desligamento}`);
    const sobreposta = feriasSobrepostas(f.registros, f.vinculo.matricula, f.recibo.inicio, f.recibo.fim);
    if (sobreposta) throw erroConflito(`já há férias de ${sobreposta.inicio} a ${sobreposta.fim}`);
    for (const p of f.recibo.porCompetencia) await exigirCompetenciaAberta(repo, tenant, p.competencia);
    const em = new Date().toISOString();
    const reg = await repo.inserir(tenant, "ferias", {
      id: novoId("FER"), matricula: f.vinculo.matricula, nome: f.colaborador.nome, periodo: f.periodo,
      inicio: f.recibo.inicio, fim: f.recibo.fim, retorno: somarDias(f.recibo.fim, 1), dias: f.recibo.dias, abonoDias: f.recibo.abonoDias,
      restanteDoPeriodo: f.restante, recibo: f.recibo, prazoPagamento: f.recibo.prazoPagamento, avisos: f.programacao.avisos,
      status: STATUS_FERIAS.PROGRAMADA, historico: [{ acao: "PROGRAMAR", de: null, para: STATUS_FERIAS.PROGRAMADA, motivo: null, por: ctx.usuario ?? null, em }],
      pagoEm: null,
    });
    // Período inteiro usado: entra nos gozados do vínculo (a rescisão não paga de novo).
    if (f.restante === 0) await repo.atualizar(tenant, "vinculos", f.vinculo.id, { periodosGozados: [...new Set([...f.gozados, f.periodo.inicio])] });
    sucesso(res, reg, 201);
  });

  r.post("/api/folha/ferias/registros/:id/acao", async (req, res, ctx, corpo) => {
    const d = corpo ?? {};
    const regra = ACAO_FERIAS[d.acao];
    if (!regra) throw erroValidacao("ação inválida", ["acao"]);
    const tenant = exigirPermissao(ctx, "folha", regra.permissao);
    const reg = await repo.obter(tenant, "ferias", ctx.params.id);
    if (!reg) throw erroNaoEncontrado("férias não encontradas");
    const r2 = aplicarAcaoRegistro(ACAO_FERIAS, NOME_STATUS_FERIAS, reg, { acao: d.acao, motivo: d.motivo ?? "", usuario: ctx.usuario ?? null, em: new Date().toISOString() });
    if (!r2.ok) throw erroConflito(r2.erro);
    const dados = { ...r2.estado };
    const avisos = [];
    if (d.acao === "PAGAR") {
      const data = d.data ?? hoje();
      if (!DATA.test(data)) throw erroValidacao("data de pagamento inválida", ["data"]);
      dados.pagoEm = data;
      dados.foraDoPrazo = data > reg.prazoPagamento;
      if (dados.foraDoPrazo) avisos.push(`Pago depois do prazo (${reg.prazoPagamento}): férias pagas fora do prazo do art. 145 são devidas em dobro (art. 137 da CLT, conforme entendimento vigente) — confira com o jurídico.`);
    }
    if (d.acao === "CANCELAR") {
      for (const p of reg.recibo.porCompetencia) await exigirCompetenciaAberta(repo, tenant, p.competencia);
      const { itens } = await repo.listar(tenant, "vinculos", { matricula: reg.matricula }, TUDO);
      const v = itens[0];
      if (v && Array.isArray(v.periodosGozados) && v.periodosGozados.includes(reg.periodo.inicio)) {
        await repo.atualizar(tenant, "vinculos", v.id, { periodosGozados: v.periodosGozados.filter((x) => x !== reg.periodo.inicio) });
      }
    }
    const gravado = await repo.atualizar(tenant, "ferias", reg.id, dados);
    sucesso(res, { ...resumoFerias(gravado), historico: gravado.historico, avisos });
  });

  /** 13º do ano para todos os colaboradores ativos: ?parcela=1 (até 30/11) ou 2 (até 20/12). */
  r.get("/api/folha/decimo-terceiro/:ano", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "folha", "ver");
    const ano = Number(ctx.params.ano);
    if (!Number.isInteger(ano)) throw erroValidacao("ano inválido", ["ano"]);
    const parcela = String(ctx.query.parcela ?? "2") === "1" ? 1 : 2;
    const competencia = `${ano}-${parcela === 1 ? "11" : "12"}`;
    const prazo = parcela === 1 ? `${ano}-11-30` : `${ano}-12-20`;
    const tabela = tabelaVigente(`${competencia}-01`, "ano");
    const [cad, empresa] = await Promise.all([carregarCadastro(repo, tenant), repo.obter(tenant, "folhaParametros", "empresa")]);
    const itens = colaboradoresDaFolha(cad, competencia, empresa ?? {})
      .filter((c) => !c.desligamento)
      .map((c) => {
        const opcoes = { ...opcoesDaEmpresa(empresa ?? {}, c), tabela };
        const primeira = calcularPrimeiraParcela({ colaborador: c, ano }, opcoes);
        const calc = parcela === 1 ? primeira : calcularDecimoTerceiro({ colaborador: c, ano, primeiraParcela: primeira.valor }, opcoes);
        // Contrato que termina antes do prazo: o 13º (ou o que falta dele) vai na rescisão.
        const naRescisao = Boolean(c.fimPrevisto && c.fimPrevisto < prazo);
        return { matricula: c.matricula, nome: c.nome, cpf: c.cpf, vinculo: c.vinculo, lotacao: c.lotacao, fimPrevisto: c.fimPrevisto, naRescisao, avos: calc.avos, base: calc.base, itens: calc.itens, proventos: calc.proventos, descontos: calc.descontos, liquido: calc.liquido, fgts: calc.fgts };
      });
    const pagos = itens.filter((i) => !i.naRescisao);
    const soma = (k) => pagos.reduce((s, i) => s + i[k], 0);
    sucesso(res, {
      ano, parcela, prazo,
      totais: { colaboradores: pagos.length, naRescisao: itens.length - pagos.length, proventos: soma("proventos"), descontos: soma("descontos"), liquido: soma("liquido"), fgts: soma("fgts") },
      itens,
    });
  });
}
