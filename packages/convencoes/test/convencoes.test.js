import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CCT_AM000038_2026 as CCT, INSTRUMENTOS, validarInstrumento, instrumentoAplicavel, pisoDaFuncao, sugerirFuncoes,
  conferirSalario, reajusteNaDataBase, insalubridadeMinima, parametrosDaEscala, beneficiosDoMes,
  contribuicaoPatronal, obrigacoesNaRescisao, funcoesDoInstrumento,
} from "../src/index.js";

test("CCT AM000038/2026 cadastrada com os dados do Mediador", () => {
  assert.deepEqual(validarInstrumento(CCT).erros, []);
  assert.equal(CCT.vigencia.inicio, "2026-01-01");
  assert.equal(CCT.sindicatoLaboral.cnpj, "23006562000148");
  assert.equal(CCT.sindicatoPatronal.cnpj, "34501213000119");
  assert.equal(INSTRUMENTOS.length, 1);
  // 116 linhas na tabela de pisos (a primeira com as 20 funções do piso geral).
  assert.equal(CCT.pisos.length, 116);
  assert.equal(funcoesDoInstrumento(CCT).length, 144);
  assert.equal(new Set(funcoesDoInstrumento(CCT).map((f) => f.funcao)).size, funcoesDoInstrumento(CCT).length, "função repetida na tabela");
  // Encargos da cláusula 45ª: a soma dos grupos bate com o total de cada jornada.
  for (const [j, jornada] of CCT.encargosMinimos.jornadas.entries()) {
    const soma = CCT.encargosMinimos.grupos.reduce((s, g) => s + g.total[j], 0);
    assert.ok(Math.abs(soma - CCT.encargosMinimos.total[jornada]) < 0.011, `${jornada}: ${soma}`);
    for (const g of CCT.encargosMinimos.grupos) {
      const itens = g.itens.reduce((s, i) => s + i[j + 1], 0);
      assert.ok(Math.abs(itens - g.total[j]) < 0.011, `grupo ${g.grupo} ${jornada}: ${itens} ≠ ${g.total[j]}`);
    }
  }
});

test("piso pela função, sem acento e sem parênteses; fora da tabela vale o piso geral", () => {
  assert.equal(pisoDaFuncao(CCT, "Agente de Limpeza").valor, 165525);
  assert.equal(pisoDaFuncao(CCT, "agente de limpeza banheirista").valor, 165525);
  assert.equal(pisoDaFuncao(CCT, "Auxiliar de Produção de Linha de Montagem Terceirizado").valor, 231879);
  assert.equal(pisoDaFuncao(CCT, "Tecnico em Eletronica").valor, 331884);
  assert.equal(pisoDaFuncao(CCT, "Supervisor Operacional").valor, 323260);
  assert.equal(pisoDaFuncao(CCT, "Pintor").valor, 296979);
  assert.equal(pisoDaFuncao(CCT, "Copeira").valor, 165525);
  const porteiro = pisoDaFuncao(CCT, "Porteiro");
  assert.deepEqual([porteiro.valor, porteiro.enquadrada], [165525, false]);
  assert.equal(sugerirFuncoes(CCT, "Auxiliar de produção")[0].funcao, "Auxiliar de Produção Terceirizado");
});

test("salário abaixo do piso é erro; tempo parcial só com o piso integral", () => {
  assert.equal(conferirSalario(CCT, { funcao: "Auxiliar Administrativo", salario: 182169 }).ok, true);
  const baixo = conferirSalario(CCT, { funcao: "Auxiliar Administrativo", salario: 180000 });
  assert.match(baixo.erros[0], /abaixo do piso de Auxiliar Administrativo .*1821,69/);
  assert.equal(conferirSalario(CCT, { funcao: "Recepcionista", salario: 100000, jornadaMensal: 120 }).piso.minimo, 184779);
  assert.match(conferirSalario(CCT, { funcao: "Porteiro", salario: 185000 }).avisos[0], /fora da tabela/);
});

test("reajuste na data-base: 6,79% ou o piso, o que for maior", () => {
  assert.deepEqual(
    [reajusteNaDataBase(CCT, { funcao: "Porteiro", salario: 150000 }).novoSalario, reajusteNaDataBase(CCT, { funcao: "Porteiro", salario: 300000 }).novoSalario],
    [165525, 320370]
  );
});

test("insalubridade mínima, escala 12x36 e vale-transporte", () => {
  assert.equal(insalubridadeMinima(CCT, { funcao: "Agente de Limpeza Banheirista" }), 40);
  assert.equal(insalubridadeMinima(CCT, { funcao: "Agente de Limpeza", hospital: true }), 20);
  assert.equal(insalubridadeMinima(CCT, { funcao: "Agente de Limpeza" }), 0);
  assert.deepEqual(parametrosDaEscala(CCT, "12X36"), { divisor: 192, descontoVT: 3 });
  assert.deepEqual(parametrosDaEscala(CCT, "5X2"), { divisor: null, descontoVT: 6 });
});

test("benefícios do mês: VR, cesta, custos da empresa e contribuições", () => {
  const base = { competencia: "2026-09", salarioBase: 200000, diasTrabalhados: 22, admissao: "2025-01-10", descontoVRPercentual: 10 };
  const b = beneficiosDoMes(CCT, { ...base, faltasDias: 1, associado: true });
  const valor = (lista, chave) => lista.find((x) => x.chave === chave)?.valor;
  assert.equal(valor(b.beneficios, "VALE_REFEICAO"), 21 * 2450); // falta desconta o dia
  assert.equal(valor(b.descontos, "DESCONTO_VALE_REFEICAO"), Math.round(21 * 2450 * 0.1));
  assert.equal(valor(b.beneficios, "CESTA_BASICA"), 18000);
  assert.equal(valor(b.descontos, "MENSALIDADE_SINDICAL"), 4000); // 2% de 2.000,00
  assert.equal(valor(b.descontos, "CONTRIBUICAO_ASSISTENCIAL"), undefined); // só em fevereiro
  assert.equal(b.custos.filter((c) => ["PLANO_ODONTOLOGICO", "ASSISTENCIA_SOCIAL", "SEGURO_VIDA", "QUALIFICACAO"].includes(c.chave)).reduce((s, c) => s + c.valor, 0), 5100);

  const refeitorio = beneficiosDoMes(CCT, { ...base, refeitorio: true, salarioBase: 150000 });
  assert.equal(valor(refeitorio.beneficios, "VALE_REFEICAO"), undefined);
  assert.equal(valor(refeitorio.descontos, "MENSALIDADE_SINDICAL"), 3311); // mínimo
  assert.equal(valor(refeitorio.beneficios, "CESTA_BASICA"), undefined); // não associado

  const semCesta = beneficiosDoMes(CCT, { ...base, associado: true, faltasDias: 1, atestadoDias: 1 });
  assert.match(semCesta.avisos.join(), /faltas ou atestados/);
  const admitido = beneficiosDoMes(CCT, { ...base, associado: true, admissao: "2026-09-10" });
  assert.match(admitido.avisos.join(), /mês inteiro/);

  const fevereiro = beneficiosDoMes(CCT, { ...base, competencia: "2026-02" });
  assert.equal(valor(fevereiro.descontos, "CONTRIBUICAO_ASSISTENCIAL"), 4000);
  const oposicao = beneficiosDoMes(CCT, { ...base, competencia: "2026-02", oposicaoContribuicao: true });
  assert.equal(oposicao.descontos.length, 1); // só o VR
});

test("contribuição patronal por faixa e obrigações na rescisão", () => {
  assert.equal(contribuicaoPatronal(CCT, 3), 15000);
  assert.equal(contribuicaoPatronal(CCT, 150), 85000);
  assert.equal(contribuicaoPatronal(CCT, 1000), 125000);
  const o = obrigacoesNaRescisao(CCT, { admissao: "2024-05-01", desligamento: "2026-09-30", motivo: "33" });
  assert.equal(o.prazoPagamentoDias, 10);
  assert.match(o.itens.join(" "), /Homologação no SEEACEAM/);
  assert.match(o.itens.join(" "), /PPP/);
  assert.match(o.itens.join(" "), /Sucessão de contrato/);
  assert.doesNotMatch(obrigacoesNaRescisao(CCT, { admissao: "2026-03-01", desligamento: "2026-09-30", motivo: "06" }).itens.join(" "), /Homologação/);
});

test("acordo coletivo prevalece sobre a convenção (art. 620), só em vigência e no alcance", () => {
  const act = { ...CCT, id: "ACT-X", tipo: "ACT", registroMTE: "AM000999/2026", abrangencia: { tomadorCnpj: "04567891000113" }, pisos: [], pisoGeral: 190000 };
  const lista = [CCT, act];
  const noTomador = instrumentoAplicavel(lista, { data: "2026-09-30", tomadorCnpj: "04567891000113" });
  assert.equal(noTomador.principal.id, "ACT-X");
  assert.equal(noTomador.convencao.id, CCT.id);
  assert.equal(instrumentoAplicavel(lista, { data: "2026-09-30", tomadorCnpj: "07891234000115" }).principal.id, CCT.id);
  assert.equal(instrumentoAplicavel(lista, { data: "2027-01-05" }).principal, null);
  assert.deepEqual(validarInstrumento({ ...act, abrangencia: {} }).erros, ["acordo coletivo precisa da empresa ou do tomador que abrange"]);
});
