/**
 * Resultado por contrato (centro de custo) na competência: o que cada contrato com o tomador custa
 * e rende, para a gestão saber o que dá lucro.
 *
 * Custo do contrato:
 * - Pessoal: proventos (sem salário-família, que o INSS reembolsa), FGTS e encargos da empresa
 *   de quem trabalha no contrato.
 * - Provisões do mês: 1/12 de 13º e 1/12 de férias + 1/3, com encargos e FGTS sobre elas.
 * - Benefícios e custos da convenção coletiva (VR, cesta, odontológico, seguro...).
 * - Preposto e supervisão: colaborador próprio com rateio entre contratos (percentual).
 * - Custos lançados: uniforme, EPI, crachá, exames, treinamento... pelo colaborador ou contrato.
 * - Indiretos: pessoal próprio sem rateio, despesas gerais e contribuição patronal, rateados
 *   entre os contratos pelo número de colaboradores (ou pelo custo direto).
 *
 * Receita: pela modalidade de faturamento do contrato. Tributos sobre a receita pelo percentual da
 * empresa. Margem de contribuição = receita − tributos − custo direto (o que o contrato paga da
 * estrutura); resultado = margem de contribuição − indiretos rateados.
 */
import { encargosDaEmpresa } from "../../folha/src/folha.js";
import { distribuirCentavos } from "../../mao-de-obra/src/rateio.js";
import { DESTINO_CUSTO, TIPO_CUSTO, parcelaNaCompetencia } from "./lancamentos.js";

export const MODALIDADE_FATURAMENTO = Object.freeze({
  /** Valor mensal por colaborador alocado (posto). */
  POR_COLABORADOR: "POR_COLABORADOR",
  /** Custo da mão de obra (pessoal, encargos, provisões e benefícios) + taxa de administração. */
  TAXA_SOBRE_CUSTO: "TAXA_SOBRE_CUSTO",
  /** Valor fixo mensal do contrato. */
  VALOR_FIXO: "VALOR_FIXO",
});

export const CRITERIO_RATEIO = Object.freeze({ COLABORADORES: "COLABORADORES", CUSTO_DIRETO: "CUSTO_DIRETO" });

const r = Math.round;
const CODIGO_SALARIO_FAMILIA = "1409.01";

/** Provisão mensal de 13º e férias (+1/3) sobre a remuneração, com encargos e FGTS. */
export function provisaoMensal(remuneracao, empresa = {}) {
  const decimo = r(remuneracao / 12);
  const ferias = r((remuneracao / 12) * (4 / 3));
  const base = decimo + ferias;
  const encargos = encargosDaEmpresa(base, empresa).total;
  const fgts = r(base * 0.08);
  return { decimo, ferias, encargos, fgts, total: base + encargos + fgts };
}

function novoCentro(contrato, tomador) {
  return {
    contratoId: contrato.id, tomadorId: contrato.tomadorId, tomador: tomador?.nomeFantasia || tomador?.razaoSocial || contrato.tomadorId,
    tipoContrato: contrato.tipo, faturamento: contrato.faturamento ?? null,
    colaboradores: 0,
    custos: { pessoal: 0, encargos: 0, provisoes: 0, beneficios: 0, supervisao: 0, lancados: {}, indiretos: 0 },
    detalhe: { colaboradores: [], lancamentos: [] },
  };
}

const somaLancados = (c) => Object.values(c.custos.lancados).reduce((s, v) => s + v, 0);
const custoDireto = (c) => c.custos.pessoal + c.custos.encargos + c.custos.provisoes + c.custos.beneficios + c.custos.supervisao + somaLancados(c);

/** Divide um valor entre contratos pelos pesos; sem peso positivo, em partes iguais. */
function repartir(valor, alvos, peso) {
  if (!alvos.length || !valor) return [];
  let pesos = alvos.map(peso);
  if (!pesos.some((p) => p > 0)) pesos = alvos.map(() => 1);
  return distribuirCentavos(valor, pesos).map((v, i) => [alvos[i], v]);
}

/**
 * @param dados {
 *   competencia, contratos, tomadores, vinculos,
 *   holerites: saída da folha (calcularFolha().holerites),
 *   custosExtras?: { matricula: [{ chave, nome, valor }] } — custos da convenção por colaborador,
 *   lancamentos?: lançamentos de custo (validados), contribuicoesPatronais?: centavos no mês,
 *   empresa?: { regime, ratPercentual, fap, terceirosPercentual, tributosFaturamentoPercentual },
 *   criterio?: CRITERIO_RATEIO
 * }
 */
export function apurarResultado({
  competencia, contratos = [], tomadores = [], vinculos = [], holerites = [], custosExtras = {},
  lancamentos = [], contribuicoesPatronais = 0, empresa = {}, criterio = CRITERIO_RATEIO.COLABORADORES,
}) {
  const tomadorPorId = new Map(tomadores.map((t) => [t.id, t]));
  const vinculoPorMatricula = new Map(vinculos.map((v) => [v.matricula, v]));
  const fimDoMes = `${competencia}-31`;
  const ativos = contratos.filter((c) => c.inicio <= fimDoMes && (!c.fim || c.fim >= `${competencia}-01`));
  const centros = new Map(ativos.map((c) => [c.id, novoCentro(c, tomadorPorId.get(c.tomadorId))]));
  const indiretos = [];
  const naoAlocados = [];

  // Colaborador próprio com rateio entre contratos (preposto, supervisor) → [centro, fração].
  const destinoDoVinculo = (v) => {
    if (!v) return null;
    if (v.contratoId && centros.has(v.contratoId)) return [[centros.get(v.contratoId), 1]];
    const rateio = (v.rateioContratos ?? []).filter((x) => centros.has(x.contratoId) && x.percentual > 0);
    if (rateio.length) return rateio.map((x) => [centros.get(x.contratoId), x.percentual]);
    return null;
  };

  // 1. Pessoal, encargos, provisões e benefícios da convenção.
  for (const h of holerites) {
    const mat = h.colaborador.matricula;
    const v = vinculoPorMatricula.get(mat);
    const sf = h.itens.find((i) => i.codigo === CODIGO_SALARIO_FAMILIA)?.valor ?? 0;
    const pessoal = h.proventos - sf;
    const encargos = encargosDaEmpresa(h.bases.inss, empresa).total + h.fgts;
    const provisoes = provisaoMensal(h.bases.inss, empresa).total;
    const beneficios = (custosExtras[mat] ?? []).reduce((s, c) => s + c.valor, 0);
    const destino = destinoDoVinculo(v);
    if (!destino) {
      indiretos.push({ origem: "PESSOAL_PROPRIO", descricao: `${h.colaborador.nome} (${h.colaborador.cargo ?? "próprio"})`, valor: pessoal + encargos + provisoes + beneficios });
      continue;
    }
    if (destino.length === 1 && destino[0][1] === 1 && v.contratoId) {
      const c = destino[0][0];
      c.colaboradores += 1;
      c.custos.pessoal += pessoal;
      c.custos.encargos += encargos;
      c.custos.provisoes += provisoes;
      c.custos.beneficios += beneficios;
      c.detalhe.colaboradores.push({ matricula: mat, nome: h.colaborador.nome, cargo: h.colaborador.cargo, custo: pessoal + encargos + provisoes + beneficios });
      continue;
    }
    // Preposto / supervisão: o custo total do próprio vai para os contratos que ele atende.
    const total = pessoal + encargos + provisoes + beneficios;
    const partes = distribuirCentavos(total, destino.map(([, p]) => p));
    destino.forEach(([c], i) => {
      c.custos.supervisao += partes[i];
      c.detalhe.colaboradores.push({ matricula: mat, nome: h.colaborador.nome, cargo: h.colaborador.cargo, custo: partes[i], rateio: true });
    });
  }

  // 2. Custos lançados (reconhecidos na competência).
  for (const l of lancamentos) {
    const valor = parcelaNaCompetencia(l, competencia);
    if (!valor) continue;
    const registrar = (c, v) => {
      c.custos.lancados[l.tipo] = (c.custos.lancados[l.tipo] ?? 0) + v;
      c.detalhe.lancamentos.push({ id: l.id ?? null, data: l.data, tipo: l.tipo, descricao: l.descricao, valor: v });
    };
    const d = l.destino;
    if (d.tipo === DESTINO_CUSTO.CONTRATO) {
      const c = centros.get(d.contratoId);
      if (c) registrar(c, valor); else naoAlocados.push({ ...l, valor, motivo: "contrato fora da vigência" });
    } else if (d.tipo === DESTINO_CUSTO.COLABORADOR) {
      const destino = destinoDoVinculo(vinculoPorMatricula.get(d.matricula));
      if (!destino) indiretos.push({ origem: "LANCAMENTO", descricao: `${TIPO_CUSTO[l.tipo]?.nome ?? l.tipo}: ${l.descricao}`, valor });
      else distribuirCentavos(valor, destino.map(([, p]) => p)).forEach((v, i) => registrar(destino[i][0], v));
    } else if (d.contratoIds?.length) {
      const alvos = d.contratoIds.map((id) => centros.get(id)).filter(Boolean);
      if (!alvos.length) naoAlocados.push({ ...l, valor, motivo: "nenhum contrato do rateio em vigência" });
      for (const [c, v] of repartir(valor, alvos, (c) => c.colaboradores)) registrar(c, v);
    } else {
      indiretos.push({ origem: "LANCAMENTO", descricao: `${TIPO_CUSTO[l.tipo]?.nome ?? l.tipo}: ${l.descricao}`, valor });
    }
  }
  if (contribuicoesPatronais) indiretos.push({ origem: "SINDICAL", descricao: "Contribuição negocial patronal", valor: contribuicoesPatronais });

  // 3. Rateio dos indiretos.
  const lista = [...centros.values()];
  const totalIndiretos = indiretos.reduce((s, i) => s + i.valor, 0);
  const pesoRateio = criterio === CRITERIO_RATEIO.CUSTO_DIRETO ? custoDireto : (c) => c.colaboradores;
  for (const [c, v] of repartir(totalIndiretos, lista, pesoRateio)) c.custos.indiretos += v;

  // 4. Receita, tributos e resultado.
  const tributosPct = empresa.tributosFaturamentoPercentual ?? 0;
  const resultado = lista.map((c) => {
    const custoTotal = custoDireto(c) + c.custos.indiretos;
    const maoDeObra = c.custos.pessoal + c.custos.encargos + c.custos.provisoes + c.custos.beneficios;
    const f = c.faturamento;
    const alertas = [];
    let receita = 0;
    if (!f) alertas.push("Contrato sem preço de faturamento cadastrado: sem receita, não dá para saber a margem.");
    else if (f.modalidade === MODALIDADE_FATURAMENTO.POR_COLABORADOR) receita = c.colaboradores * (f.valor ?? 0);
    else if (f.modalidade === MODALIDADE_FATURAMENTO.TAXA_SOBRE_CUSTO) receita = r(maoDeObra * (1 + (f.taxaPercentual ?? 0) / 100));
    else if (f.modalidade === MODALIDADE_FATURAMENTO.VALOR_FIXO) receita = f.valor ?? 0;
    const tributos = r((receita * tributosPct) / 100);
    const res = receita - tributos - custoTotal;
    // Margem de contribuição: o que o contrato deixa depois dos custos dele, antes da estrutura.
    const contribuicao = receita - tributos - custoDireto(c);
    // Ponto de equilíbrio: a receita que cobre o custo e os tributos, no formato do preço do contrato.
    const receitaNecessaria = Math.ceil(custoTotal / (1 - tributosPct / 100));
    const equilibrio = { receita: receitaNecessaria };
    if (f?.modalidade === MODALIDADE_FATURAMENTO.POR_COLABORADOR && c.colaboradores) equilibrio.valorPorColaborador = Math.ceil(receitaNecessaria / c.colaboradores);
    if (f?.modalidade === MODALIDADE_FATURAMENTO.TAXA_SOBRE_CUSTO && maoDeObra) equilibrio.taxaPercentual = Math.ceil((receitaNecessaria / maoDeObra - 1) * 10_000) / 100;
    if (f && res < 0) alertas.push("Contrato com prejuízo na competência.");
    if (c.colaboradores === 0 && custoTotal > 0) alertas.push("Custo sem colaborador alocado no mês.");
    return {
      ...c,
      custos: { ...c.custos, lancadosTotal: somaLancados(c) },
      custoDireto: custoDireto(c), custoTotal, maoDeObra, receita, tributos, resultado: res, equilibrio,
      margemContribuicao: contribuicao,
      margemContribuicaoPercentual: receita ? Math.round((contribuicao / receita) * 10_000) / 100 : null,
      margem: receita ? Math.round((res / receita) * 10_000) / 100 : null,
      custoPorColaborador: c.colaboradores ? r(custoTotal / c.colaboradores) : null,
      alertas,
    };
  }).sort((a, b) => (a.margem ?? -Infinity) - (b.margem ?? -Infinity));

  const soma = (k) => resultado.reduce((s, c) => s + c[k], 0);
  return {
    competencia, criterio, tributosPercentual: tributosPct,
    contratos: resultado,
    indiretos: { total: totalIndiretos, itens: indiretos },
    naoAlocados,
    totais: {
      contratos: resultado.length, colaboradores: soma("colaboradores"), receita: soma("receita"), tributos: soma("tributos"),
      custo: soma("custoTotal"), resultado: soma("resultado"), margemContribuicao: soma("margemContribuicao"),
      margem: soma("receita") ? Math.round((soma("resultado") / soma("receita")) * 10_000) / 100 : null,
      prejuizo: resultado.filter((c) => c.resultado < 0 && c.faturamento).length,
    },
  };
}
