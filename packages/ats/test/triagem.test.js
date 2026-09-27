import test from "node:test";
import assert from "node:assert/strict";

import {
  avaliarCompetencias,
  avaliarExperiencia,
  avaliarFormacao,
  avaliarIdiomas,
  avaliarLocalizacao,
  verificarPretensaoSalarial,
  avaliarKnockout,
  triagemAutomatica,
  chaveCompetencia,
} from "../src/triagem.js";
import { DECISAO_TRIAGEM, MODELO_TRABALHO, NIVEL_FORMACAO, TIPO_KNOCKOUT } from "../src/constantes.js";

const REFERENCIA = "2026-09-27";

const VAGA = {
  titulo: "Pessoa Desenvolvedora Sênior",
  competencias: [
    { nome: "JavaScript", peso: 3, obrigatoria: true, nivelMinimo: 4 },
    { nome: "Node.js", peso: 2, obrigatoria: true, nivelMinimo: 3 },
    { nome: "SQL", peso: 1, nivelMinimo: 2 },
  ],
  formacaoMinima: NIVEL_FORMACAO.SUPERIOR,
  idiomas: [{ codigo: "EN", nivel: "AVANCADO", peso: 1 }],
  local: { modelo: MODELO_TRABALHO.PRESENCIAL, cidade: "São Paulo", uf: "SP" },
  salario: { max: 1_500_000 },
  regrasTriagem: { experienciaAnosMinimos: 5 },
  knockout: [
    { id: "k1", pergunta: "Disponibilidade para início imediato?", tipo: TIPO_KNOCKOUT.SIM_NAO, eliminatoria: true },
    { id: "k2", pergunta: "Anos de experiência com JavaScript", tipo: TIPO_KNOCKOUT.NUMERICA, min: 3, eliminatoria: true },
  ],
};

const CANDIDATO_FORTE = {
  competencias: [
    { nome: "javascript", nivel: 5 },
    { nome: "Node.js", nivel: 4 },
    { nome: "SQL", nivel: 3 },
  ],
  experiencias: [{ empresa: "ACME", cargo: "Sênior", inicio: "2020-01-01", fim: "2026-01-01", competencias: ["JavaScript"] }],
  formacao: [{ nivel: "SUPERIOR", concluido: true }],
  idiomas: [{ codigo: "EN", nivel: "FLUENTE" }],
  contato: { cidade: "São Paulo", uf: "SP" },
  pretensaoSalarial: 1_200_000,
};

const RESPOSTAS_OK = [
  { perguntaId: "k1", valor: "SIM" },
  { perguntaId: "k2", valor: 6 },
];

test("chaveCompetencia ignora caixa e acento", () => {
  assert.equal(chaveCompetencia("  Node.JS  "), "node.js");
  assert.equal(chaveCompetencia("Construção Civil"), "construcao civil");
});

test("avaliarCompetencias pondera por peso e nível", () => {
  const resultado = avaliarCompetencias(VAGA.competencias, CANDIDATO_FORTE.competencias);
  assert.equal(resultado.score, 100);
  assert.equal(resultado.maximo, 6);
  assert.deepEqual(resultado.faltantesObrigatorias, []);
});

test("avaliarCompetencias penaliza nível abaixo do exigido", () => {
  const resultado = avaliarCompetencias(
    [{ nome: "JavaScript", peso: 1, obrigatoria: true, nivelMinimo: 4 }],
    [{ nome: "JavaScript", nivel: 2 }]
  );
  assert.equal(resultado.score, 50);
  assert.deepEqual(resultado.faltantesObrigatorias, ["JavaScript"]);
});

test("avaliarCompetencias presume que atende quando o nível não foi declarado", () => {
  const resultado = avaliarCompetencias(
    [{ nome: "JavaScript", peso: 1, nivelMinimo: 4 }],
    [{ nome: "JavaScript" }]
  );
  assert.equal(resultado.score, 100);
  assert.deepEqual(resultado.faltantesObrigatorias, []);
});

test("avaliarCompetencias sem requisitos devolve 100", () => {
  assert.equal(avaliarCompetencias([], []).score, 100);
});

test("avaliarExperiencia soma meses e converte em anos", () => {
  const resultado = avaliarExperiencia(
    { anosMinimos: 5, regra: "todas" },
    CANDIDATO_FORTE.experiencias,
    REFERENCIA
  );
  assert.equal(resultado.anos, 6);
  assert.equal(resultado.score, 100);
});

test("avaliarExperiencia considera experiência em curso até a data de referência", () => {
  const resultado = avaliarExperiencia(
    { anosMinimos: 2 },
    [{ inicio: "2024-09-27", atual: true }],
    REFERENCIA
  );
  assert.equal(resultado.anos, 2);
  assert.equal(resultado.score, 100);
});

test("avaliarExperiencia com regra 'relacionadas' descarta experiência não tageada", () => {
  const experiencias = [
    { inicio: "2020-01-01", fim: "2023-01-01", competencias: ["JavaScript"] },
    { inicio: "2023-01-01", fim: "2026-01-01", competencias: ["Vendas"] },
  ];
  const relacionadas = avaliarExperiencia(
    { anosMinimos: 6, regra: "relacionadas", competenciasRequeridas: ["JavaScript"] },
    experiencias,
    REFERENCIA
  );
  assert.equal(relacionadas.anos, 3);
  assert.equal(relacionadas.score, 50);

  const todas = avaliarExperiencia({ anosMinimos: 6, regra: "todas" }, experiencias, REFERENCIA);
  assert.equal(todas.anos, 6);
});

test("avaliarExperiencia sem exigência de anos devolve 100", () => {
  assert.equal(avaliarExperiencia({}, []).score, 100);
});

test("avaliarFormacao: curso em andamento vale um degrau abaixo", () => {
  assert.equal(avaliarFormacao(NIVEL_FORMACAO.SUPERIOR, [{ nivel: "SUPERIOR", concluido: true }]).score, 100);
  assert.equal(avaliarFormacao(NIVEL_FORMACAO.SUPERIOR, [{ nivel: "SUPERIOR", concluido: false }]).score, 75);
  assert.equal(avaliarFormacao(NIVEL_FORMACAO.SUPERIOR, [{ nivel: "MEDIO" }]).score, 50);
  assert.equal(avaliarFormacao(NIVEL_FORMACAO.SUPERIOR, []).score, 0);
  assert.equal(avaliarFormacao(0, []).score, 100);
});

test("avaliarFormacao pega o maior nível da lista", () => {
  const resultado = avaliarFormacao(NIVEL_FORMACAO.SUPERIOR, [
    { nivel: "MEDIO", concluido: true },
    { nivel: "MESTRADO", concluido: true },
  ]);
  assert.equal(resultado.score, 100);
  assert.equal(resultado.nivelCandidato, NIVEL_FORMACAO.MESTRADO);
});

test("avaliarIdiomas compara níveis e aponta faltantes obrigatórios", () => {
  const ok = avaliarIdiomas([{ codigo: "EN", nivel: "AVANCADO" }], [{ codigo: "EN", nivel: "FLUENTE" }]);
  assert.equal(ok.score, 100);
  assert.deepEqual(ok.faltantes, []);

  const insuficiente = avaliarIdiomas(
    [{ codigo: "EN", nivel: "FLUENTE" }],
    [{ codigo: "EN", nivel: "BASICO" }]
  );
  assert.equal(insuficiente.score, 25);
  assert.deepEqual(insuficiente.faltantes, ["EN"]);

  assert.equal(avaliarIdiomas([], []).score, 100);
});

test("avaliarLocalizacao pontua por modelo de trabalho e distância", () => {
  assert.equal(avaliarLocalizacao({ local: { modelo: MODELO_TRABALHO.REMOTO } }, {}).score, 100);
  assert.equal(avaliarLocalizacao({ local: null }, {}).score, 100);
  assert.equal(avaliarLocalizacao(VAGA, CANDIDATO_FORTE).score, 100);
  assert.equal(avaliarLocalizacao(VAGA, { contato: { cidade: "Campinas", uf: "SP" } }).score, 80);
  assert.equal(avaliarLocalizacao(VAGA, { contato: { cidade: "Curitiba", uf: "PR" } }).score, 10);
  assert.equal(avaliarLocalizacao(VAGA, { contato: {} }).score, 50);

  const hibrida = { local: { modelo: MODELO_TRABALHO.HIBRIDO, cidade: "São Paulo", uf: "SP" } };
  assert.equal(avaliarLocalizacao(hibrida, { contato: { cidade: "Santos", uf: "SP" } }).score, 85);
  assert.equal(avaliarLocalizacao(hibrida, { contato: { cidade: "Rio de Janeiro", uf: "RJ" } }).score, 30);
});

test("verificarPretensaoSalarial só bloqueia quando há teto e pretensão", () => {
  assert.equal(verificarPretensaoSalarial(VAGA, CANDIDATO_FORTE).compativel, true);
  assert.equal(verificarPretensaoSalarial(VAGA, { pretensaoSalarial: 2_000_000 }).compativel, false);
  assert.equal(verificarPretensaoSalarial(VAGA, { pretensaoSalarial: 2_000_000 }).excedente, 500_000);
  assert.equal(verificarPretensaoSalarial({}, CANDIDATO_FORTE).compativel, true);
  assert.equal(verificarPretensaoSalarial(VAGA, {}).compativel, true);
});

test("avaliarKnockout trata ausência de resposta como pendência, não como reprovação", () => {
  const resultado = avaliarKnockout(VAGA.knockout, []);
  assert.equal(resultado.reprovado, false);
  assert.deepEqual(resultado.pendentes, ["k1", "k2"]);
  assert.equal(resultado.respostas[0].atende, null);
});

test("avaliarKnockout reprova em eliminatória não atendida", () => {
  const resultado = avaliarKnockout(VAGA.knockout, [
    { perguntaId: "k1", valor: "NAO" },
    { perguntaId: "k2", valor: 6 },
  ]);
  assert.equal(resultado.reprovado, true);
  assert.equal(resultado.respostas[0].eliminatoriaFalhou, true);
  assert.equal(resultado.respostas[1].eliminatoriaFalhou, false);
});

test("avaliarKnockout cobre todos os tipos de pergunta", () => {
  const perguntas = [
    { id: "a", tipo: TIPO_KNOCKOUT.SIM_NAO, eliminatoria: false },
    { id: "b", tipo: TIPO_KNOCKOUT.MULTIPLA, opcoesAceitas: ["SP", "RJ"] },
    { id: "c", tipo: TIPO_KNOCKOUT.NUMERICA, min: 18, max: 70 },
    { id: "d", tipo: TIPO_KNOCKOUT.TEXTO, minChars: 5 },
    { id: "e", tipo: TIPO_KNOCKOUT.DATA, de: "2020-01-01" },
    { id: "f", tipo: "DESCONHECIDO" },
  ];
  const respostas = [
    { perguntaId: "a", valor: true },
    { perguntaId: "b", valor: "sp" },
    { perguntaId: "c", valor: 30 },
    { perguntaId: "d", valor: "resposta longa" },
    { perguntaId: "e", valor: "2026-01-01" },
    { perguntaId: "f", valor: "x" },
  ];
  const resultado = avaliarKnockout(perguntas, respostas);
  const atende = Object.fromEntries(resultado.respostas.map((r) => [r.perguntaId, r.atende]));
  assert.deepEqual(atende, { a: true, b: true, c: true, d: true, e: true, f: false });
  assert.match(resultado.respostas[5].motivo, /desconhecido/);
});

test("triagemAutomatica aprova candidato forte automaticamente", () => {
  const resultado = triagemAutomatica({
    vaga: VAGA,
    candidato: CANDIDATO_FORTE,
    respostas: RESPOSTAS_OK,
    agora: REFERENCIA,
  });

  assert.equal(resultado.decisao, DECISAO_TRIAGEM.APROVADO_AUTOMATICO);
  assert.equal(resultado.aprovado, true);
  assert.equal(resultado.score.total, 100);
  assert.equal(resultado.score.destaque, true);
  assert.deepEqual(resultado.bloqueios, []);
});

test("triagemAutomatica reprova por pergunta eliminatória mesmo com score alto", () => {
  const resultado = triagemAutomatica({
    vaga: VAGA,
    candidato: CANDIDATO_FORTE,
    respostas: [
      { perguntaId: "k1", valor: "NAO" },
      { perguntaId: "k2", valor: 6 },
    ],
    agora: REFERENCIA,
  });

  assert.equal(resultado.decisao, DECISAO_TRIAGEM.REPROVADO_KNOCKOUT);
  assert.equal(resultado.aprovado, false);
  assert.equal(resultado.score.total, 100);
});

test("triagemAutomatica manda para análise manual quando falta resposta", () => {
  const resultado = triagemAutomatica({ vaga: VAGA, candidato: CANDIDATO_FORTE, agora: REFERENCIA });
  assert.equal(resultado.decisao, DECISAO_TRIAGEM.ANALISE_MANUAL);
  assert.match(resultado.motivo, /sem resposta/);
});

test("triagemAutomatica não reprova sozinha por padrão", () => {
  const fraco = { competencias: [{ nome: "Cobol", nivel: 5 }], contato: { cidade: "Manaus", uf: "AM" } };
  const resultado = triagemAutomatica({ vaga: VAGA, candidato: fraco, respostas: RESPOSTAS_OK, agora: REFERENCIA });

  assert.equal(resultado.decisao, DECISAO_TRIAGEM.ANALISE_MANUAL);
  assert.ok(resultado.score.total < 60);
  assert.ok(resultado.bloqueios.some((b) => /obrigatórias/.test(b)));
  assert.ok(resultado.bloqueios.some((b) => /corte mínimo/.test(b)));
});

test("triagemAutomatica reprova sozinha quando reprovacaoAutomatica está ligada", () => {
  const vaga = { ...VAGA, regrasTriagem: { experienciaAnosMinimos: 5, reprovacaoAutomatica: true } };
  const fraco = { competencias: [], contato: { cidade: "Manaus", uf: "AM" } };
  const resultado = triagemAutomatica({ vaga, candidato: fraco, respostas: RESPOSTAS_OK, agora: REFERENCIA });

  assert.equal(resultado.decisao, DECISAO_TRIAGEM.REPROVADO_AUTOMATICO);
});

test("triagemAutomatica exige a vaga", () => {
  assert.throws(() => triagemAutomatica({ candidato: CANDIDATO_FORTE }), /exige a vaga/);
});

test("triagemAutomatica aceita vaga mínima sem quebrar", () => {
  const resultado = triagemAutomatica({ vaga: { titulo: "Estágio" }, agora: REFERENCIA });
  assert.equal(resultado.score.total, 100);
  assert.equal(resultado.decisao, DECISAO_TRIAGEM.APROVADO_AUTOMATICO);
});
