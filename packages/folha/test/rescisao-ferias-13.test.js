/**
 * 13º, férias e rescisão com tabelas de 2026. Valores conferidos à mão (centavos):
 * INSS de R$ 3.000,00 = 121,58 + 115,37 + 11,66 = 248,61.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avosDecimoTerceiro, avosFerias, periodosAquisitivos, diasNoMesComercial,
  calcularPrimeiraParcela, calcularDecimoTerceiro,
  diasDeFeriasPorFaltas, validarProgramacaoFerias, calcularFerias,
  calcularRescisao, MOTIVO_DESLIGAMENTO,
} from "../src/index.js";

const valor = (res, codigo) => res.itens.filter((i) => i.codigo === codigo).reduce((s, i) => s + i.valor, 0);
const PROPRIO = { matricula: "1-000001-7", nome: "Teste", vinculo: "PROPRIO", salario: 300_000, admissao: "2024-03-01", dependentesIR: 0 };

test("avos: 13º conta mês com 15 dias; férias contam fração maior que 14 dias", () => {
  assert.equal(avosDecimoTerceiro(2026, { admissao: "2026-03-10" }), 10); // 10 a 31/03 = 22 dias
  assert.equal(avosDecimoTerceiro(2026, { admissao: "2026-03-18" }), 9); // 14 dias em março
  assert.equal(avosDecimoTerceiro(2026, { admissao: "2020-01-01", fim: "2026-09-14" }), 8);
  assert.equal(avosDecimoTerceiro(2026, { admissao: "2020-01-01", fim: "2026-09-15" }), 9);
  assert.equal(avosFerias("2026-03-01", "2026-09-30"), 7);
  assert.equal(avosFerias("2026-03-01", "2026-10-14"), 7);
  assert.equal(avosFerias("2026-03-01", "2026-10-15"), 8);
  const p = periodosAquisitivos("2024-03-01", "2026-09-30");
  assert.deepEqual(p.map((x) => [x.inicio, x.fim, x.completo]), [
    ["2024-03-01", "2025-02-28", true], ["2025-03-01", "2026-02-28", true], ["2026-03-01", "2027-02-28", false],
  ]);
  assert.equal(p[1].fimConcessivo, "2027-02-28");
  assert.equal(diasNoMesComercial("2026-02-01", "2026-02-28"), 30);
  assert.equal(diasNoMesComercial("2026-10-01", "2026-10-31"), 30);
  assert.equal(diasNoMesComercial("2026-09-01", "2026-09-17"), 17);
});

test("13º: 1ª parcela sem impostos e 2ª com INSS e IRRF próprios", () => {
  const c = { ...PROPRIO, admissao: "2026-03-10" };
  const p1 = calcularPrimeiraParcela({ colaborador: c, ano: 2026 });
  assert.equal(p1.avos, 10);
  assert.equal(p1.valor, 125_000);
  assert.equal(p1.fgts, 10_000);
  assert.equal(p1.prazo, "2026-11-30");

  const d = calcularDecimoTerceiro({ colaborador: PROPRIO, ano: 2026, primeiraParcela: 150_000 });
  assert.equal(d.integral, 300_000);
  assert.equal(valor(d, "9201.02"), 24_861);
  assert.equal(valor(d, "9203.02"), 0); // desconto simplificado: base 2.392,80, isenta
  assert.equal(d.liquido, 300_000 - 24_861 - 150_000);
  assert.equal(d.fgts, 12_000); // 8% sobre o que falta pagar (a 1ª parcela já teve FGTS)

  // Acima da isenção: R$ 8.000,00 → INSS no teto (988,09) e IRRF sem redução (> 7.350,00).
  const alto = calcularDecimoTerceiro({ colaborador: { ...PROPRIO, salario: 800_000 }, ano: 2026 });
  const inss = valor(alto, "9201.02");
  const base = 800_000 - inss;
  assert.equal(valor(alto, "9203.02"), Math.round(base * 0.275 - 90_873));
});

test("férias: dias pelas faltas, fracionamento, início e prazos", () => {
  assert.deepEqual([0, 5, 6, 14, 15, 23, 24, 32, 33].map(diasDeFeriasPorFaltas), [30, 30, 24, 24, 18, 18, 12, 12, 0]);
  const periodo = { inicio: "2025-03-01", fim: "2026-02-28", fimConcessivo: "2027-02-28" };
  const ok = validarProgramacaoFerias({ periodo, parcelas: [{ inicio: "2026-10-05", dias: 20 }], abonoDias: 10, hoje: "2026-09-01", local: { uf: "AM", municipio: "Manaus" } });
  assert.deepEqual(ok.erros, []);
  assert.equal(ok.parcelas[0].fim, "2026-10-24");
  assert.equal(ok.parcelas[0].prazoPagamento, "2026-10-03");

  const sexta = validarProgramacaoFerias({ periodo, parcelas: [{ inicio: "2026-10-09", dias: 30 }] });
  assert.match(sexta.erros.join(), /2 dias antes de feriado ou repouso/);
  const fracionada = validarProgramacaoFerias({ periodo, parcelas: [{ inicio: "2026-10-05", dias: 13 }, { inicio: "2026-11-03", dias: 13 }, { inicio: "2026-12-01", dias: 4 }] });
  assert.match(fracionada.erros.join(), /14 dias ou mais/);
  assert.match(fracionada.erros.join(), /menos de 5 dias/);
  const muitoAbono = validarProgramacaoFerias({ periodo, parcelas: [{ inicio: "2026-10-05", dias: 15 }], abonoDias: 15 });
  assert.match(muitoAbono.erros.join(), /abono pecuniário de até 10 dias/);
  const atrasada = validarProgramacaoFerias({ periodo, parcelas: [{ inicio: "2027-02-15", dias: 30 }] });
  assert.equal(atrasada.parcelas[0].diasEmDobro, 16);
});

test("recibo de férias: 30 dias de R$ 3.000,00 e 20 dias com abono", () => {
  const f = calcularFerias({ colaborador: PROPRIO, inicio: "2026-10-05", dias: 30 });
  assert.equal(valor(f, "1016.01"), 300_000);
  assert.equal(valor(f, "1017.01"), 100_000);
  assert.equal(valor(f, "9201.01"), 12_158 + 11_537 + 13_166);
  assert.equal(valor(f, "9203.03"), 0); // 114,76 pela tabela, zerado pela redução da Lei 15.270/2025
  assert.equal(f.detalhe.irrf.impostoTabela, 11_476);
  assert.equal(f.liquido, 400_000 - 36_861);
  assert.equal(f.fgts, 32_000);
  assert.deepEqual(f.porCompetencia, [{ competencia: "2026-10", dias: 27, valor: 360_000 }, { competencia: "2026-11", dias: 3, valor: 40_000 }]);

  const a = calcularFerias({ colaborador: PROPRIO, inicio: "2026-10-05", dias: 20, abonoDias: 10 });
  assert.equal(valor(a, "1016.01"), 200_000);
  assert.equal(valor(a, "1017.01"), 66_667);
  assert.equal(valor(a, "1020.01"), 100_000);
  assert.equal(valor(a, "1020.02"), 33_333);
  assert.equal(a.bases.fgts, 266_667); // abono fora do FGTS
});

test("rescisão sem justa causa com aviso indenizado de 36 dias", () => {
  const r = calcularRescisao({
    colaborador: PROPRIO, desligamento: "2026-09-30", motivo: "02", avisoIndenizado: true,
    periodosGozados: ["2024-03-01"], saldoFGTS: 500_000,
  });
  assert.deepEqual(r.aviso, { dias: 36, indenizado: true, fimProjetado: "2026-11-05" });
  const esperado = {
    "6000.01": 300_000, "6003.01": 360_000, "6002.01": 225_000, "6001.01": 25_000,
    "6007.01": 300_000, "6007.02": 100_000, "6006.01": 175_000, "6006.02": 58_333, "6006.03": 25_000, "6006.04": 8_333,
    "9201.01": 24_861, "9201.02": 12_158 + 7_911, "9203.01": 0, "9203.02": 0,
  };
  for (const [codigo, v] of Object.entries(esperado)) assert.equal(valor(r, codigo), v, codigo);
  assert.equal(r.proventos, 1_576_666);
  assert.equal(r.liquido, 1_576_666 - 24_861 - 20_069);
  assert.equal(r.bases.fgts, 910_000); // saldo + aviso + 13º (férias indenizadas fora)
  assert.equal(r.fgts.mes, 72_800);
  assert.equal(r.fgts.multa, Math.round((500_000 + 72_800) * 0.4));
  assert.equal(r.prazoPagamento, "2026-10-10");
  assert.deepEqual(r.esocial, { evento: "S-2299", mtvDeslig: "02", dtDeslig: "2026-09-30", dtProjFimAPI: "2026-11-05" });
});

test("rescisão: regras por motivo", () => {
  const base = { colaborador: PROPRIO, desligamento: "2026-09-30", periodosGozados: ["2024-03-01"] };
  const justa = calcularRescisao({ ...base, motivo: "01" });
  assert.equal(valor(justa, "6002.01"), 0);
  assert.equal(valor(justa, "6006.01"), 0);
  assert.equal(valor(justa, "6007.01"), 300_000); // vencidas continuam devidas
  assert.equal(justa.fgts.multaPercentual, 0);

  const pedido = calcularRescisao({ ...base, motivo: "07", avisoNaoCumprido: true });
  assert.equal(valor(pedido, "9213.01"), 300_000);
  assert.equal(valor(pedido, "6006.01"), 175_000); // Súmula 261 do TST

  const acordo = calcularRescisao({ ...base, motivo: "33", avisoIndenizado: true });
  assert.equal(valor(acordo, "6003.01"), 180_000); // metade de 36 dias
  assert.equal(acordo.fgts.multaPercentual, 20);
  assert.equal(acordo.fgts.saque, 80);

  const reciproca = calcularRescisao({ ...base, motivo: "05", avisoIndenizado: true });
  assert.equal(valor(reciproca, "6002.01"), 112_500); // metade de 9/12

  const termo = { ...PROPRIO, fimPrevisto: "2026-12-29" };
  const antecipada = calcularRescisao({ ...base, colaborador: termo, motivo: "03" });
  assert.equal(valor(antecipada, "6104.01"), 450_000); // metade de 90 dias de R$ 100,00
  const temp = calcularRescisao({ ...base, colaborador: { ...termo, vinculo: "TEMPORARIO" }, motivo: "03" });
  assert.equal(valor(temp, "6104.01"), 0);
  assert.match(temp.avisos.join(), /Decreto 10\.854\/2021, art\. 64, II/);

  assert.throws(() => calcularRescisao({ ...base, motivo: "99" }), /Tabela 19/);
  assert.ok(Object.keys(MOTIVO_DESLIGAMENTO).every((k) => /^\d{2}$/.test(k)));
});

test("rescisão: férias vencidas fora do concessivo são pagas em dobro", () => {
  const r = calcularRescisao({ colaborador: { ...PROPRIO, admissao: "2023-03-01" }, desligamento: "2026-09-30", motivo: "06", periodosGozados: ["2023-03-01"] });
  // Período 2024-03-01 a 2025-02-28: concessivo até 2026-02-28, já vencido.
  assert.equal(valor(r, "6007.01"), 600_000); // dois períodos vencidos
  assert.equal(valor(r, "6004.01"), 400_000);
  assert.match(r.avisos.join(), /pagas em dobro/);
});
