import test from "node:test";
import assert from "node:assert/strict";

import { extrairJson, interpretarMatching, interpretarParecer, interpretarAnuncio } from "../src/respostas.js";
import { desidentificarCandidato } from "../src/desidentificacao.js";

const TEXTO_CANDIDATO = [
  "CANDIDATO",
  "COMPETÊNCIAS",
  "- ESD (nível 4)",
  "- Leitura de componentes eletrônicos (nível 4)",
  "EXPERIÊNCIA",
  "- Operador de SMT · EMPRESA_1 · 2022-03-01 → atual",
].join("\n");

const CRITERIOS = [
  { id: "comp-esd", descricao: "Demonstrar ESD", peso: 20, obrigatorio: true },
  { id: "experiencia", descricao: "Tempo de experiência", peso: 25 },
];

const respostaValida = JSON.stringify({
  componentes: [
    { id: "comp-esd", nota: 4, evidencia: "ESD (nível 4)", justificativa: "nível declarado" },
    { id: "experiencia", nota: 3, evidencia: "Operador de SMT", justificativa: "atuação atual" },
  ],
  informacoesAusentes: [],
  ressalvas: [],
});

// ============================================================
// extrairJson
// ============================================================

test("extrairJson aceita objeto nu", () => {
  const r = extrairJson('{"a":1}');
  assert.equal(r.ok, true);
  assert.deepEqual(r.valor, { a: 1 });
});

test("extrairJson aceita cerca de código com e sem linguagem", () => {
  assert.equal(extrairJson('```json\n{"a":1}\n```').ok, true);
  assert.equal(extrairJson('```\n{"a":1}\n```').ok, true);
  assert.deepEqual(extrairJson('```json\n{"a":1}\n```').valor, { a: 1 });
});

test("extrairJson aceita prosa antes e depois", () => {
  const r = extrairJson('Claro! Segue a análise:\n{"a":1}\nEspero ter ajudado.');
  assert.equal(r.ok, true);
  assert.deepEqual(r.valor, { a: 1 });
});

test("extrairJson aceita vírgula final", () => {
  const r = extrairJson('{"a":1,"b":2,}');
  assert.equal(r.ok, true);
  assert.deepEqual(r.valor, { a: 1, b: 2 });
});

test("extrairJson nunca lança: truncado, vazio, array e lixo voltam ok:false", () => {
  for (const entrada of ['{"a":1', "", "   ", "não sei responder", "[]", '"texto"', "42"]) {
    const r = extrairJson(entrada);
    assert.equal(r.ok, false, `deveria falhar: ${JSON.stringify(entrada)}`);
    assert.equal(typeof r.motivo, "string");
    assert.ok(r.motivo.length > 3);
  }
});

test("extrairJson aproveita o objeto quando há lixo depois dele", () => {
  // "{}{" tem um objeto válido no início: extrair é melhor do que descartar
  const r = extrairJson("{}{");
  assert.equal(r.ok, true);
  assert.deepEqual(r.valor, {});
});

test("extrairJson explica por que falhou", () => {
  assert.match(extrairJson("[]").motivo, /array/);
  assert.match(extrairJson('{"a":1').motivo, /mal formado|truncado/);
  assert.match(extrairJson("resposta vazia nenhuma").motivo, /não contém objeto/);
  assert.match(extrairJson("").motivo, /vazia/);
});

// ============================================================
// interpretarMatching
// ============================================================

test("interpretarMatching recalcula o score a partir das notas, não confia no número do modelo", () => {
  // (20 * 4/5 * 100 + 25 * 3/5 * 100) / 45 = 68,89
  const r = interpretarMatching(respostaValida, { criterios: CRITERIOS, textoCandidato: TEXTO_CANDIDATO });
  assert.equal(r.ok, true);
  assert.equal(r.score, 68.89);
  assert.equal(r.componentes.length, 2);
  assert.ok(r.componentes.every((c) => c.evidenciaVerificada));
});

test("score global enviado pelo modelo é registrado e comparado, nunca adotado", () => {
  const comScore = JSON.parse(respostaValida);
  comScore.score = 99;
  const r = interpretarMatching(JSON.stringify(comScore), { criterios: CRITERIOS, textoCandidato: TEXTO_CANDIDATO });
  assert.equal(r.scoreInformadoPeloModelo, 99);
  assert.equal(r.score, 68.89);
  assert.equal(r.divergenciaScoreModelo, 30.11);
});

test("evidência que não está no texto do candidato marca o componente como não verificado", () => {
  const fabricada = JSON.parse(respostaValida);
  fabricada.componentes[0].evidencia = "certificação internacional avançada em ESD pela NASA";
  const r = interpretarMatching(JSON.stringify(fabricada), { criterios: CRITERIOS, textoCandidato: TEXTO_CANDIDATO });
  assert.equal(r.ok, false);
  assert.equal(r.componentes[0].naoVerificado, true);
  assert.equal(r.componentes[0].evidenciaVerificada, false);
  assert.match(r.motivo, /não está no texto do candidato/);
});

test("conferência de evidência ignora acento, caixa e espaço extra", () => {
  const r = interpretarMatching(
    JSON.stringify({ componentes: [{ id: "comp-esd", nota: 4, evidencia: "esd   (NIVEL 4)" }, { id: "experiencia", nota: 3, evidencia: "Operador de SMT" }] }),
    { criterios: CRITERIOS, textoCandidato: TEXTO_CANDIDATO }
  );
  assert.equal(r.componentes[0].evidenciaVerificada, true);
});

test("resposta incompleta não produz score aproveitável", () => {
  const parcial = JSON.stringify({ componentes: [{ id: "comp-esd", nota: 4, evidencia: "ESD (nível 4)" }] });
  const r = interpretarMatching(parcial, { criterios: CRITERIOS, textoCandidato: TEXTO_CANDIDATO });
  assert.equal(r.ok, false);
  assert.deepEqual(r.faltantes, ["experiencia"]);
  assert.match(r.motivo, /critérios sem resposta/);
  // ainda devolve o score parcial para leitura humana, mas nunca como ok
  assert.equal(typeof r.score, "number");
});

test("lixo do modelo devolve ok:false e score null — nunca um número inventado", () => {
  for (const entrada of ["não sei", "", '{"componentes":"não é array"}', "[]"]) {
    const r = interpretarMatching(entrada, { criterios: CRITERIOS, textoCandidato: TEXTO_CANDIDATO });
    assert.equal(r.ok, false, `deveria falhar: ${JSON.stringify(entrada)}`);
    assert.equal(r.score, null);
    assert.deepEqual(r.componentes, []);
  }
});

test("nota fora de 0 a 5 invalida o componente", () => {
  const r = interpretarMatching(
    JSON.stringify({ componentes: [{ id: "comp-esd", nota: 9, evidencia: "ESD" }, { id: "experiencia", nota: 3, evidencia: "Operador de SMT" }] }),
    { criterios: CRITERIOS, textoCandidato: TEXTO_CANDIDATO }
  );
  assert.equal(r.ok, false);
  assert.match(r.motivo, /nota inválida/);
});

test("componente que não pertence à rubrica é recusado", () => {
  const r = interpretarMatching(
    JSON.stringify({ componentes: [{ id: "criterio-inventado", nota: 5, evidencia: "ESD" }, { id: "comp-esd", nota: 4, evidencia: "ESD" }, { id: "experiencia", nota: 3, evidencia: "Operador" }] }),
    { criterios: CRITERIOS, textoCandidato: TEXTO_CANDIDATO }
  );
  assert.equal(r.ok, false);
  assert.match(r.motivo, /não pertence à rubrica/);
});

test("componente duplicado é recusado", () => {
  const r = interpretarMatching(
    JSON.stringify({ componentes: [
      { id: "comp-esd", nota: 4, evidencia: "ESD" },
      { id: "comp-esd", nota: 5, evidencia: "ESD" },
      { id: "experiencia", nota: 3, evidencia: "Operador" },
    ] }),
    { criterios: CRITERIOS, textoCandidato: TEXTO_CANDIDATO }
  );
  assert.equal(r.ok, false);
  assert.match(r.motivo, /duplicado/);
});

test("rubrica vazia é recusada em vez de devolver score sem base", () => {
  const r = interpretarMatching(respostaValida, { criterios: [], textoCandidato: TEXTO_CANDIDATO });
  assert.equal(r.ok, false);
  assert.equal(r.score, null);
  assert.match(r.motivo, /rubrica vazia/);
});

test("informações ausentes e ressalvas do modelo são propagadas", () => {
  const comRessalvas = JSON.parse(respostaValida);
  comRessalvas.informacoesAusentes = ["formacao"];
  comRessalvas.ressalvas = ["texto menciona idade; ignorada conforme instrução"];
  const r = interpretarMatching(JSON.stringify(comRessalvas), { criterios: CRITERIOS, textoCandidato: TEXTO_CANDIDATO });
  assert.ok(r.ressalvas.some((x) => /formacao/.test(x)));
  assert.ok(r.ressalvas.some((x) => /idade/.test(x)));
});

test("evidências são listadas para auditoria com o resultado da conferência", () => {
  const r = interpretarMatching(respostaValida, { criterios: CRITERIOS, textoCandidato: TEXTO_CANDIDATO });
  assert.equal(r.evidencias.length, 2);
  assert.deepEqual(r.evidencias[0], { id: "comp-esd", trecho: "ESD (nível 4)", verificada: true });
});

test("evidência muito longa é truncada, não rejeitada", () => {
  const longa = "ESD (nível 4) " + "x".repeat(600);
  const r = interpretarMatching(
    JSON.stringify({ componentes: [{ id: "comp-esd", nota: 4, evidencia: longa }, { id: "experiencia", nota: 3, evidencia: "Operador" }] }),
    { criterios: CRITERIOS, textoCandidato: TEXTO_CANDIDATO + " " + longa }
  );
  assert.ok(r.componentes[0].evidencia.length <= 240);
});

// ============================================================
// interpretarParecer
// ============================================================

const PARECER_OK = JSON.stringify({
  resumo: "Perfil com aderência sólida em ESD e experiência atual em linha SMT.",
  pontosFortes: ["ESD nível 4 (declarado em competências)"],
  lacunas: ["formação não informada"],
  perguntasParaEntrevista: ["Descreva uma falha de ESD que você identificou e como tratou."],
  ressalvas: ["formação ausente do texto"],
});

test("parecer válido é aceito e carrega o aviso de decisão humana", () => {
  const r = interpretarParecer(PARECER_OK);
  assert.equal(r.ok, true);
  assert.match(r.parecer.resumo, /aderência sólida/);
  assert.equal(r.parecer.perguntasParaEntrevista.length, 1);
  assert.match(r.aviso, /LGPD art\. 20/);
  assert.equal(r.ressalvas.length, 1);
});

test("parecer que elimina é recusado — IA apoia, não decide", () => {
  for (const verbo of ["reprovado", "eliminar", "descartar", "não contratar", "desqualificado", "rejeitar", "inapto"]) {
    const r = interpretarParecer(JSON.stringify({ resumo: `O candidato deve ser ${verbo}.`, pontosFortes: [], lacunas: [] }));
    assert.equal(r.ok, false, `"${verbo}" deveria ser recusado`);
    assert.match(r.motivo, /decisão eliminatória/);
    assert.equal(r.parecer, null);
    assert.ok(r.termosEncontrados.length >= 1);
  }
});

test("parecer sem resumo é recusado", () => {
  assert.equal(interpretarParecer(JSON.stringify({ pontosFortes: [] })).ok, false);
  assert.equal(interpretarParecer("não é json").ok, false);
});

// ============================================================
// interpretarAnuncio
// ============================================================

test("anúncio gerado exige auditoria do ATS antes de publicar", () => {
  const r = interpretarAnuncio(JSON.stringify({ titulo: "Pessoa Operadora de Produção", resumo: "x", descricao: "y", responsabilidades: ["a"], requisitos: ["b"], beneficios: ["c"] }));
  assert.equal(r.ok, true);
  assert.equal(r.anuncio.titulo, "Pessoa Operadora de Produção");
  assert.equal(r.exigeAuditoria, true, "pedir ao modelo para não discriminar reduz incidência, não substitui auditarAnuncio()");
});

test("anúncio sem título é recusado", () => {
  assert.equal(interpretarAnuncio(JSON.stringify({ resumo: "x" })).ok, false);
  assert.equal(interpretarAnuncio("lixo").ok, false);
});

// ============================================================
// Integração com a desidentificação
// ============================================================

test("o texto desidentificado real serve de base para a conferência de evidência", () => {
  const candidato = {
    dados: { nome: "Maria Fernanda Costa", cpf: "11144477735" },
    contato: { email: "maria@exemplo.com", cidade: "Manaus", uf: "AM" },
    competencias: [{ nome: "NR-10", nivel: 5 }, { nome: "SMT", nivel: 4 }],
    experiencias: [{ empresa: "Flextronics", cargo: "Técnica de processo", inicio: "2021-06-01", atual: true }],
    curriculoTexto: "Oito anos em SMT, NR-10 renovada em 2025.",
  };
  const { texto } = desidentificarCandidato(candidato, { hoje: "2026-09-27" });

  const r = interpretarMatching(
    JSON.stringify({ componentes: [
      { id: "comp-nr-10", nota: 5, evidencia: "NR-10 (nível 5)" },
      { id: "comp-smt", nota: 4, evidencia: "SMT (nível 4)" },
    ] }),
    { criterios: [{ id: "comp-nr-10", peso: 30 }, { id: "comp-smt", peso: 30 }], textoCandidato: texto }
  );
  assert.equal(r.ok, true);
  assert.equal(r.score, 90);
  assert.doesNotMatch(texto, /Maria|Flextronics|11144477735/);
});
