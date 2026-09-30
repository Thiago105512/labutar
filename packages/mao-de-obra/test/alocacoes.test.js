import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SEM_ALOCACAO,
  TIPO_ALOCACAO,
  TIPO_CONTRATO_TOMADOR,
  TIPO_VINCULO,
  alocacaoNoDia,
  centroDeCusto,
  partesDoCentroDeCusto,
  planoDeDesmobilizacao,
  validarAlocacao,
} from "../src/index.js";

const contratoServicos = { id: "CTR_S", tomadorId: "TOM_A", tomadorCnpj: "11222333000181", tipo: TIPO_CONTRATO_TOMADOR.PRESTACAO_SERVICOS, inicio: "2026-01-01" };
const contratoTemporario = { id: "CTR_T", tomadorId: "TOM_A", tomadorCnpj: "11222333000181", tipo: TIPO_CONTRATO_TOMADOR.TRABALHO_TEMPORARIO, inicio: "2026-01-01", fim: "2026-12-31" };
const postoServicos = { id: "POS_1", contratoId: "CTR_S", tomadorId: "TOM_A", funcao: "Auxiliar de limpeza" };
const postoTemporario = { id: "POS_2", contratoId: "CTR_T", tomadorId: "TOM_A", funcao: "Auxiliar de logística" };
const setor = { id: "RH", nome: "Recursos Humanos" };

const terceirizado = { id: "V1", pessoaId: "P1", tipo: TIPO_VINCULO.TERCEIRIZADO, admissao: "2026-01-10" };
const temporario = { id: "V2", pessoaId: "P2", tipo: TIPO_VINCULO.TEMPORARIO, admissao: "2026-02-01", tomadorCnpj: "11222333000181" };
const proprio = { id: "V3", pessoaId: "P3", tipo: TIPO_VINCULO.PROPRIO, admissao: "2025-03-01" };

const principal = (extra) => ({ id: "A_NOVA", tipo: TIPO_ALOCACAO.PRINCIPAL, inicio: "2026-02-01", ...extra });

test("terceirizado vai para posto de contrato de prestação de serviços", () => {
  const ok = validarAlocacao(principal({ vinculoId: "V1", postoId: "POS_1" }), { vinculo: terceirizado, posto: postoServicos, contrato: contratoServicos });
  assert.equal(ok.ok, true, ok.erros.join("; "));

  const dataRuim = validarAlocacao(principal({ vinculoId: "V1", postoId: "POS_1", inicio: "2026-02-30" }), { vinculo: terceirizado, posto: postoServicos, contrato: contratoServicos });
  assert.deepEqual(dataRuim.erros, ["inicio inválido"]);

  const errado = validarAlocacao(principal({ vinculoId: "V1", postoId: "POS_2" }), { vinculo: terceirizado, posto: postoTemporario, contrato: contratoTemporario });
  assert.match(errado.erros.join(" "), /prestação de serviços/);
});

test("temporário só entra em contrato de trabalho temporário da mesma tomadora", () => {
  const ok = validarAlocacao(principal({ vinculoId: "V2", postoId: "POS_2" }), { vinculo: temporario, posto: postoTemporario, contrato: contratoTemporario });
  assert.equal(ok.ok, true, ok.erros.join("; "));

  const emServicos = validarAlocacao(principal({ vinculoId: "V2", postoId: "POS_1" }), { vinculo: temporario, posto: postoServicos, contrato: contratoServicos });
  assert.match(emServicos.erros.join(" "), /trabalho temporário/);

  const outraTomadora = { ...contratoTemporario, id: "CTR_T2", tomadorCnpj: "44555666000181" };
  const r = validarAlocacao(principal({ vinculoId: "V2", postoId: "POS_9" }), {
    vinculo: temporario, posto: { ...postoTemporario, id: "POS_9", contratoId: "CTR_T2" }, contrato: outraTomadora,
  });
  assert.match(r.erros.join(" "), /novo contrato temporário/);
});

test("próprio é lotado em setor, nunca em posto", () => {
  assert.equal(validarAlocacao(principal({ vinculoId: "V3", setorId: "RH" }), { vinculo: proprio, setor }).ok, true);
  const r = validarAlocacao(principal({ vinculoId: "V3", postoId: "POS_1" }), { vinculo: proprio, posto: postoServicos, contrato: contratoServicos });
  assert.match(r.erros.join(" "), /setor interno/);
});

test("alocação respeita a vigência do vínculo e do contrato", () => {
  const antes = validarAlocacao(principal({ vinculoId: "V1", postoId: "POS_1", inicio: "2026-01-05" }), { vinculo: terceirizado, posto: postoServicos, contrato: contratoServicos });
  assert.match(antes.erros.join(" "), /antes da admissão/);

  const depois = validarAlocacao(principal({ vinculoId: "V2", postoId: "POS_2", fim: "2027-01-31" }), { vinculo: temporario, posto: postoTemporario, contrato: contratoTemporario });
  assert.match(depois.erros.join(" "), /vigência do contrato/);
  const inicioFora = validarAlocacao(principal({ vinculoId: "V2", postoId: "POS_2", inicio: "2027-01-02" }), { vinculo: temporario, posto: postoTemporario, contrato: contratoTemporario });
  assert.match(inicioFora.erros.join(" "), /vigência do contrato/);

  const desligado = { ...terceirizado, desligamento: "2026-03-31" };
  const r = validarAlocacao(principal({ vinculoId: "V1", postoId: "POS_1", fim: "2026-04-30" }), { vinculo: desligado, posto: postoServicos, contrato: contratoServicos });
  assert.match(r.erros.join(" "), /termina depois do desligamento/);
  const aberta = validarAlocacao(principal({ vinculoId: "V1", postoId: "POS_1" }), { vinculo: desligado, posto: postoServicos, contrato: contratoServicos });
  assert.equal(aberta.ok, true, "alocação sem fim fica limitada pelo desligamento");
  const tarde = validarAlocacao(principal({ vinculoId: "V1", postoId: "POS_1", inicio: "2026-04-01" }), { vinculo: desligado, posto: postoServicos, contrato: contratoServicos });
  assert.match(tarde.erros.join(" "), /começa depois do desligamento/);
});

test("não pode haver duas alocações principais no mesmo dia", () => {
  const existente = { id: "A1", vinculoId: "V1", tipo: TIPO_ALOCACAO.PRINCIPAL, postoId: "POS_1", inicio: "2026-01-10" };
  const r = validarAlocacao(principal({ vinculoId: "V1", postoId: "POS_1", inicio: "2026-03-01" }), {
    vinculo: terceirizado, posto: postoServicos, contrato: contratoServicos, alocacoesDoVinculo: [existente],
  });
  assert.match(r.erros.join(" "), /já existe alocação principal/);

  const encerrada = { ...existente, fim: "2026-02-28" };
  const ok = validarAlocacao(principal({ vinculoId: "V1", postoId: "POS_1", inicio: "2026-03-01" }), {
    vinculo: terceirizado, posto: postoServicos, contrato: contratoServicos, alocacoesDoVinculo: [encerrada],
  });
  assert.equal(ok.ok, true, ok.erros.join("; "));
});

test("cobertura prevalece sobre a principal no dia em que ocorre", () => {
  const alocacoes = [
    { id: "A1", vinculoId: "V1", tipo: TIPO_ALOCACAO.PRINCIPAL, postoId: "POS_1", inicio: "2026-01-10" },
    { id: "A2", vinculoId: "V1", tipo: TIPO_ALOCACAO.COBERTURA, postoId: "POS_7", inicio: "2026-03-10", fim: "2026-03-11" },
  ];
  assert.equal(alocacaoNoDia(alocacoes, "V1", "2026-03-09").id, "A1");
  assert.equal(alocacaoNoDia(alocacoes, "V1", "2026-03-10").id, "A2");
  assert.equal(alocacaoNoDia(alocacoes, "V1", "2026-03-12").id, "A1");
  assert.equal(alocacaoNoDia(alocacoes, "V1", "2026-01-01"), null);
});

test("centro de custo tem hierarquia tomador/contrato/posto ou setor", () => {
  const postos = { POS_1: postoServicos };
  const cc = centroDeCusto({ postoId: "POS_1" }, postos);
  assert.equal(cc, "TOM:TOM_A/CTR:CTR_S/POS:POS_1");
  assert.deepEqual(partesDoCentroDeCusto(cc), { tipo: "POSTO", tomadorId: "TOM_A", contratoId: "CTR_S", postoId: "POS_1" });
  assert.equal(centroDeCusto({ setorId: "RH" }), "SET:RH");
  assert.deepEqual(partesDoCentroDeCusto("SET:RH"), { tipo: "SETOR", setorId: "RH" });
  assert.equal(centroDeCusto(null), SEM_ALOCACAO);
  assert.equal(centroDeCusto({ postoId: "INEXISTENTE" }, postos), SEM_ALOCACAO);
});

test("fim de contrato encerra temporários e pede decisão sobre terceirizados", () => {
  const vinculos = [terceirizado, temporario, proprio, { id: "V4", pessoaId: "P4", tipo: TIPO_VINCULO.TERCEIRIZADO }];
  const alocacoes = [
    { vinculoId: "V1", tipo: TIPO_ALOCACAO.PRINCIPAL, postoId: "POS_1", inicio: "2026-01-10" },
    { vinculoId: "V2", tipo: TIPO_ALOCACAO.PRINCIPAL, postoId: "POS_2", inicio: "2026-02-01" },
    { vinculoId: "V3", tipo: TIPO_ALOCACAO.PRINCIPAL, setorId: "RH", inicio: "2025-03-01" },
    { vinculoId: "V4", tipo: TIPO_ALOCACAO.PRINCIPAL, postoId: "POS_1", inicio: "2026-01-10", fim: "2026-05-31" },
  ];
  const plano = planoDeDesmobilizacao({
    contrato: { id: "CTR_S" }, dataFim: "2026-06-30", vinculos, alocacoes, postos: [postoServicos, postoTemporario],
  });
  assert.equal(plano.terceirizados, 1, "V4 já tinha saído do posto");
  assert.equal(plano.temporarios, 0);
  assert.equal(plano.afetados[0].acao, "REALOCAR_OU_DESLIGAR");

  const planoTemp = planoDeDesmobilizacao({ contrato: { id: "CTR_T" }, dataFim: "2026-06-30", vinculos, alocacoes, postos: [postoServicos, postoTemporario] });
  assert.equal(planoTemp.afetados[0].acao, "ENCERRAR_CONTRATO_TEMPORARIO");
});
