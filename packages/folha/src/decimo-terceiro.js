/**
 * 13º salário (Lei 4.090/1962 e Lei 4.749/1965).
 *
 * - 1ª parcela: de fevereiro até 30/11, metade da remuneração proporcional aos avos do ano.
 *   Sem INSS e IRRF; tem FGTS no mês do pagamento.
 * - 2ª parcela: até 20/12, sobre o valor integral (remuneração de dezembro + médias das
 *   variáveis) menos a 1ª parcela. INSS e IRRF calculados só sobre o 13º, em separado do mês.
 * - IRRF do 13º: tributação exclusiva na fonte com a tabela mensal, escolhendo entre deduções
 *   legais e desconto simplificado; a redução da Lei 15.270/2025 vale também para o 13º.
 *   A dispensa de retenção até R$ 10,00 não vale para rendimento de tributação exclusiva.
 * - Adicionais de insalubridade e periculosidade integram a remuneração.
 */
import { VERBAS, TIPO_VERBA, efeitoNaBase } from "./verbas.js";
import { calcularINSS, calcularIRRF } from "./impostos.js";
import { tabelaDaCompetencia, ARREDONDAMENTO_INSS, ARREDONDAMENTO_FGTS } from "./tabelas.js";
import { avosDecimoTerceiro } from "./avos.js";

const r = Math.round;

/** Remuneração mensal fixa: salário + periculosidade (30%) + insalubridade (sobre o mínimo). */
export function remuneracaoFixa(colaborador, tabela) {
  const peric = colaborador.periculosidade ? r(colaborador.salario * 0.3) : 0;
  const insal = colaborador.insalubridadeGrau ? r((tabela.salarioMinimo * colaborador.insalubridadeGrau) / 100) : 0;
  return colaborador.salario + peric + insal;
}

function fgtsDe(base, tabela, opcoes) {
  const bruto = (base * tabela.fgts.aliquota) / 100;
  return opcoes.arredondamentoFGTS === ARREDONDAMENTO_FGTS.TRUNCAR ? Math.floor(bruto) : r(bruto);
}

function resumo(itens) {
  const proventos = itens.filter((i) => i.tipo === TIPO_VERBA.PROVENTO).reduce((s, i) => s + i.valor, 0);
  const descontos = itens.filter((i) => i.tipo === TIPO_VERBA.DESCONTO).reduce((s, i) => s + i.valor, 0);
  return { proventos, descontos, liquido: proventos - descontos };
}

const item = (verba, valor, referencia = null) => ({ codigo: verba.codigo, nome: verba.nome, tipo: verba.tipo, referencia, valor, verba });
const semVerba = (itens) => itens.filter((i) => i.valor > 0).map(({ verba, ...i }) => i);

/** Avos do ano, projetando até dezembro ou até o fim previsto do contrato (temporário). */
function avosDoAno(colaborador, ano) {
  return avosDecimoTerceiro(ano, { admissao: colaborador.admissao, fim: colaborador.desligamento ?? colaborador.fimPrevisto ?? null });
}

/**
 * 1ª parcela (adiantamento). @param dados { colaborador, ano, medias?, avos? }
 */
export function calcularPrimeiraParcela({ colaborador, ano, medias = 0, avos = null }, opcoes = {}) {
  const tabela = opcoes.tabela ?? tabelaDaCompetencia(`${ano}-11`);
  const n = avos ?? avosDoAno(colaborador, ano);
  const base = remuneracaoFixa(colaborador, tabela) + medias;
  const valor = r((base * n) / 12 / 2);
  const itens = [item(VERBAS.DECIMO_TERCEIRO_ADIANTAMENTO, valor, `${n}/12 ÷ 2`)];
  return {
    ano, avos: n, base, valor,
    itens: semVerba(itens), ...resumo(itens),
    fgts: fgtsDe(valor, tabela, opcoes),
    prazo: `${ano}-11-30`,
  };
}

/**
 * 13º integral e 2ª parcela. @param dados { colaborador, ano, medias?, avos?, primeiraParcela?,
 *   pensao? } — `primeiraParcela` é o valor já pago; é descontado e sai da base do FGTS de dezembro.
 */
export function calcularDecimoTerceiro({ colaborador, ano, medias = 0, avos = null, primeiraParcela = 0, pensao = 0 }, opcoes = {}) {
  const tabela = opcoes.tabela ?? tabelaDaCompetencia(`${ano}-12`);
  const n = avos ?? avosDoAno(colaborador, ano);
  const base = remuneracaoFixa(colaborador, tabela) + medias;
  const integral = r((base * n) / 12);
  const itens = [item(VERBAS.DECIMO_TERCEIRO, integral, `${n}/12`)];
  const impostos = impostosDoDecimoTerceiro(itens, colaborador, tabela, opcoes, pensao);
  itens.push(...impostos.itens);
  itens.push(item(VERBAS.DECIMO_TERCEIRO_DESCONTO_ADIANTAMENTO, primeiraParcela));
  return {
    ano, avos: n, base, integral,
    itens: semVerba(itens), ...resumo(itens),
    bases: { inss13: impostos.inss.base, irrf13: impostos.irrf.base },
    fgts: fgtsDe(Math.max(0, integral - primeiraParcela), tabela, opcoes),
    detalhe: { inss: impostos.inss, irrf: impostos.irrf },
    prazo: `${ano}-12-20`,
  };
}

/** INSS e IRRF do 13º sobre as verbas com incidência de 13º. Usado também na rescisão. */
export function impostosDoDecimoTerceiro(itens, colaborador, tabela, opcoes = {}, pensao = 0) {
  const base = (b) => Math.max(0, itens.reduce((s, i) => s + efeitoNaBase(i.verba, i.valor, b), 0));
  const inss = calcularINSS(base("inss13"), tabela, { arredondamento: opcoes.arredondamentoINSS ?? ARREDONDAMENTO_INSS.POR_FAIXA });
  const irrf = calcularIRRF({
    rendimentos: base("irrf13"),
    inss: inss.valor,
    dependentes: colaborador.dependentesIR ?? 0,
    pensao,
    dispensarAte10: false,
  }, tabela);
  return {
    inss, irrf,
    itens: [
      item(VERBAS.INSS_13, inss.valor, inss.faixas.length ? `até ${inss.faixas.at(-1).aliquota}%` : null),
      item(VERBAS.IRRF_13, irrf.valor, irrf.valor ? `${irrf.aliquota}%` : null),
    ],
  };
}
