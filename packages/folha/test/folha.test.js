import { test } from "node:test";
import assert from "node:assert/strict";
import { ARREDONDAMENTO_INSS, REGIME_TRIBUTARIO, calcularFolha, calcularHolerite, calendarioDaCompetencia, CATALOGO_VERBAS } from "../src/index.js";

const valor = (h, codigo) => h.itens.find((i) => i.codigo === codigo)?.valor ?? 0;

test("calendário de setembro/2026: 7 de setembro e feriado estadual do Amazonas", () => {
  const nacional = calendarioDaCompetencia("2026-09");
  assert.deepEqual([nacional.dias, nacional.domingos, nacional.uteis, nacional.descanso], [30, 4, 25, 5]);
  const manaus = calendarioDaCompetencia("2026-09", { uf: "AM", municipio: "Manaus" });
  assert.deepEqual([manaus.uteis, manaus.descanso], [24, 6]);
});

test("holerite com insalubridade, horas extras, DSR, adiantamento e vale-transporte", () => {
  const h = calcularHolerite(
    { matricula: "20000017", nome: "A", vinculo: "TEMPORARIO", salario: 220_000, admissao: "2026-03-01", insalubridadeGrau: 20 },
    "2026-09",
    { horasExtras50: 10, horasExtras100: 4, custoValeTransporte: 30_000, adiantamento: 88_000 }
  );
  assert.equal(valor(h, "1000.01"), 220_000);
  assert.equal(valor(h, "1202.01"), 32_420); // 20% de R$ 1.621,00
  assert.equal(valor(h, "1003.01"), 17_210); // (2.200 + 324,20) / 220 × 1,5 × 10
  assert.equal(valor(h, "1003.02"), 9_179);
  assert.equal(valor(h, "1002.01"), 5_278); // 263,89 / 25 × 5
  assert.equal(h.bases.inss, 284_087);
  assert.equal(valor(h, "9201.01"), 23_137);
  assert.equal(valor(h, "9203.01"), 0); // simplificado: 2.233,67 isento
  assert.equal(valor(h, "9216.01"), 13_200);
  assert.equal(h.fgts, 22_727);
  assert.equal(h.liquido, h.proventos - h.descontos);
});

test("admissão no mês paga dias de contrato; desligamento vai para a rescisão", () => {
  const h = calcularHolerite({ matricula: "1", nome: "B", salario: 300_000, admissao: "2026-09-16", filhosSalarioFamilia: 1 }, "2026-09");
  assert.equal(h.detalhe.diasDeContrato, 15);
  assert.equal(valor(h, "1000.01"), 150_000);
  assert.equal(valor(h, "1409.01"), 3_377); // base R$ 1.500 ≤ limite: cota proporcional
  assert.throws(() => calcularHolerite({ matricula: "2", nome: "C", salario: 300_000, admissao: "2026-01-05", desligamento: "2026-09-20" }, "2026-09"), /rescisão/);
});

test("regressão dezembro/2020: bate no centavo com o sistema anterior (INSS truncado)", () => {
  const casos = [
    // salário, dependentes IR, total de descontos do relatório original
    [262_868, 1, 131_088],
    [262_868, 0, 132_510],
    [181_007, 0, 87_125],
    [131_961, 0, 63_092],
  ];
  for (const [salario, dependentesIR, esperado] of casos) {
    const h = calcularHolerite(
      { matricula: "X", nome: "X", salario, admissao: "2020-08-06", dependentesIR },
      "2020-12",
      { adiantamento: Math.round(salario * 0.4) },
      { arredondamentoINSS: ARREDONDAMENTO_INSS.TRUNCA_FAIXA }
    );
    assert.equal(h.descontos, esperado, `salário ${salario / 100}`);
  }
});

test("folha da competência: totais fecham, encargos por regime e pendências", () => {
  const colaboradores = [
    { matricula: "20000017", nome: "A", salario: 250_000, admissao: "2026-01-10", lotacao: "TOM:T1" },
    { matricula: "30000014", nome: "B", salario: 600_000, admissao: "2025-05-02", lotacao: "TOM:T1", periculosidade: true },
    { matricula: "10000011", nome: "C", salario: 500_000, admissao: "2024-02-01", lotacao: "SET:DP" },
    { matricula: "20000025", nome: "D", salario: 250_000, admissao: "2026-02-01", desligamento: "2026-09-10", lotacao: "TOM:T2" },
  ];
  const empresa = { regime: REGIME_TRIBUTARIO.NORMAL, ratPercentual: 3, fap: 1, terceirosPercentual: 5.8 };
  const f = calcularFolha({ empresa, competencia: "2026-09", colaboradores });
  assert.equal(f.resumo.colaboradores, 3);
  assert.equal(f.pendencias.length, 1);
  assert.match(f.pendencias[0].motivo, /rescisão/);
  assert.equal(f.resumo.proventos - f.resumo.descontos, f.resumo.liquido);
  assert.equal(f.resumo.porVerba.filter((v) => v.tipo === "PROVENTO").reduce((s, v) => s + v.valor, 0), f.resumo.proventos);
  // Encargos calculados por lotação: cada uma a 20% + 3% + 5,8% da própria base.
  for (const l of f.resumo.porLotacao) {
    assert.equal(l.encargos.patronal, Math.round(l.baseINSS * 0.2));
    assert.equal(l.encargos.rat, Math.round(l.baseINSS * 0.03));
    assert.equal(l.encargos.terceiros, Math.round(l.baseINSS * 0.058));
  }
  assert.equal(f.resumo.porLotacao.length, 2);
  assert.equal(f.resumo.porLotacao.reduce((s, l) => s + l.custoTotal, 0), f.resumo.custoTotal);

  const simples = calcularFolha({ empresa: { regime: REGIME_TRIBUTARIO.SIMPLES_CPP_NO_DAS }, competencia: "2026-09", colaboradores });
  assert.equal(simples.resumo.encargos.total, 0);
  assert.equal(simples.resumo.fgts, f.resumo.fgts);
});

test("catálogo de verbas segue o padrão NNNN.VV e marca natureza a conferir", () => {
  for (const v of CATALOGO_VERBAS) assert.match(v.codigo, /^\d{4}\.\d{2}$/);
  assert.ok(CATALOGO_VERBAS.some((v) => !v.naturezaConferida));
});

test("cenário de teste: 1.000 colaboradores (600 temporários, 300 terceirizados, 100 próprios) em menos de 1 segundo", () => {
  const colaboradores = [];
  const lotacoes = ["TOM:T1", "TOM:T2", "TOM:T3", "TOM:T4"];
  for (let i = 0; i < 1000; i++) {
    const proprio = i >= 900;
    colaboradores.push({
      matricula: String(10_000_000 + i),
      nome: `Colaborador ${i}`,
      vinculo: proprio ? "PROPRIO" : i < 600 ? "TEMPORARIO" : "TERCEIRIZADO",
      salario: 170_000 + (i % 40) * 9_000,
      admissao: i % 25 === 0 ? "2026-09-14" : "2026-03-02",
      dependentesIR: i % 3,
      filhosSalarioFamilia: i % 7 === 0 ? 1 : 0,
      insalubridadeGrau: i % 11 === 0 ? 20 : undefined,
      lotacao: proprio ? "SET:ADM" : lotacoes[i % 4],
    });
  }
  const lancamentos = Object.fromEntries(colaboradores.map((c, i) => [c.matricula, { horasExtras50: i % 13, horasNoturnas: i % 5 === 0 ? 60 : 0, faltasDias: i % 50 === 0 ? 1 : 0 }]));
  const inicio = performance.now();
  const f = calcularFolha({ empresa: { ratPercentual: 3, terceirosPercentual: 5.8, local: { uf: "AM", municipio: "Manaus" } }, competencia: "2026-09", colaboradores, lancamentos });
  const ms = performance.now() - inicio;
  assert.equal(f.resumo.colaboradores, 1000);
  assert.equal(f.resumo.porLotacao.length, 5);
  assert.equal(f.resumo.proventos - f.resumo.descontos, f.resumo.liquido);
  assert.equal(f.resumo.porLotacao.reduce((s, l) => s + l.custoTotal, 0), f.resumo.custoTotal);
  assert.ok(ms < 1000, `levou ${Math.round(ms)} ms`);
});
