import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validarItemDeCusto, validarLancamentoDeCusto, parcelaNaCompetencia, apurarResultado, provisaoMensal,
  MODALIDADE_FATURAMENTO, CRITERIO_RATEIO, DESTINO_CUSTO,
} from "../src/index.js";
import { encargosDaEmpresa } from "../../folha/src/folha.js";

const EMPRESA = { regime: "NORMAL", ratPercentual: 3, fap: 1, terceirosPercentual: 5.8, tributosFaturamentoPercentual: 14.25 };
const CONTRATOS = [
  { id: "C1", tomadorId: "T1", tipo: "PRESTACAO_SERVICOS", inicio: "2026-01-01", fim: null, faturamento: { modalidade: MODALIDADE_FATURAMENTO.POR_COLABORADOR, valor: 400_000 } },
  { id: "C2", tomadorId: "T2", tipo: "TRABALHO_TEMPORARIO", inicio: "2026-01-01", fim: "2026-12-31", faturamento: { modalidade: MODALIDADE_FATURAMENTO.TAXA_SOBRE_CUSTO, taxaPercentual: 20 } },
  { id: "C3", tomadorId: "T3", tipo: "PRESTACAO_SERVICOS", inicio: "2026-01-01", fim: null },
  { id: "C4", tomadorId: "T3", tipo: "PRESTACAO_SERVICOS", inicio: "2025-01-01", fim: "2025-12-31" },
];
const TOMADORES = [{ id: "T1", razaoSocial: "Um S.A." }, { id: "T2", razaoSocial: "Dois Ltda" }, { id: "T3", razaoSocial: "Três Ltda" }];
const VINCULOS = [
  { matricula: "A", contratoId: "C1" }, { matricula: "B", contratoId: "C1" }, { matricula: "D", contratoId: "C2" },
  { matricula: "P", contratoId: null, rateioContratos: [{ contratoId: "C1", percentual: 60 }, { contratoId: "C2", percentual: 40 }] },
  { matricula: "ADM", contratoId: null },
];
const h = (matricula, salario, sf = 0) => ({
  colaborador: { matricula, nome: matricula, cargo: "X" },
  proventos: salario + sf, itens: sf ? [{ codigo: "1409.01", valor: sf }] : [], bases: { inss: salario }, fgts: Math.round(salario * 0.08),
});
const HOLERITES = [h("A", 200_000), h("B", 200_000, 6_754), h("D", 300_000), h("P", 500_000), h("ADM", 400_000)];
const custoPessoa = (x) => x.proventos - (x.itens[0]?.valor ?? 0) + encargosDaEmpresa(x.bases.inss, EMPRESA).total + x.fgts + provisaoMensal(x.bases.inss, EMPRESA).total;

test("itens e lançamentos: validação, valor e amortização sem perder centavo", () => {
  assert.equal(validarItemDeCusto({ nome: "Bota de segurança", tipo: "EPI", custoUnitario: 12_000, amortizarMeses: 6 }).ok, true);
  assert.match(validarItemDeCusto({ nome: "B", tipo: "X", custoUnitario: 0 }).erros.join(), /nome.*tipo.*custo/s);
  const l = validarLancamentoDeCusto({ data: "2026-09-10", tipo: "EPI", descricao: "Bota", quantidade: 1, custoUnitario: 10_000, amortizarMeses: 3, destino: { tipo: "COLABORADOR", matricula: "A" } });
  assert.equal(l.ok, true);
  assert.equal(l.lancamento.valor, 10_000);
  const parcelas = ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"].map((c) => parcelaNaCompetencia(l.lancamento, c));
  assert.deepEqual(parcelas, [0, 3_334, 3_333, 3_333, 0]);
  assert.match(validarLancamentoDeCusto({ data: "2026-09-10", tipo: "EPI", descricao: "Bota", quantidade: 1, custoUnitario: 100, destino: {} }).erros.join(), /destino/);
});

test("provisão mensal de 13º e férias com encargos e FGTS", () => {
  const p = provisaoMensal(300_000, EMPRESA);
  assert.equal(p.decimo, 25_000);
  assert.equal(p.ferias, 33_333);
  assert.equal(p.fgts, Math.round(58_333 * 0.08));
  assert.equal(p.total, 58_333 + p.encargos + p.fgts);
});

test("resultado por contrato: direto, preposto rateado, lançados, indiretos e receita", () => {
  const lanc = (x) => validarLancamentoDeCusto(x).lancamento;
  const lancamentos = [
    { id: "L1", ...lanc({ data: "2026-09-02", tipo: "UNIFORME", descricao: "2 uniformes", quantidade: 2, custoUnitario: 8_500, destino: { tipo: "COLABORADOR", matricula: "A" } }) },
    { id: "L2", ...lanc({ data: "2026-09-02", tipo: "EPI", descricao: "Bota", quantidade: 1, custoUnitario: 12_000, amortizarMeses: 6, destino: { tipo: "COLABORADOR", matricula: "D" } }) },
    { id: "L3", ...lanc({ data: "2026-09-05", tipo: "EXAME", descricao: "Periódico", quantidade: 1, custoUnitario: 4_500, destino: { tipo: "COLABORADOR", matricula: "P" } }) },
    { id: "L4", ...lanc({ data: "2026-09-05", tipo: "ADMINISTRATIVO", descricao: "Aluguel do escritório", quantidade: 1, custoUnitario: 300_000, destino: { tipo: "RATEIO" } }) },
    { id: "L5", ...lanc({ data: "2026-09-05", tipo: "PREPOSTO", descricao: "Visita do preposto", quantidade: 1, custoUnitario: 9_000, destino: { tipo: "CONTRATO", contratoId: "C2" } }) },
    { id: "L6", ...lanc({ data: "2026-09-05", tipo: "OUTROS", descricao: "Contrato encerrado", quantidade: 1, custoUnitario: 1_000, destino: { tipo: "CONTRATO", contratoId: "C4" } }) },
  ];
  const r = apurarResultado({
    competencia: "2026-09", contratos: CONTRATOS, tomadores: TOMADORES, vinculos: VINCULOS, holerites: HOLERITES,
    custosExtras: { A: [{ chave: "PLANO_ODONTOLOGICO", valor: 1_600 }] }, lancamentos, contribuicoesPatronais: 35_000, empresa: EMPRESA,
  });
  const c = Object.fromEntries(r.contratos.map((x) => [x.contratoId, x]));
  assert.deepEqual(Object.keys(c).sort(), ["C1", "C2", "C3"]); // C4 fora da vigência
  assert.equal(c.C1.colaboradores, 2);
  assert.equal(c.C1.custos.pessoal, 400_000); // salário-família fora (o INSS reembolsa)
  assert.equal(c.C1.custos.beneficios, 1_600);
  assert.equal(c.C1.custos.lancados.UNIFORME, 17_000);
  assert.equal(c.C2.custos.lancados.EPI, 2_000); // bota amortizada em 6 meses
  assert.equal(c.C2.custos.lancados.PREPOSTO, 9_000);
  // Preposto próprio: 60% no C1, 40% no C2 — e o exame dele segue o mesmo rateio.
  assert.equal(c.C1.custos.supervisao + c.C2.custos.supervisao, custoPessoa(HOLERITES[3]));
  assert.equal(c.C1.custos.supervisao, Math.round(custoPessoa(HOLERITES[3]) * 0.6));
  assert.equal(c.C1.custos.lancados.EXAME + c.C2.custos.lancados.EXAME, 4_500);
  // Indiretos: ADM + aluguel + contribuição patronal, rateados por colaboradores (2:1:0).
  const indiretos = custoPessoa(HOLERITES[4]) + 300_000 + 35_000;
  assert.equal(r.indiretos.total, indiretos);
  assert.equal(c.C1.custos.indiretos, Math.round((indiretos * 2) / 3));
  assert.equal(c.C3.custos.indiretos, 0);
  // Nada se perde: a soma dos contratos é tudo o que entrou (menos o que ficou sem contrato vigente).
  const entrada = HOLERITES.reduce((s, x) => s + custoPessoa(x), 0) + 1_600 + 17_000 + 2_000 + 4_500 + 300_000 + 9_000 + 35_000;
  assert.equal(r.totais.custo, entrada);
  assert.equal(r.naoAlocados.length, 1);
  // Receita: C1 por colaborador; C2 = mão de obra + 20%; C3 sem preço.
  assert.equal(c.C1.receita, 800_000);
  const maoDeObraC2 = c.C2.custos.pessoal + c.C2.custos.encargos + c.C2.custos.provisoes + c.C2.custos.beneficios;
  assert.equal(c.C2.receita, Math.round(maoDeObraC2 * 1.2));
  assert.equal(c.C1.tributos, Math.round(800_000 * 0.1425));
  assert.equal(c.C1.resultado, 800_000 - c.C1.tributos - c.C1.custoTotal);
  assert.equal(c.C1.margemContribuicao, c.C1.resultado + c.C1.custos.indiretos);
  assert.match(c.C3.alertas.join(), /sem preço/);
  // Ponto de equilíbrio: preço que cobre custo e tributos.
  const necessaria = Math.ceil(c.C1.custoTotal / (1 - 0.1425));
  assert.equal(c.C1.equilibrio.receita, necessaria);
  assert.equal(c.C1.equilibrio.valorPorColaborador, Math.ceil(necessaria / 2));
  assert.ok(Math.abs(Math.round(c.C2.maoDeObra * (1 + c.C2.equilibrio.taxaPercentual / 100)) * (1 - 0.1425) - c.C2.custoTotal) < c.C2.maoDeObra * 0.0002);
  // Ordem: sem preço primeiro (precisa de ação), depois da pior para a melhor margem.
  assert.equal(r.contratos[0].contratoId, "C3");
  const margens = r.contratos.filter((x) => x.margem != null).map((x) => x.margem);
  assert.deepEqual(margens, [...margens].sort((a, b) => a - b));
});

test("rateio dos indiretos pelo custo direto", () => {
  const r = apurarResultado({ competencia: "2026-09", contratos: CONTRATOS, tomadores: TOMADORES, vinculos: VINCULOS, holerites: HOLERITES, empresa: EMPRESA, criterio: CRITERIO_RATEIO.CUSTO_DIRETO });
  const c = Object.fromEntries(r.contratos.map((x) => [x.contratoId, x]));
  const total = c.C1.custoDireto + c.C2.custoDireto;
  assert.equal(c.C1.custos.indiretos, Math.round((r.indiretos.total * c.C1.custoDireto) / total));
  assert.equal(DESTINO_CUSTO.RATEIO, "RATEIO");
});
