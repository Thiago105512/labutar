/**
 * Faturamento por medição. A medição do mês diz quanto o contrato fatura; o tomador aprova no
 * portal; aprovada, vira fatura (RPS → NFS-e) com as retenções que o tomador faz na fonte:
 * - INSS 11% sobre o valor dos serviços de cessão de mão de obra, inclusive trabalho temporário
 *   (Lei 8.212/1991, art. 31; EFD-Reinf R-2010 do tomador);
 * - IRRF 1% sobre limpeza, conservação, segurança e locação de mão de obra (código 1708);
 * - CSRF 4,65% — PIS 0,65%, COFINS 3% e CSLL 1% (Lei 10.833/2003, art. 30; código 5952);
 * - ISS pela alíquota do município do serviço, retido pelo tomador na cessão de mão de obra
 *   (LC 116/2003, art. 6º, § 2º).
 * Retenção de IRRF ou CSRF de até R$ 10,00 é dispensada. Valores em centavos.
 */
import { MODALIDADE_FATURAMENTO } from "../../custos/src/apuracao.js";

const r = Math.round;

export const RETENCOES_PADRAO = Object.freeze({ inss: 11, irrf: 1, pis: 0.65, cofins: 3, csll: 1, iss: 5, issRetido: true });

/** Dias do colaborador no contrato dentro do mês (admissão e desligamento), em base 30. */
function diasNoMes(competencia, { admissao, desligamento }) {
  const [a, m] = competencia.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const inicio = admissao > `${competencia}-01` ? Number(admissao.slice(8)) : 1;
  const fim = desligamento && desligamento < `${competencia}-${String(ultimo).padStart(2, "0")}` ? Number(desligamento.slice(8)) : ultimo;
  if (admissao > `${competencia}-${String(ultimo).padStart(2, "0")}` || (desligamento && desligamento < `${competencia}-01`)) return 0;
  // Mês inteiro conta 30; parcial conta os dias corridos.
  return inicio === 1 && fim === ultimo ? 30 : Math.max(0, fim - inicio + 1);
}

/**
 * Medição do contrato no mês.
 * @param dados { contrato: { id, faturamento: { modalidade, valor?, taxaPercentual?, faturarExtras? } }, competencia,
 *   colaboradores: [{ matricula, nome, admissao, desligamento?, custo?, faltasDias?, horasExtras50?, horasExtras100?, jornadaMensal? }] }
 *   custo: custo da mão de obra do colaborador no mês (centro de custos), para TAXA_SOBRE_CUSTO;
 *   faltas e horas extras vêm do ponto aprovado pelo tomador.
 * @returns { itens: [{ matricula, nome, descricao, valor, detalhe }], valorBruto, modalidade }
 */
export function calcularMedicao({ contrato, competencia, colaboradores = [] }) {
  const f = contrato.faturamento;
  if (!f) throw new Error("contrato sem preço de faturamento");
  const itens = [];
  if (f.modalidade === MODALIDADE_FATURAMENTO.VALOR_FIXO) {
    itens.push({ matricula: null, nome: null, descricao: "Valor mensal do contrato", valor: f.valor, detalhe: null });
  } else if (f.modalidade === MODALIDADE_FATURAMENTO.POR_COLABORADOR) {
    for (const c of colaboradores) {
      const dias = diasNoMes(competencia, c);
      if (!dias) continue;
      const base = r((f.valor * dias) / 30);
      const glosa = r((f.valor / 30) * (c.faltasDias ?? 0));
      const valorHora = f.valor / (c.jornadaMensal ?? 220);
      const extras = f.faturarExtras === false ? 0 : r((c.horasExtras50 ?? 0) * valorHora * 1.5 + (c.horasExtras100 ?? 0) * valorHora * 2);
      const valor = Math.max(0, base - glosa) + extras;
      const partes = [`${dias}/30 dias`, glosa ? `glosa de ${c.faltasDias} falta(s)` : null, extras ? "horas extras aprovadas" : null].filter(Boolean).join(" · ");
      itens.push({ matricula: c.matricula, nome: c.nome, descricao: "Posto", valor, detalhe: { dias, base, glosa, extras, texto: partes } });
    }
  } else if (f.modalidade === MODALIDADE_FATURAMENTO.TAXA_SOBRE_CUSTO) {
    for (const c of colaboradores) {
      if (!c.custo) continue;
      const taxa = r((c.custo * (f.taxaPercentual ?? 0)) / 100);
      itens.push({ matricula: c.matricula, nome: c.nome, descricao: "Mão de obra + taxa de administração", valor: c.custo + taxa, detalhe: { custo: c.custo, taxa, taxaPercentual: f.taxaPercentual, texto: `mão de obra + ${f.taxaPercentual}% de taxa` } });
    }
  } else throw new Error(`modalidade ${f.modalidade} não prevista`);
  return { modalidade: f.modalidade, itens, valorBruto: itens.reduce((s, i) => s + i.valor, 0) };
}

/**
 * Retenções na fonte sobre a fatura.
 * @param valorBruto centavos, @param parametros RETENCOES_PADRAO com ajustes do contrato/município
 */
export function calcularRetencoes(valorBruto, parametros = {}) {
  const p = { ...RETENCOES_PADRAO, ...parametros };
  const pct = (aliq) => r((valorBruto * aliq) / 100);
  const irrf = pct(p.irrf);
  const pis = pct(p.pis), cofins = pct(p.cofins), csll = pct(p.csll);
  const csrf = pis + cofins + csll;
  const ret = {
    inss: pct(p.inss),
    irrf: irrf > 1000 ? irrf : 0,
    pis: csrf > 1000 ? pis : 0, cofins: csrf > 1000 ? cofins : 0, csll: csrf > 1000 ? csll : 0,
    iss: p.issRetido ? pct(p.iss) : 0,
  };
  const totalRetido = Object.values(ret).reduce((s, v) => s + v, 0);
  return {
    ...ret, totalRetido, liquido: valorBruto - totalRetido, aliquotas: p,
    issProprio: p.issRetido ? 0 : pct(p.iss),
    avisos: [irrf <= 1000 && irrf > 0 ? "IRRF de até R$ 10,00: dispensado." : null, csrf <= 1000 && csrf > 0 ? "CSRF de até R$ 10,00: dispensada." : null].filter(Boolean),
  };
}

/** Discriminação do RPS (o texto que vai na NFS-e). */
export function discriminacaoDoRPS({ contrato, tomador, competencia, medicao, retencoes }) {
  const mes = `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;
  const reais = (c) => (c / 100).toFixed(2).replace(".", ",");
  return [
    `${contrato.tipo === "TRABALHO_TEMPORARIO" ? "Fornecimento de trabalho temporário (Lei 6.019/1974)" : "Prestação de serviços com cessão de mão de obra"} — competência ${mes}.`,
    `Tomador: ${tomador?.razaoSocial ?? ""}. Contrato ${contrato.id}. ${medicao.itens.length} item(ns) medido(s).`,
    `Retenções: INSS ${reais(retencoes.inss)}; IRRF ${reais(retencoes.irrf)}; PIS ${reais(retencoes.pis)}; COFINS ${reais(retencoes.cofins)}; CSLL ${reais(retencoes.csll)}; ISS ${reais(retencoes.iss)}.`,
    `Valor líquido a pagar: R$ ${reais(retencoes.liquido)}.`,
  ].join("\n");
}
