import test from "node:test";
import assert from "node:assert/strict";
import { lerAFD, linhaMarcacao671, apurarDia, apurarMes, aplicarBancoDeHoras, lancamentosDoPonto, previstoNoDia } from "../src/index.js";

const CPF = "52998224725";
const BANCO_CCT = { exigeAdesaoEscrita: true, horasPagasNoMes: 20, adicionalPago: 50, prazoDias: 90, adicionalSaldo: 50 };

test("AFD: leiaute da Portaria 671 (tipo 3 e 7) e o anterior (PIS)", () => {
  const afd = [
    `000000000${"1"}1${"11222333000181"}${" ".repeat(14)}${"EMPRESA FICTICIA".padEnd(150)}`,
    linhaMarcacao671({ nsr: 2, data: "2026-09-01", hora: "07:58", cpf: CPF }),
    `000000003${"7"}2026-09-01T12:01:00-0400${"0" + CPF}2026-09-01T12:01:05-0400011${"a".repeat(64)}`,
    "000000004301092026130012345678901",
    "0000000059lixo",
    "sem nsr",
  ].join("\r\n");
  const r = lerAFD(afd);
  assert.equal(r.formato, "671");
  assert.equal(r.empregador.documento, "11222333000181");
  assert.deepEqual(r.marcacoes.map((m) => [m.data, m.hora, m.cpf ?? m.pis]), [["2026-09-01", "07:58", CPF], ["2026-09-01", "12:01", CPF], ["2026-09-01", "13:00", "12345678901"]]);
  assert.equal(r.erros.length, 1);
});

test("dia: tolerância, extra, atraso, intervalo suprimido, noturno e falta", () => {
  const base = { data: "2026-09-01", previsto: 528 };
  assert.equal(apurarDia({ ...base, horas: ["08:05", "12:00", "13:00", "17:50"] }).extra, 0); // 8h45: dentro de 10 min
  const extra = apurarDia({ ...base, horas: ["08:00", "12:00", "13:00", "19:00"] });
  assert.equal(extra.extra, 600 - 528);
  const atraso = apurarDia({ ...base, horas: ["09:00", "12:00", "13:00", "17:48"] });
  assert.equal(atraso.debito, 60);
  const semIntervalo = apurarDia({ ...base, horas: ["08:00", "16:48"] });
  assert.equal(semIntervalo.intervaloSuprimido, 60);
  const curto = apurarDia({ ...base, horas: ["08:00", "12:00", "12:30", "17:18"] });
  assert.equal(curto.intervaloSuprimido, 30);
  assert.equal(apurarDia({ ...base }).falta, true);
  assert.equal(apurarDia({ ...base, abonado: true }).falta, false);
  assert.deepEqual(apurarDia({ ...base, horas: ["08:00", "12:00", "13:00"] }).inconsistencias.length, 1);
  const noite = apurarDia({ data: "2026-09-01", previsto: 720, horas: ["19:00"], horasDoDiaSeguinte: ["07:00"] });
  assert.equal(noite.trabalhado, 720);
  assert.equal(noite.noturno, 420); // 22h às 5h
  assert.equal(apurarDia({ data: "2026-09-06", previsto: 0, descanso: true, horas: ["08:00", "12:00"] }).extra100, 240);
});

test("mês: escala, feriado, DSR perdido, 12x36 noturno e férias fora do contrato", () => {
  const marcacoes = [];
  for (let d = 1; d <= 30; d++) {
    const data = `2026-09-${String(d).padStart(2, "0")}`;
    if (previstoNoDia("44H_SEG_SEX", data, { feriados: new Set(["2026-09-07"]) }) === 0) continue;
    if (data === "2026-09-15") continue; // falta
    for (const hora of ["08:00", "12:00", "13:00", data === "2026-09-10" ? "18:48" : "17:48"]) marcacoes.push({ data, hora });
  }
  const m = apurarMes({ competencia: "2026-09", escala: "44H_SEG_SEX", marcacoes, feriados: new Set(["2026-09-07"]) });
  assert.equal(m.totais.faltasDias, 1);
  assert.equal(m.totais.dsrPerdidos, 1);
  assert.equal(m.totais.extras, 60);
  assert.equal(m.dias.find((x) => x.data === "2026-09-07").previsto, 0);

  const plantoes = [];
  for (const d of ["01", "03", "05"]) plantoes.push({ data: `2026-09-${d}`, hora: "19:00" }, { data: `2026-09-${String(Number(d) + 1).padStart(2, "0")}`, hora: "07:00" });
  const n = apurarMes({ competencia: "2026-09", escala: "12X36_NOTURNO", marcacoes: plantoes, inicio12x36: "2026-09-01", foraDoContrato: new Set(["2026-09-07"]) }, { noturnoReduzido: false });
  assert.equal(n.dias[0].trabalhado, 720);
  assert.equal(n.dias[1].previsto, 0);
  assert.equal(n.dias[6].foraDoContrato, true);
  assert.equal(n.totais.noturnoHoras, 21); // 3 plantões × 7 h, sem hora reduzida (CCT)
  assert.ok(n.totais.faltasDias >= 1); // plantões sem marcação a partir do dia 9
});

test("banco de horas da CCT: 20 h pagas, excedente no banco, compensação e vencimento em 90 dias", () => {
  const sem = aplicarBancoDeHoras(BANCO_CCT, { adesao: false, extras: 1800, debito: 30, lotes: [], competencia: "2026-09", fimDoMes: "2026-09-30" });
  assert.deepEqual([sem.pagas50, sem.atrasos], [1800, 30]);
  const set = aplicarBancoDeHoras(BANCO_CCT, { adesao: true, extras: 1800, debito: 0, lotes: [], competencia: "2026-09", fimDoMes: "2026-09-30" });
  assert.equal(set.pagas50, 1200);
  assert.deepEqual(set.lotes, [{ competencia: "2026-09", minutos: 600, vence: "2026-12-29" }]);
  const out = aplicarBancoDeHoras(BANCO_CCT, { adesao: true, extras: 0, debito: 240, lotes: set.lotes, competencia: "2026-10", fimDoMes: "2026-10-31" });
  assert.equal(out.compensado, 240);
  assert.equal(out.saldo, 360);
  assert.equal(out.atrasos, 0);
  const dez = aplicarBancoDeHoras(BANCO_CCT, { adesao: true, extras: 0, debito: 0, lotes: out.lotes, competencia: "2026-12", fimDoMes: "2026-12-31" });
  assert.equal(dez.vencido, 360);
  assert.equal(dez.pagas50, 360);
  assert.equal(dez.saldo, 0);
  const negativo = aplicarBancoDeHoras(BANCO_CCT, { adesao: true, extras: 0, debito: 90, lotes: [], competencia: "2026-09", fimDoMes: "2026-09-30" });
  assert.equal(negativo.saldo, -90);

  const l = lancamentosDoPonto({ totais: { extras100: 240, noturnoHoras: 3.5, faltasDias: 1, dsrPerdidos: 1, intervaloSuprimido: 30 } }, set);
  assert.deepEqual(l, { horasExtras50: 20, horasExtras100: 4, horasNoturnas: 3.5, faltasDias: 1, dsrPerdidos: 1, intervaloSuprimidoHoras: 0.5 });
});
