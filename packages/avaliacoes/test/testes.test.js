import test from "node:test";
import assert from "node:assert/strict";

import { TIPO_TESTE, avaliarComRubrica, corrigirTeste, criarRubrica, criarTeste, parsearNumero } from "../src/index.js";

function testeObjetivo(overrides = {}) {
  return criarTeste({
    titulo: "Raciocínio lógico e legislação",
    tipo: TIPO_TESTE.MULTIPLA_ESCOLHA,
    notaCorte: 70,
    tempoLimiteMinutos: 30,
    ...overrides,
    questoes: [
      { id: "q1", enunciado: "Quanto é 2 + 2?", tipo: TIPO_TESTE.NUMERICA, respostaEsperada: 4, pontos: 2 },
      {
        id: "q2",
        enunciado: "Qual dispositivo trata do aviso prévio proporcional?",
        alternativas: [
          { id: "a", texto: "Lei 12.506/2011" },
          { id: "b", texto: "Lei 8.213/1991" },
          { id: "c", texto: "Lei 5.172/1966" },
        ],
        correta: "a",
        pontos: 3,
      },
      { id: "q3", enunciado: "A CLT foi promulgada em 1943.", tipo: TIPO_TESTE.VERDADEIRO_FALSO, correta: true },
      {
        id: "q4",
        enunciado: "Quais são bases legais da LGPD aplicáveis ao processo seletivo?",
        alternativas: [
          { id: "a", texto: "Consentimento" },
          { id: "b", texto: "Execução de contrato" },
          { id: "c", texto: "Cor do crachá" },
          { id: "d", texto: "Cumprimento de obrigação legal" },
        ],
        corretas: ["b", "d"],
        pontos: 2,
      },
      {
        id: "q5",
        enunciado: "Valor do salário mínimo em milhares (com tolerância)",
        tipo: TIPO_TESTE.NUMERICA,
        respostaEsperada: 3.5,
        tolerancia: 0.1,
        pontos: 2,
      },
    ],
  });
}

function respostasCorretas() {
  return [
    { questaoId: "q1", valor: 4 },
    { questaoId: "q2", valor: "a" },
    { questaoId: "q3", valor: "V" },
    { questaoId: "q4", valor: ["b", "d"] },
    { questaoId: "q5", valor: "3,5" },
  ];
}

/** 6 pontos objetivos + 4 pontos de dissertativa = 10. */
function testeMisto() {
  return criarTeste({
    titulo: "Redação jurídica e conhecimento técnico",
    tipo: TIPO_TESTE.MULTIPLA_ESCOLHA,
    notaCorte: 70,
    questoes: [
      { id: "q1", enunciado: "Quanto é 2 + 2?", tipo: TIPO_TESTE.NUMERICA, respostaEsperada: 4, pontos: 3 },
      { id: "q2", enunciado: "A CLT é de 1943.", tipo: TIPO_TESTE.VERDADEIRO_FALSO, correta: true, pontos: 3 },
      {
        id: "q3",
        enunciado: "Explique a diferença entre justa causa e dispensa imotivada.",
        tipo: TIPO_TESTE.DISSERTATIVA,
        pontos: 4,
      },
    ],
  });
}

test("criarTeste monta o teste e calcula a nota máxima", () => {
  const teste = testeObjetivo();
  assert.equal(teste.tipo, "MULTIPLA_ESCOLHA");
  assert.equal(teste.totalQuestoes, 5);
  assert.equal(teste.notaMaxima, 10);
  assert.equal(teste.notaCorte, 70);
  assert.equal(teste.tempoLimiteMinutos, 30);
  assert.equal(teste.exigeRevisaoHumana, false);
  assert.ok(teste.id.startsWith("TST_"));
});

test("criarTeste aceita questão com tipo próprio em teste de outro tipo", () => {
  const teste = criarTeste({
    titulo: "Misto",
    tipo: TIPO_TESTE.MULTIPLA_ESCOLHA,
    questoes: [
      { id: "q1", enunciado: "2 + 2?", tipo: TIPO_TESTE.NUMERICA, respostaEsperada: 4 },
      { id: "q2", enunciado: "Discorra.", tipo: TIPO_TESTE.DISSERTATIVA },
    ],
  });
  assert.deepEqual(
    teste.questoes.map((q) => q.autoCorrigivel),
    [true, false]
  );
  assert.equal(teste.exigeRevisaoHumana, true);
});

test("criarTeste rejeita tipo inválido e título vazio", () => {
  assert.throws(() => criarTeste({ titulo: "X", tipo: "SUBJETIVO", questoes: [] }), /tipo de teste inválido/);
  assert.throws(() => criarTeste({ titulo: "  ", tipo: TIPO_TESTE.NUMERICA, questoes: [] }), /exige 'titulo'/);
  assert.throws(
    () => criarTeste({ titulo: "X", tipo: TIPO_TESTE.NUMERICA, questoes: [] }),
    /ao menos uma questão/
  );
});

test("criarTeste rejeita notaCorte fora de 0 a 100 e tempo inválido", () => {
  assert.throws(() => testeObjetivo({ notaCorte: 120 }), /percentual entre 0 e 100/);
  assert.throws(() => testeObjetivo({ notaCorte: -5 }), /percentual entre 0 e 100/);
  assert.throws(() => testeObjetivo({ tempoLimiteMinutos: 0 }), /maior que zero/);
});

test("criarTeste valida o gabarito da múltipla escolha", () => {
  assert.throws(
    () =>
      criarTeste({
        titulo: "X",
        tipo: TIPO_TESTE.MULTIPLA_ESCOLHA,
        questoes: [
          { id: "q1", enunciado: "?", alternativas: [{ id: "a", texto: "A" }, { id: "b", texto: "B" }] },
        ],
      }),
    /informe 'correta' ou 'corretas'/
  );
  assert.throws(
    () =>
      criarTeste({
        titulo: "X",
        tipo: TIPO_TESTE.MULTIPLA_ESCOLHA,
        questoes: [
          {
            id: "q1",
            enunciado: "?",
            alternativas: [{ id: "a", texto: "A" }, { id: "b", texto: "B" }],
            correta: "z",
          },
        ],
      }),
    /gabarito aponta alternativa inexistente/
  );
  assert.throws(
    () =>
      criarTeste({
        titulo: "X",
        tipo: TIPO_TESTE.MULTIPLA_ESCOLHA,
        questoes: [{ id: "q1", enunciado: "?", alternativas: [{ id: "a", texto: "A" }], correta: "a" }],
      }),
    /ao menos 2 alternativas/
  );
});

test("criarTeste valida verdadeiro/falso e numérica", () => {
  assert.throws(
    () => criarTeste({ titulo: "X", tipo: TIPO_TESTE.VERDADEIRO_FALSO, questoes: [{ id: "q1", enunciado: "?" }] }),
    /'correta' deve ser verdadeiro ou falso/
  );
  assert.throws(
    () => criarTeste({ titulo: "X", tipo: TIPO_TESTE.NUMERICA, questoes: [{ id: "q1", enunciado: "?" }] }),
    /'respostaEsperada' deve ser um número/
  );
});

test("criarTeste rejeita questão sem enunciado e id duplicado", () => {
  assert.throws(
    () => criarTeste({ titulo: "X", tipo: TIPO_TESTE.NUMERICA, questoes: [{ id: "q1", respostaEsperada: 1 }] }),
    /'enunciado' obrigatório/
  );
  assert.throws(
    () =>
      criarTeste({
        titulo: "X",
        tipo: TIPO_TESTE.NUMERICA,
        questoes: [
          { id: "q1", enunciado: "a", respostaEsperada: 1 },
          { id: "q1", enunciado: "b", respostaEsperada: 2 },
        ],
      }),
    /Id de questão duplicado: "q1"/
  );
});

test("criarTeste permite repetir id de alternativa entre questões", () => {
  const teste = criarTeste({
    titulo: "X",
    tipo: TIPO_TESTE.MULTIPLA_ESCOLHA,
    questoes: [
      { id: "q1", enunciado: "a", alternativas: [{ id: "a", texto: "A" }, { id: "b", texto: "B" }], correta: "a" },
      { id: "q2", enunciado: "b", alternativas: [{ id: "a", texto: "C" }, { id: "b", texto: "D" }], correta: "b" },
    ],
  });
  assert.equal(teste.totalQuestoes, 2);
});

test("corrigirTeste acerta todas as objetivas", () => {
  const resultado = corrigirTeste(testeObjetivo(), respostasCorretas());
  assert.equal(resultado.nota, 10);
  assert.equal(resultado.notaMaxima, 10);
  assert.equal(resultado.percentual, 100);
  assert.equal(resultado.aprovado, true);
  assert.equal(resultado.acertos, 5);
  assert.equal(resultado.erros, 0);
  assert.equal(resultado.aguardandoRevisao, false);
});

test("corrigirTeste compara cada questão com o gabarito", () => {
  const resultado = corrigirTeste(testeObjetivo(), [
    { questaoId: "q1", valor: 5 },
    { questaoId: "q2", valor: "b" },
    { questaoId: "q3", valor: false },
    { questaoId: "q4", valor: ["b"] },
    { questaoId: "q5", valor: "3,65" },
  ]);
  assert.equal(resultado.nota, 0);
  assert.equal(resultado.percentual, 0);
  assert.equal(resultado.aprovado, false);
  assert.equal(resultado.erros, 5);
  const porId = Object.fromEntries(resultado.gabaritoComparado.map((item) => [item.questaoId, item]));
  assert.equal(porId.q1.correta, false);
  assert.match(porId.q2.motivo, /gabarito: a/);
  assert.equal(porId.q4.correta, false);
  assert.match(porId.q5.motivo, /esperado: 3.5/);
});

test("corrigirTeste exige todas as alternativas marcadas em resposta múltipla", () => {
  const resultado = corrigirTeste(testeObjetivo(), [{ questaoId: "q4", valor: ["b", "d"] }]);
  const item = resultado.gabaritoComparado.find((g) => g.questaoId === "q4");
  assert.equal(item.correta, true);
  assert.equal(item.nota, 2);
  assert.equal(resultado.naoRespondidas, 4);
});

test("corrigirTeste trata letra maiúscula e minúscula como iguais", () => {
  const resultado = corrigirTeste(testeObjetivo(), [{ questaoId: "q2", valor: "A" }]);
  assert.equal(resultado.gabaritoComparado.find((g) => g.questaoId === "q2").correta, true);
});

test("corrigirTeste respeita a tolerância da resposta numérica", () => {
  const resultado = corrigirTeste(testeObjetivo(), [{ questaoId: "q5", valor: "3,55" }]);
  assert.equal(resultado.gabaritoComparado.find((g) => g.questaoId === "q5").correta, true);
});

test("corrigirTeste registra questão sem resposta como zero, não como pendência", () => {
  const resultado = corrigirTeste(testeObjetivo(), [{ questaoId: "q1", valor: 4 }]);
  assert.equal(resultado.naoRespondidas, 4);
  assert.equal(resultado.nota, 2);
  assert.equal(resultado.aprovado, false);
  assert.equal(resultado.pendentesRevisao.length, 0);
  const item = resultado.gabaritoComparado.find((g) => g.questaoId === "q2");
  assert.equal(item.correta, false);
  assert.equal(item.motivo, "sem resposta");
});

test("corrigirTeste aceita verdadeiro/falso em vários formatos", () => {
  for (const valor of ["V", "verdadeiro", true, "SIM", 1]) {
    const resultado = corrigirTeste(testeObjetivo(), [{ questaoId: "q3", valor }]);
    assert.equal(resultado.gabaritoComparado.find((g) => g.questaoId === "q3").correta, true, `falhou com ${valor}`);
  }
  for (const valor of ["F", "falso", false, "NAO", 0]) {
    const resultado = corrigirTeste(testeObjetivo(), [{ questaoId: "q3", valor }]);
    assert.equal(resultado.gabaritoComparado.find((g) => g.questaoId === "q3").correta, false, `falhou com ${valor}`);
  }
});

test("corrigirTeste devolve aprovado nulo quando não há nota de corte", () => {
  const resultado = corrigirTeste(testeObjetivo({ notaCorte: null }), respostasCorretas());
  assert.equal(resultado.percentual, 100);
  assert.equal(resultado.aprovado, null);
  assert.match(resultado.motivoAprovacao, /sem nota de corte/);
});

test("corrigirTeste não inventa nota para questão dissertativa", () => {
  const resultado = corrigirTeste(testeMisto(), [
    { questaoId: "q1", valor: 4 },
    { questaoId: "q2", valor: true },
    { questaoId: "q3", valor: "Justa causa exige falta grave do empregado." },
  ]);
  assert.equal(resultado.pendentesRevisao.length, 1);
  assert.equal(resultado.pendentesRevisao[0].questaoId, "q3");
  assert.equal(resultado.pendentesRevisao[0].nota, null);
  assert.equal(resultado.pendentesRevisao[0].pontos, 4);
  assert.equal(resultado.pendentesRevisao[0].respondida, true);
  assert.equal(resultado.nota, 6);
  assert.equal(resultado.notaMaxima, 10);
  assert.equal(resultado.notaMaximaCorrigida, 6);
  assert.equal(resultado.percentual, 60);
  assert.equal(resultado.percentualCorrigido, 100);
});

test("aprovado é null com revisão pendente mesmo com 100% da parte automática", () => {
  const resultado = corrigirTeste(testeMisto(), [
    { questaoId: "q1", valor: 4 },
    { questaoId: "q2", valor: "VERDADEIRO" },
    { questaoId: "q3", valor: "Resposta completa." },
  ]);
  assert.equal(resultado.percentualCorrigido, 100);
  assert.equal(resultado.aprovado, null);
  assert.equal(resultado.aguardandoRevisao, true);
  assert.match(resultado.motivoAprovacao, /revisão humana/);
});

test("aprovado é null com revisão pendente mesmo com nota zero", () => {
  // Um teste corrigido pela metade nunca pode reprovar candidato.
  const resultado = corrigirTeste(testeMisto(), [{ questaoId: "q3", valor: "." }]);
  assert.equal(resultado.nota, 0);
  assert.equal(resultado.percentual, 0);
  assert.equal(resultado.aprovado, null);
});

test("aprovado é null com revisão pendente mesmo sem resposta na dissertativa", () => {
  const resultado = corrigirTeste(testeMisto(), [
    { questaoId: "q1", valor: 4 },
    { questaoId: "q2", valor: true },
  ]);
  assert.equal(resultado.pendentesRevisao[0].respondida, false);
  assert.equal(resultado.pendentesRevisao[0].texto, null);
  assert.equal(resultado.aprovado, null);
});

test("corrigirTeste decide pelo corte quando não há pendência humana", () => {
  const aprovado = corrigirTeste(testeObjetivo(), respostasCorretas());
  assert.equal(aprovado.aprovado, true);
  assert.match(aprovado.motivoAprovacao, /acima do corte 70/);

  const reprovado = corrigirTeste(testeObjetivo(), [
    { questaoId: "q1", valor: 4 },
    { questaoId: "q2", valor: "a" },
    { questaoId: "q3", valor: true },
  ]);
  assert.equal(reprovado.nota, 6);
  assert.equal(reprovado.percentual, 60);
  assert.equal(reprovado.aprovado, false);
  assert.match(reprovado.motivoAprovacao, /abaixo do corte 70/);
});

test("corrigirTeste sinaliza estouro de tempo sem reprovar por isso", () => {
  const resultado = corrigirTeste(testeObjetivo(), respostasCorretas(), { tempoGastoMinutos: 45 });
  assert.equal(resultado.tempoExcedido, true);
  assert.equal(resultado.tempoGastoMinutos, 45);
  assert.equal(resultado.aprovado, true);

  const dentro = corrigirTeste(testeObjetivo(), respostasCorretas(), { tempoGastoMinutos: 20 });
  assert.equal(dentro.tempoExcedido, false);
});

test("corrigirTeste rejeita entrada inválida", () => {
  assert.throws(() => corrigirTeste(null, []), /teste inválido/);
  assert.throws(() => corrigirTeste(testeObjetivo(), "q1"), /deve ser uma lista/);
});

test("parsearNumero entende vírgula, ponto e milhar", () => {
  assert.equal(parsearNumero("3,5"), 3.5);
  assert.equal(parsearNumero("3.5"), 3.5);
  assert.equal(parsearNumero("1.234,56"), 1234.56);
  assert.equal(parsearNumero(7), 7);
  assert.equal(parsearNumero("abc"), NaN);
  assert.equal(parsearNumero(""), NaN);
});

function rubricaExemplo() {
  return criarRubrica({
    questaoId: "q3",
    criterios: [
      { id: "clareza", descricao: "Clareza e coesão do texto", peso: 30 },
      { id: "fundamentacao", descricao: "Fundamentação legal correta e citada", peso: 50 },
      { id: "objetividade", descricao: "Objetividade e respeito ao enunciado", peso: 20 },
    ],
  });
}

test("criarRubrica exige pesos somando 100", () => {
  assert.throws(
    () => criarRubrica({ questaoId: "q1", criterios: [{ id: "a", descricao: "A", peso: 60 }] }),
    /devem somar 100 \(soma atual: 60\)/
  );
  assert.throws(() => criarRubrica({ questaoId: "q1", criterios: [] }), /ao menos um critério/);
  assert.throws(() => criarRubrica({ criterios: [{ id: "a", descricao: "A", peso: 100 }] }), /exige 'questaoId'/);
  assert.throws(
    () => criarRubrica({ questaoId: "q1", criterios: [{ id: "a", peso: 100 }] }),
    /'descricao' obrigatória/
  );
});

test("avaliarComRubrica pondera cada critério na escala 0 a 5", () => {
  const resultado = avaliarComRubrica(rubricaExemplo(), { clareza: 4, fundamentacao: 3, objetividade: 5 });
  assert.equal(resultado.nota, 74);
  assert.equal(resultado.notaMaxima, 100);
  assert.equal(resultado.percentual, 74);
  assert.equal(resultado.revisada, true);
  assert.deepEqual(
    resultado.detalhe.map((d) => d.pontos),
    [24, 30, 20]
  );
});

test("avaliarComRubrica aceita notas em lista e devolve extremos corretos", () => {
  const maximo = avaliarComRubrica(rubricaExemplo(), [
    { criterioId: "clareza", nota: 5 },
    { criterioId: "fundamentacao", nota: 5 },
    { criterioId: "objetividade", nota: 5 },
  ]);
  assert.equal(maximo.nota, 100);

  const minimo = avaliarComRubrica(rubricaExemplo(), { clareza: 0, fundamentacao: 0, objetividade: 0 });
  assert.equal(minimo.nota, 0);
});

test("avaliarComRubrica rejeita nota fora da escala ou não numérica", () => {
  assert.throws(
    () => avaliarComRubrica(rubricaExemplo(), { clareza: 6, fundamentacao: 3, objetividade: 5 }),
    /fora da escala 0 a 5/
  );
  assert.throws(
    () => avaliarComRubrica(rubricaExemplo(), { clareza: -1, fundamentacao: 3, objetividade: 5 }),
    /fora da escala 0 a 5/
  );
  assert.throws(
    () => avaliarComRubrica(rubricaExemplo(), { clareza: "ótimo", fundamentacao: 3, objetividade: 5 }),
    /a nota deve ser um número/
  );
});

test("avaliarComRubrica não permite critério faltante nem desconhecido", () => {
  // Zeraria peso silenciosamente e derrubaria a nota do candidato.
  assert.throws(
    () => avaliarComRubrica(rubricaExemplo(), { clareza: 4, objetividade: 5 }),
    /falta nota para o\(s\) critério\(s\) fundamentacao/
  );
  assert.throws(
    () =>
      avaliarComRubrica(rubricaExemplo(), {
        clareza: 4,
        fundamentacao: 3,
        objetividade: 5,
        gramatica: 2,
      }),
    /nota para critério inexistente/
  );
  assert.throws(() => avaliarComRubrica(null, {}), /rubrica inválida/);
  assert.throws(() => avaliarComRubrica(rubricaExemplo(), "nota"), /deve ser um objeto/);
});
