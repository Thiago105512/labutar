import test from "node:test";
import assert from "node:assert/strict";

import {
  somarDias,
  somarMeses,
  somarAnos,
  diferencaDias,
  mesesEntre,
  periodoEntre,
  idadeEmAnos,
  anosCompletosEntre,
  diasUteisEntre,
  proximoDiaUtil,
  diaUtilAnterior,
  ehDiaUtil,
  avisoPrevioProporcional,
  estaVencendo,
  competenciaDe,
  formatarDataBR,
  paraData,
  paraISO,
} from "../src/datas.js";

test("somarDias atravessa fim de mês e virada de ano", () => {
  assert.equal(somarDias("2026-01-31", 1), "2026-02-01");
  assert.equal(somarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(somarDias("2026-03-01", -1), "2026-02-28");
  assert.equal(somarDias("2024-03-01", -1), "2024-02-29");
});

test("somarMeses fixa no último dia quando o mês alvo é mais curto", () => {
  assert.equal(somarMeses("2026-01-31", 1), "2026-02-28");
  assert.equal(somarMeses("2024-01-31", 1), "2024-02-29");
  assert.equal(somarMeses("2026-01-31", 2), "2026-03-31");
  assert.equal(somarMeses("2026-03-15", 12), "2027-03-15");
});

test("somarAnos respeita ano bissexto", () => {
  assert.equal(somarAnos("2024-02-29", 1), "2025-02-28");
  assert.equal(somarAnos("2024-02-29", 4), "2028-02-29");
});

test("diferencaDias e mesesEntre", () => {
  assert.equal(diferencaDias("2026-09-01", "2026-09-27"), 26);
  assert.equal(diferencaDias("2026-09-27", "2026-09-01"), -26);
  assert.equal(mesesEntre("2026-01-15", "2026-09-14"), 7);
  assert.equal(mesesEntre("2026-01-15", "2026-09-15"), 8);
  assert.equal(mesesEntre("2026-09-15", "2026-01-15"), 0);
});

test("periodoEntre devolve anos, meses e dias normalizados", () => {
  assert.deepEqual(periodoEntre("2020-03-10", "2026-09-27"), {
    anos: 6,
    meses: 6,
    dias: 17,
    negativo: false,
  });
  assert.deepEqual(periodoEntre("2026-03-15", "2026-05-01"), {
    anos: 0,
    meses: 1,
    dias: 16,
    negativo: false,
  });
  assert.equal(periodoEntre("2026-09-27", "2026-09-01").negativo, true);
});

test("idadeEmAnos e anosCompletosEntre", () => {
  assert.equal(idadeEmAnos("1990-10-01", "2026-09-27"), 35);
  assert.equal(idadeEmAnos("1990-10-01", "2026-10-01"), 36);
  assert.equal(anosCompletosEntre("2020-01-01", "2026-09-27"), 6);
});

test("dias úteis ignoram fim de semana e feriados", () => {
  // 2026-09-27 é domingo
  assert.equal(ehDiaUtil("2026-09-27"), false);
  assert.equal(ehDiaUtil("2026-09-28"), true);
  assert.equal(proximoDiaUtil("2026-09-25"), "2026-09-25");
  assert.equal(proximoDiaUtil("2026-09-26"), "2026-09-28");
  assert.equal(diaUtilAnterior("2026-09-27"), "2026-09-25");

  const feriados = ["2026-09-07", "2026-10-12"];
  assert.equal(ehDiaUtil("2026-09-07", feriados), false);
  assert.equal(proximoDiaUtil("2026-09-07", feriados), "2026-09-08");
  assert.equal(diasUteisEntre("2026-09-01", "2026-09-07", feriados), 3);
  assert.equal(diasUteisEntre("2026-09-01", "2026-09-01"), 0);
});

test("aviso prévio proporcional — Lei 12.506/2011", () => {
  assert.deepEqual(avisoPrevioProporcional("2026-01-10", "2026-09-27"), {
    anosCompletos: 0,
    diasAdicionais: 0,
    diasTotais: 30,
  });

  assert.deepEqual(avisoPrevioProporcional("2021-09-27", "2026-09-27"), {
    anosCompletos: 5,
    diasAdicionais: 15,
    diasTotais: 45,
  });

  // teto legal: 60 dias adicionais
  assert.deepEqual(avisoPrevioProporcional("1990-01-01", "2026-09-27"), {
    anosCompletos: 36,
    diasAdicionais: 60,
    diasTotais: 90,
  });
});

test("estaVencendo classifica urgência e vencimento", () => {
  const referencia = "2026-09-27";

  assert.deepEqual(estaVencendo("2026-10-20", 30, referencia), {
    vencendo: true,
    vencido: false,
    diasRestantes: 23,
    urgencia: "BAIXA",
  });
  assert.equal(estaVencendo("2026-10-03", 30, referencia).urgencia, "ALTA");
  assert.equal(estaVencendo("2026-10-10", 30, referencia).urgencia, "MEDIA");
  assert.equal(estaVencendo("2026-09-01", 30, referencia).urgencia, "VENCIDO");
  assert.equal(estaVencendo("2026-09-01", 30, referencia).vencido, true);
  assert.equal(estaVencendo("2027-09-27", 30, referencia).vencendo, false);
});

test("competenciaDe e formatarDataBR", () => {
  assert.equal(competenciaDe("2026-09-27"), "2026-09");
  assert.equal(formatarDataBR("2026-09-27"), "27/09/2026");
});

test("paraData e paraISO são simétricas e imunes ao fuso local", () => {
  assert.equal(paraISO(paraData("2026-09-27")), "2026-09-27");
  assert.equal(paraData("2026-09-27").getUTCDay(), 0);
});

import { FUSO_PADRAO, dataNoFuso, deslocamentoDoFuso, hoje as hojeNoFuso } from "../src/datas.js";

test("fuso padrão é o de Manaus", () => {
  assert.equal(FUSO_PADRAO, "America/Manaus");
  assert.equal(deslocamentoDoFuso(), "-04:00");
  assert.equal(deslocamentoDoFuso("America/Sao_Paulo", new Date("2026-09-30T12:00:00Z")), "-03:00");
});

test("dataNoFuso dá o dia civil de Manaus, não o de UTC", () => {
  // 21h de 29/09 em Manaus já é 30/09 em UTC.
  assert.equal(dataNoFuso("2026-09-30T01:00:00.000Z"), "2026-09-29");
  assert.equal(dataNoFuso("2026-09-30T04:00:00.000Z"), "2026-09-30");
  assert.equal(dataNoFuso(new Date("2026-09-30T01:00:00Z"), "America/Sao_Paulo"), "2026-09-29");
  assert.equal(dataNoFuso("2026-09-30T02:59:00Z", "America/Sao_Paulo"), "2026-09-29");
  assert.equal(dataNoFuso("2026-09-30T03:00:00Z", "America/Sao_Paulo"), "2026-09-30");
});

test("dataNoFuso mantém data civil e não inventa data a partir de outro formato", () => {
  assert.equal(dataNoFuso("2026-09-30"), "2026-09-30");
  assert.equal(dataNoFuso("01/10/2026"), "01/10/2026");
  assert.equal(dataNoFuso(null), null);
  assert.equal(dataNoFuso(""), null);
  assert.equal(dataNoFuso("2026-99-99T00:00:00Z"), null);
});

test("hoje aceita nome de fuso e, por compatibilidade, deslocamento em minutos", () => {
  assert.match(hojeNoFuso(), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(hojeNoFuso("America/Sao_Paulo"), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(hojeNoFuso(-180), /^\d{4}-\d{2}-\d{2}$/);
});
