import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HIPOTESE_TEMPORARIO,
  duracaoEmDias,
  mesmaTomadora,
  situacaoContratoTemporario,
  validarContratoTemporario,
  verificarRemuneracaoEquivalente,
} from "../src/index.js";

const TOMADORA = "11222333000181";
const FILIAL_DA_TOMADORA = "11222333000262";
const OUTRA = "44555666000199";

const proposta = (extra = {}) => ({
  tomadorCnpj: TOMADORA,
  inicio: "2026-01-01",
  fimPrevisto: "2026-03-31",
  hipotese: HIPOTESE_TEMPORARIO.DEMANDA_COMPLEMENTAR,
  justificativa: "Pico sazonal de pedidos de fim de ano no centro de distribuição",
  ...extra,
});

test("duração conta o primeiro e o último dia", () => {
  assert.equal(duracaoEmDias("2026-01-01", "2026-01-01"), 1);
  assert.equal(duracaoEmDias("2026-01-01", "2026-06-29"), 180);
});

test("mesma tomadora compara a raiz do CNPJ: filial conta para o limite", () => {
  assert.equal(mesmaTomadora(TOMADORA, FILIAL_DA_TOMADORA), true);
  assert.equal(mesmaTomadora("11.222.333/0001-81", TOMADORA), true);
  assert.equal(mesmaTomadora(TOMADORA, OUTRA), false);
  assert.equal(mesmaTomadora("", TOMADORA), false);
});

test("contrato de exatamente 180 dias é aceito e informa a data limite", () => {
  const r = validarContratoTemporario(proposta({ fimPrevisto: "2026-06-29" }));
  assert.equal(r.ok, true, r.erros.join("; "));
  assert.equal(r.diasProposta, 180);
  assert.equal(r.dataLimite, "2026-06-29");
});

test("181 dias sem prorrogação é recusado e sugere a prorrogação", () => {
  const r = validarContratoTemporario(proposta({ fimPrevisto: "2026-06-30" }));
  assert.equal(r.ok, false);
  assert.match(r.erros.join(" "), /limite de 180 dias/);
  assert.match(r.erros.join(" "), /2026-06-29/);
  assert.match(r.erros.join(" "), /prorrogação justificada/);
});

test("prorrogação justificada leva o limite a 270 dias, e não além", () => {
  const prorrogacao = { dias: 90, justificativa: "Demanda sazonal mantida conforme relatório da tomadora" };
  assert.equal(validarContratoTemporario(proposta({ fimPrevisto: "2026-09-27", prorrogacao })).ok, true);
  const r = validarContratoTemporario(proposta({ fimPrevisto: "2026-09-28", prorrogacao }));
  assert.equal(r.ok, false);
  assert.match(r.erros.join(" "), /limite de 270 dias/);
});

test("prorrogação acima de 90 dias ou sem justificativa é recusada", () => {
  const longa = validarContratoTemporario(proposta({ prorrogacao: { dias: 120, justificativa: "Demanda sazonal mantida pela tomadora" } }));
  assert.match(longa.erros.join(" "), /limitada a 90 dias/);
  const vazia = validarContratoTemporario(proposta({ prorrogacao: { dias: 30, justificativa: "" } }));
  assert.match(vazia.erros.join(" "), /art\. 10, §2º/);
});

test("motivo justificador é obrigatório e greve é proibida", () => {
  const semHipotese = validarContratoTemporario(proposta({ hipotese: undefined, justificativa: "curta" }));
  assert.equal(semHipotese.ok, false);
  assert.match(semHipotese.erros.join(" "), /hipótese legal/);
  assert.match(semHipotese.erros.join(" "), /motivo justificador/);

  const greve = validarContratoTemporario(proposta({ substituiGrevista: true }));
  assert.match(greve.erros.join(" "), /greve/);
});

test("substituição transitória sem identificar o substituído gera aviso, não erro", () => {
  const r = validarContratoTemporario(proposta({ hipotese: HIPOTESE_TEMPORARIO.SUBSTITUICAO_TRANSITORIA }));
  assert.equal(r.ok, true);
  assert.match(r.avisos.join(" "), /quem é substituído/);
});

test("dias não consecutivos na mesma tomadora se somam", () => {
  const historico = [{ tomadorCnpj: TOMADORA, inicio: "2026-01-01", fim: "2026-04-10" }]; // 100 dias
  const r = validarContratoTemporario(
    proposta({ inicio: "2026-05-10", fimPrevisto: "2026-08-07" }), // 90 dias, 29 dias depois
    historico
  );
  assert.equal(r.diasJaCumpridos, 100);
  assert.equal(r.ok, false);
  assert.match(r.erros.join(" "), /100 já cumpridos \+ 90 propostos = 190/);
  assert.equal(r.dataLimite, "2026-07-28"); // 80 dias de saldo a partir de 10/05
});

test("contrato em filial da mesma tomadora entra na soma; outra tomadora não", () => {
  const historico = [
    { tomadorCnpj: FILIAL_DA_TOMADORA, inicio: "2026-01-01", fim: "2026-04-10" },
    { tomadorCnpj: OUTRA, inicio: "2026-04-11", fim: "2026-05-09" },
  ];
  const r = validarContratoTemporario(proposta({ inicio: "2026-05-10", fimPrevisto: "2026-06-10" }), historico);
  assert.equal(r.diasJaCumpridos, 100);
});

test("intervalo de 90 dias sem contrato reinicia a contagem", () => {
  const historico = [{ tomadorCnpj: TOMADORA, inicio: "2026-01-01", fim: "2026-03-31" }];
  const r = validarContratoTemporario(proposta({ inicio: "2026-06-30", fimPrevisto: "2026-12-26" }), historico);
  assert.equal(r.diasJaCumpridos, 0);
  assert.equal(r.ok, true, r.erros.join("; "));
});

test("quem cumpriu o prazo só volta à mesma tomadora depois da quarentena de 90 dias", () => {
  const historico = [{ tomadorCnpj: TOMADORA, inicio: "2026-01-01", fim: "2026-06-29" }]; // 180 dias
  const cedo = validarContratoTemporario(proposta({ inicio: "2026-08-01", fimPrevisto: "2026-09-30" }), historico);
  assert.equal(cedo.ok, false);
  assert.equal(cedo.quarentenaAte, "2026-09-27");
  assert.match(cedo.erros.join(" "), /a partir de 2026-09-28/);
  assert.match(cedo.erros.join(" "), /vínculo com a tomadora/);

  const depois = validarContratoTemporario(proposta({ inicio: "2026-09-28", fimPrevisto: "2026-10-31" }), historico);
  assert.equal(depois.ok, true, depois.erros.join("; "));

  const outraTomadora = validarContratoTemporario(proposta({ tomadorCnpj: OUTRA, inicio: "2026-07-01", fimPrevisto: "2026-08-01" }), historico);
  assert.equal(outraTomadora.ok, true);
});

test("sobreposição com outro contrato na mesma tomadora é recusada", () => {
  const historico = [{ tomadorCnpj: TOMADORA, inicio: "2026-02-01", fim: "2026-02-28" }];
  const r = validarContratoTemporario(proposta(), historico);
  assert.match(r.erros.join(" "), /sobrepõe/);
});

test("datas inválidas param a validação cedo", () => {
  assert.deepEqual(validarContratoTemporario(proposta({ inicio: "2026-02-30" })).erros, ["inicio inválido"]);
  assert.match(validarContratoTemporario(proposta({ fimPrevisto: "2025-12-01" })).erros[0], /anterior/);
});

test("situação do contrato em curso sinaliza vencimento", () => {
  const contrato = { tomadorCnpj: TOMADORA, inicio: "2026-01-01", fimPrevisto: "2026-06-29" };
  const vencendo = situacaoContratoTemporario(contrato, [], { referencia: "2026-06-10" });
  assert.equal(vencendo.diasRestantes, 19);
  assert.equal(vencendo.vencendo, true);
  assert.equal(vencendo.vencido, false);
  assert.equal(situacaoContratoTemporario(contrato, [], { referencia: "2026-07-01" }).vencido, true);
  assert.equal(situacaoContratoTemporario(contrato, [], { referencia: "2026-03-01" }).vencendo, false);
});

test("remuneração do temporário não pode ficar abaixo da praticada pela tomadora", () => {
  const tabelaTomadora = [
    { funcao: "Auxiliar de Logística", salarioHoraCentavos: 1000, vigenciaInicio: "2025-05-01", vigenciaFim: "2026-04-30" },
    { funcao: "Auxiliar de Logística", salarioHoraCentavos: 1100, vigenciaInicio: "2026-05-01" },
  ];
  const abaixo = verificarRemuneracaoEquivalente({ funcao: "auxiliar de logistica", salarioHoraCentavos: 1050, data: "2026-06-01", tabelaTomadora });
  assert.equal(abaixo.ok, false);
  assert.equal(abaixo.referencia.salarioHoraCentavos, 1100);
  assert.match(abaixo.erros[0], /art\. 12/);

  const antesDoReajuste = verificarRemuneracaoEquivalente({ funcao: "Auxiliar de Logística", salarioHoraCentavos: 1050, data: "2026-04-15", tabelaTomadora });
  assert.equal(antesDoReajuste.ok, true);

  const semTabela = verificarRemuneracaoEquivalente({ funcao: "Conferente", salarioHoraCentavos: 1200, data: "2026-06-01", tabelaTomadora });
  assert.equal(semTabela.ok, true);
  assert.match(semTabela.avisos[0], /cadastre a tabela/);

  const abaixoDoMinimo = verificarRemuneracaoEquivalente({ funcao: "Conferente", salarioHoraCentavos: 500, data: "2026-06-01", salarioMinimoHoraCentavos: 700 });
  assert.match(abaixoDoMinimo.erros.join(" "), /salário mínimo/);
});
