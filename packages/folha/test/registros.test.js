import test from "node:test";
import assert from "node:assert/strict";
import {
  calcularFerias, calcularHolerite, calcularRescisao, aplicarAcaoRegistro, ACAO_RESCISAO, NOME_STATUS_RESCISAO,
  custoDaRescisao, feriasNaCompetencia, diasUsadosNoPeriodo, feriasSobrepostas, montarTRCT,
} from "../src/index.js";

const colaborador = { matricula: "1", nome: "Pessoa Fictícia", vinculo: "PROPRIO", salario: 300_000, admissao: "2024-03-01", cpf: null };

test("férias em dois meses: dias, base e INSS retido repartidos sem perder centavo", () => {
  const recibo = calcularFerias({ colaborador, inicio: "2026-10-19", dias: 30 });
  const reg = { matricula: "1", status: "PROGRAMADA", periodo: { inicio: "2025-03-01" }, inicio: recibo.inicio, fim: recibo.fim, dias: 30, abonoDias: 0, recibo };
  const out = feriasNaCompetencia([reg], "2026-10")["1"];
  const nov = feriasNaCompetencia([reg], "2026-11")["1"];
  assert.equal(out.dias + nov.dias, 30);
  assert.equal(out.base + nov.base, recibo.itens.filter((i) => ["1016.01", "1017.01"].includes(i.codigo)).reduce((s, i) => s + i.valor, 0));
  assert.equal(out.inssRetido + nov.inssRetido, recibo.itens.find((i) => i.codigo === "9201.01").valor);
  assert.deepEqual(feriasNaCompetencia([{ ...reg, status: "CANCELADA" }], "2026-10"), {});
  assert.equal(diasUsadosNoPeriodo([reg], "1", "2025-03-01"), 30);
  assert.ok(feriasSobrepostas([reg], "1", "2026-11-10", "2026-11-20"));
  assert.equal(feriasSobrepostas([reg], "1", "2026-11-18", "2026-11-30"), null);

  // Holerite de outubro: salário dos dias fora das férias; INSS do mês inteiro menos o já retido.
  const h = calcularHolerite(colaborador, "2026-10", { ferias: out });
  assert.equal(h.itens.find((i) => i.codigo === "1000.01").valor, Math.round((300_000 * (30 - out.dias)) / 30));
  assert.equal(h.bases.inss, Math.round((300_000 * (30 - out.dias)) / 30) + out.base);
  assert.equal(h.itens.find((i) => i.codigo === "9201.01").valor, h.detalhe.inss.valor - out.inssRetido);
  assert.match(h.avisos.join(), /férias no mês/);
});

test("custo da rescisão: fora o que a provisão já reconheceu, mais FGTS e multa", () => {
  const res = calcularRescisao({ colaborador, desligamento: "2026-10-15", motivo: "02", avisoIndenizado: true, saldoFGTS: 500_000 });
  const custo = custoDaRescisao(res);
  assert.ok(!custo.partes.some((p) => ["6002.01", "6006.01", "6006.02"].includes(p.codigo)));
  assert.ok(custo.partes.some((p) => p.codigo === "6003.01"));
  assert.ok(custo.partes.some((p) => /Multa do FGTS \(40%\)/.test(p.nome) && p.valor === Math.round((500_000 + res.fgts.mes) * 0.4)));
  assert.equal(custo.total, custo.partes.reduce((s, p) => s + p.valor, 0));

  const trct = montarTRCT({ empresa: { razaoSocial: "Empresa Fictícia", cnpj: "00000000000191" }, pessoa: null, vinculo: { matricula: "1", tipo: "PROPRIO", admissao: "2024-03-01" }, rescisao: { resultado: res, prazoPagamento: res.prazoPagamento } });
  assert.equal(trct.contrato.causa.codigo, "02");
  assert.equal(trct.verbas.length + trct.deducoes.length, res.itens.length);
  assert.match(trct.quitacao, /25\/10\/2026/);
});

test("ações do registro: status de origem, motivo e histórico", () => {
  const atual = { status: "CALCULADA", historico: [] };
  assert.equal(aplicarAcaoRegistro(ACAO_RESCISAO, NOME_STATUS_RESCISAO, atual, { acao: "PAGAR", em: "x" }).ok, false);
  assert.match(aplicarAcaoRegistro(ACAO_RESCISAO, NOME_STATUS_RESCISAO, atual, { acao: "CANCELAR", motivo: "não", em: "x" }).erro, /motivo/);
  const ok = aplicarAcaoRegistro(ACAO_RESCISAO, NOME_STATUS_RESCISAO, atual, { acao: "APROVAR", usuario: "u1", em: "x" });
  assert.equal(ok.estado.status, "APROVADA");
  assert.deepEqual(ok.estado.historico[0], { acao: "APROVAR", de: "CALCULADA", para: "APROVADA", motivo: null, por: "u1", em: "x" });
});
