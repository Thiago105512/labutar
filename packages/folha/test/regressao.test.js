/**
 * Regressão com folha real (dezembro/2020, 38 colaboradores, anonimizada): o motor precisa
 * bater no centavo com o sistema anterior em todos os cálculos que ele já faz.
 * Parâmetros do sistema anterior, descobertos nesta conferência: INSS e FGTS truncados,
 * IRRF retido mesmo abaixo de R$ 10,00 e IRRF pelo regime de caixa.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ARREDONDAMENTO_FGTS, ARREDONDAMENTO_INSS, calcularHolerite, calcularINSS, calcularIRRF, calcularRescisao, tabelaDaCompetencia } from "../src/index.js";

const { casos } = JSON.parse(readFileSync(new URL("./casos/regressao-2020-12.json", import.meta.url), "utf8"));
const tabela = tabelaDaCompetencia("2020-12");
const LEGADO = { arredondamentoINSS: ARREDONDAMENTO_INSS.TRUNCA_FAIXA, arredondamentoFGTS: ARREDONDAMENTO_FGTS.TRUNCAR, dispensarIRRFAte10: false };

test("INSS de todos os 38 (folha e rescisão) e do 13º", () => {
  for (const c of casos) {
    assert.equal(calcularINSS(c.bases["001"], tabela, { arredondamento: LEGADO.arredondamentoINSS }).valor, c.descontos["0520"] ?? 0, c.caso);
    if (c.bases["002"] != null) {
      assert.equal(calcularINSS(c.bases["002"], tabela, { arredondamento: LEGADO.arredondamentoINSS }).valor, c.descontos["0525"] ?? 0, `${c.caso} 13º`);
    }
  }
});

test("IRRF de todos os 38 pela base do mês", () => {
  for (const c of casos) {
    const ir = calcularIRRF({ rendimentos: c.bases["003"], dispensarAte10: false }, tabela);
    assert.equal(ir.valor, c.descontos["0530"] ?? 0, c.caso);
  }
});

test("FGTS truncado e encargos da empresa (20%, RAT 3%, terceiros 2,5%)", () => {
  for (const c of casos) {
    if (c.bases["006"] != null) assert.equal(Math.floor(c.bases["006"] * 0.08), c.bases["008"], `${c.caso} FGTS`);
    const base = (c.bases["052"] ?? 0) + (c.bases["053"] ?? 0);
    assert.equal(Math.round(base * 0.2), c.bases["018"], `${c.caso} empresa`);
    assert.equal(Math.round(base * 0.03), c.bases["020"], `${c.caso} RAT`);
    assert.equal(Math.round(base * 0.025), c.bases["019"], `${c.caso} terceiros`);
  }
});

test("holerite mensal completo dos 11 que continuaram: descontos, líquido e FGTS no centavo", () => {
  const mensais = casos.filter((c) => !c.rescisao);
  assert.equal(mensais.length, 11);
  for (const c of mensais) {
    // Regime de caixa: a base de IRRF do relatório inclui outros rendimentos pagos no mês.
    const inss = c.descontos["0520"] ?? 0;
    const outros = c.bases["003"] - (c.salario - inss - c.dependentesIR * 18_959);
    const h = calcularHolerite(
      { matricula: c.caso, nome: c.caso, salario: c.salario, admissao: "2020-08-06", dependentesIR: c.dependentesIR },
      "2020-12",
      { adiantamento: c.descontos["0515"] ?? 0, outrosDescontos: c.descontos["1042"] ?? 0, outrosRendimentosIRNoMes: outros },
      LEGADO
    );
    const totalDescontos = Object.values(c.descontos).reduce((s, v) => s + v, 0);
    assert.equal(h.descontos, totalDescontos, `${c.caso} descontos`);
    assert.equal(h.liquido, c.salario - totalDescontos, `${c.caso} líquido`);
    assert.equal(h.fgts, c.bases["008"], `${c.caso} FGTS`);
  }
});

test("dispensa de IRRF até R$ 10,00 é opção da empresa (o sistema anterior retinha)", () => {
  const pequeno = casos.find((c) => (c.descontos["0530"] ?? 0) > 0 && c.descontos["0530"] < 1_000);
  assert.ok(pequeno, "há um caso de IRRF abaixo de R$ 10,00");
  assert.equal(calcularIRRF({ rendimentos: pequeno.bases["003"] }, tabela).valor, 0);
  assert.equal(calcularIRRF({ rendimentos: pequeno.bases["003"], dispensarAte10: false }, tabela).valor, pequeno.descontos["0530"]);
});

// Códigos do sistema anterior → verbas do catálogo, para lançar as variáveis já calculadas.
const VARIAVEIS_LEGADO = { "0102": "HORA_EXTRA_100", "0103": "HORA_EXTRA_100", "0104": "HORA_EXTRA_50", "0114": "PERICULOSIDADE", "0506": "DSR_VARIAVEIS", "0090": "FALTAS", "0099": "DSR_FALTAS" };

test("as 27 rescisões no centavo: saldo, férias com 1/3, 13º, INSS, INSS 13º, IRRF e líquido", () => {
  const rescisoes = casos.filter((c) => c.rescisao);
  assert.equal(rescisoes.length, 27);
  for (const c of rescisoes) {
    const P = c.proventos, D = c.descontos;
    // O relatório não tem datas (anonimizado): dias e avos saem dos próprios valores.
    const diasSaldo = Math.round((P["0037"] * 30) / c.salario);
    const avosFerias = Math.round((P["0026"] * 12) / c.salario);
    const mediaBruta = Math.round((P["0026"] * 12) / avosFerias) - c.salario;
    const medias = mediaBruta > avosFerias ? mediaBruta : 0; // abaixo disso é resto de arredondamento
    const variaveisEmValor = {};
    for (const [cod, chave] of Object.entries(VARIAVEIS_LEGADO)) {
      const valor = P[cod] ?? D[cod];
      if (valor) variaveisEmValor[chave] = (variaveisEmValor[chave] ?? 0) + valor;
    }
    const inss = D["0520"] ?? 0;
    const res = calcularRescisao({
      colaborador: { matricula: c.caso, nome: c.caso, vinculo: "TEMPORARIO", salario: c.salario, admissao: "2020-08-01", dependentesIR: c.dependentesIR },
      desligamento: "2020-12-15",
      motivo: "06",
      diasSaldo,
      medias,
      avos: { ferias: avosFerias, decimoTerceiro: P["0700"] ? Math.round((P["0700"] * 12) / c.salario) : 0 },
      variaveisEmValor,
      primeiraParcela13: D["0032"] ?? 0,
      lancamentos: {
        adiantamento: D["0515"] ?? 0,
        // Regime de caixa: a base de IRRF do relatório inclui outros rendimentos pagos no mês.
        outrosRendimentosIRNoMes: c.bases["003"] - (c.bases["001"] - inss - c.dependentesIR * 18_959),
      },
    }, { ...LEGADO, tabela });
    const valor = (codigo) => res.itens.find((i) => i.codigo === codigo)?.valor ?? 0;
    assert.equal(valor("6000.01"), P["0037"], `${c.caso} saldo`);
    assert.equal(valor("6006.01"), P["0026"], `${c.caso} férias proporcionais`);
    assert.equal(valor("6006.02"), P["0027"], `${c.caso} 1/3 de férias`);
    assert.equal(valor("6002.01"), P["0700"] ?? 0, `${c.caso} 13º`);
    assert.equal(valor("9201.01"), inss, `${c.caso} INSS`);
    assert.equal(valor("9201.02"), D["0525"] ?? 0, `${c.caso} INSS 13º`);
    assert.equal(valor("9203.01"), D["0530"] ?? 0, `${c.caso} IRRF`);
    // No sistema anterior o líquido da rescisão sai como desconto "0000" (pago pelo termo).
    assert.equal(res.liquido, D["0000"], `${c.caso} líquido`);
  }
});
