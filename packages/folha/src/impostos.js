/**
 * INSS do segurado, IRRF e salário-família. Entradas e saídas em centavos inteiros.
 * Cada função devolve também o "porquê" (base, faixas, dedução usada), que vai para o
 * holerite e para a auditoria do cálculo.
 */
import { ARREDONDAMENTO_INSS, tetoINSS } from "./tabelas.js";

/** INSS progressivo por faixas, limitado ao teto. */
export function calcularINSS(base, tabela, { arredondamento = ARREDONDAMENTO_INSS.POR_FAIXA } = {}) {
  const baseLimitada = Math.max(0, Math.min(base, tetoINSS(tabela)));
  const arredonda = arredondamento === ARREDONDAMENTO_INSS.TRUNCA_FAIXA ? Math.floor : Math.round;
  let anterior = 0;
  let total = 0;
  const faixas = [];
  for (const faixa of tabela.inss.faixas) {
    const largura = Math.min(baseLimitada, faixa.ate) - anterior;
    if (largura <= 0) break;
    const valor = arredonda((largura * faixa.aliquota) / 100);
    faixas.push({ ate: faixa.ate, aliquota: faixa.aliquota, base: largura, valor });
    total += valor;
    anterior = faixa.ate;
  }
  return { base: baseLimitada, limitadaAoTeto: base > baseLimitada, valor: total, faixas, arredondamento };
}

function impostoPelaTabela(base, faixas) {
  if (base <= 0) return { valor: 0, aliquota: 0 };
  const faixa = faixas.find((f) => f.ate === null || base <= f.ate);
  return { valor: Math.max(0, Math.round((base * faixa.aliquota) / 100 - faixa.deduzir)), aliquota: faixa.aliquota };
}

/**
 * IRRF mensal. Compara as deduções legais (INSS, dependentes, pensão) com o desconto
 * simplificado e usa o que der menos imposto; depois aplica a redução da Lei 15.270/2025,
 * calculada sobre os rendimentos tributáveis do mês (antes das deduções).
 */
export function calcularIRRF({ rendimentos, inss = 0, dependentes = 0, pensao = 0 }, tabela) {
  const t = tabela.irrf;
  const deducoesLegais = inss + dependentes * t.porDependente + pensao;
  const legal = impostoPelaTabela(rendimentos - deducoesLegais, t.faixas);
  let escolhido = { modo: "DEDUCOES_LEGAIS", deducao: deducoesLegais, ...legal };
  if (t.descontoSimplificado != null) {
    const simples = impostoPelaTabela(rendimentos - t.descontoSimplificado, t.faixas);
    if (simples.valor < legal.valor) escolhido = { modo: "DESCONTO_SIMPLIFICADO", deducao: t.descontoSimplificado, ...simples };
  }

  let reducao = 0;
  const r = t.reducao;
  if (r && escolhido.valor > 0) {
    if (rendimentos <= r.integralAte) reducao = Math.min(escolhido.valor, r.maxima);
    else if (rendimentos <= r.decrescenteAte) reducao = Math.min(escolhido.valor, Math.max(0, Math.round(r.constante - r.fator * rendimentos)));
  }

  const devido = escolhido.valor - reducao;
  const dispensado = devido > 0 && devido <= (t.dispensaAte ?? 0);
  return {
    rendimentos,
    modo: escolhido.modo,
    deducao: escolhido.deducao,
    base: Math.max(0, rendimentos - escolhido.deducao),
    aliquota: escolhido.aliquota,
    impostoTabela: escolhido.valor,
    reducao,
    dispensado,
    valor: dispensado ? 0 : devido,
  };
}

/** Salário-família: cota por filho elegível se a remuneração do mês não passa do limite. */
export function calcularSalarioFamilia({ remuneracao, filhos = 0, diasNoMes = 30 }, tabela) {
  const sf = tabela.salarioFamilia;
  if (!filhos || remuneracao > sf.remuneracaoAte) return { valor: 0, cotas: 0, cota: sf.cota };
  const valor = Math.round((sf.cota * filhos * Math.min(30, diasNoMes)) / 30);
  return { valor, cotas: filhos, cota: sf.cota };
}
