import test from "node:test";
import assert from "node:assert/strict";

import {
  PERFIS_DISC,
  RESSALVAS_DISC,
  calcularDISC,
  codigosPerfilDISC,
  criarAvaliacaoDISC,
  descreverPerfil,
  responderDISC,
} from "../src/index.js";
import { avaliacaoDISCExemplo, respostasDISCExemplo } from "./auxiliares.js";

function avaliacao(quantidade = 3) {
  return criarAvaliacaoDISC(avaliacaoDISCExemplo(quantidade));
}

function somaPercentuais(percentuais) {
  return Math.round(Object.values(percentuais).reduce((soma, valor) => soma + valor, 0));
}

test("criarAvaliacaoDISC normaliza fatores e devolve o total de questões", () => {
  const disc = avaliacao();
  assert.equal(disc.tipo, "DISC");
  assert.equal(disc.totalQuestoes, 3);
  assert.deepEqual(
    disc.questoes[0].alternativas.map((a) => a.fator),
    ["D", "I", "S", "C"]
  );
  assert.deepEqual(disc.questoes[0].fatores, ["D", "I", "S", "C"]);
  assert.deepEqual(disc.avisos, []);
  assert.ok(disc.id.startsWith("DISC_"));
});

test("criarAvaliacaoDISC aceita fator minúsculo e com espaço", () => {
  const disc = criarAvaliacaoDISC({
    questoes: [
      {
        id: "q1",
        alternativas: [
          { id: "a", texto: "A", fator: " d " },
          { id: "b", texto: "B", fator: "i" },
          { id: "c", texto: "C", fator: "S" },
          { id: "d", texto: "D", fator: "C" },
        ],
      },
    ],
  });
  assert.deepEqual(disc.questoes[0].alternativas.map((a) => a.fator), ["D", "I", "S", "C"]);
});

test("criarAvaliacaoDISC rejeita questão sem exatamente 4 alternativas", () => {
  const base = avaliacaoDISCExemplo(1).questoes[0];
  assert.throws(
    () => criarAvaliacaoDISC({ questoes: [{ ...base, alternativas: base.alternativas.slice(0, 3) }] }),
    /exatamente 4 alternativas \(recebidas: 3\)/
  );
  assert.throws(
    () => criarAvaliacaoDISC({ questoes: [{ id: "q1" }] }),
    /exatamente 4 alternativas \(recebidas: 0\)/
  );
});

test("criarAvaliacaoDISC rejeita fator fora de D, I, S, C", () => {
  const base = avaliacaoDISCExemplo(1).questoes[0];
  const alternativas = base.alternativas.map((a, i) => (i === 2 ? { ...a, fator: "E" } : a));
  assert.throws(
    () => criarAvaliacaoDISC({ questoes: [{ ...base, alternativas }] }),
    /fator inválido "E"/
  );
});

test("criarAvaliacaoDISC rejeita id de questão duplicado", () => {
  const questoes = avaliacaoDISCExemplo(2).questoes;
  assert.throws(
    () => criarAvaliacaoDISC({ questoes: [questoes[0], { ...questoes[1], id: "q1" }] }),
    /Id de questão duplicado: "q1"/
  );
});

test("criarAvaliacaoDISC rejeita alternativa sem texto e sem id", () => {
  const base = avaliacaoDISCExemplo(1).questoes[0];
  assert.throws(
    () =>
      criarAvaliacaoDISC({
        questoes: [{ ...base, alternativas: base.alternativas.map((a, i) => (i === 1 ? { ...a, texto: "  " } : a)) }],
      }),
    /'texto' obrigatório/
  );
  assert.throws(
    () =>
      criarAvaliacaoDISC({
        questoes: [{ ...base, alternativas: base.alternativas.map((a, i) => (i === 1 ? { ...a, id: "" } : a)) }],
      }),
    /alternativa sem 'id'/
  );
});

test("criarAvaliacaoDISC rejeita id de alternativa repetido em outra questão", () => {
  const questoes = avaliacaoDISCExemplo(2).questoes;
  const segunda = { ...questoes[1], alternativas: questoes[1].alternativas.map((a, i) => (i === 0 ? { ...a, id: "q1d" } : a)) };
  assert.throws(() => criarAvaliacaoDISC({ questoes: [questoes[0], segunda] }), /id de alternativa duplicado "q1d"/);
});

test("criarAvaliacaoDISC rejeita entrada vazia ou malformada", () => {
  assert.throws(() => criarAvaliacaoDISC({}), /ao menos uma questão/);
  assert.throws(() => criarAvaliacaoDISC({ questoes: [] }), /ao menos uma questão/);
  assert.throws(() => criarAvaliacaoDISC({ questoes: [null] }), /deve ser um objeto/);
});

test("criarAvaliacaoDISC avisa quando a questão não cobre os quatro fatores", () => {
  const disc = criarAvaliacaoDISC({
    questoes: [
      {
        id: "q1",
        alternativas: [
          { id: "a", texto: "A", fator: "D" },
          { id: "b", texto: "B", fator: "D" },
          { id: "c", texto: "C", fator: "S" },
          { id: "d", texto: "D", fator: "C" },
        ],
      },
    ],
  });
  assert.equal(disc.avisos.length, 1);
  assert.match(disc.avisos[0], /não cobrem os quatro fatores/);
  assert.deepEqual(disc.questoes[0].fatores, ["D", "S", "C"]);
});

test("responderDISC devolve completo quando todas as questões foram respondidas", () => {
  const resultado = responderDISC(avaliacao(), respostasDISCExemplo(3));
  assert.equal(resultado.completo, true);
  assert.equal(resultado.respondidas, 3);
  assert.deepEqual(resultado.pendentes, []);
  assert.deepEqual(resultado.invalidas, []);
});

test("responderDISC lista as questões pendentes", () => {
  const resultado = responderDISC(avaliacao(3), respostasDISCExemplo(2));
  assert.equal(resultado.completo, false);
  assert.deepEqual(resultado.pendentes, ["q3"]);
  assert.equal(resultado.respondidas, 2);
});

test("responderDISC rejeita resposta autocontraditória (mais igual a menos)", () => {
  const resultado = responderDISC(avaliacao(1), [{ questaoId: "q1", mais: "q1d", menos: "q1d" }]);
  assert.equal(resultado.completo, false);
  assert.equal(resultado.invalidas.length, 1);
  assert.match(resultado.invalidas[0].motivo, /não podem ser a mesma alternativa/);
  assert.deepEqual(resultado.pendentes, ["q1"]);
});

test("responderDISC rejeita alternativa que não pertence à questão", () => {
  const resultado = responderDISC(avaliacao(2), [{ questaoId: "q1", mais: "q2d", menos: "q1s" }]);
  assert.equal(resultado.invalidas.length, 1);
  assert.match(resultado.invalidas[0].motivo, /não pertence à questão/);
});

test("responderDISC rejeita questão inexistente e resposta incompleta", () => {
  const resultado = responderDISC(avaliacao(1), [
    { questaoId: "q99", mais: "q1d", menos: "q1s" },
    { questaoId: "q1", mais: "q1d" },
  ]);
  assert.equal(resultado.invalidas.length, 2);
  assert.match(resultado.invalidas[0].motivo, /questão não encontrada/);
  assert.match(resultado.invalidas[1].motivo, /sem 'mais' ou sem 'menos'/);
});

test("responderDISC considera a última resposta válida da questão", () => {
  const resultado = responderDISC(avaliacao(1), [
    { questaoId: "q1", mais: "q1d", menos: "q1s" },
    { questaoId: "q1", mais: "q1i", menos: "q1c" },
  ]);
  assert.equal(resultado.completo, true);
  assert.deepEqual(resultado.validas, [{ questaoId: "q1", mais: "q1i", menos: "q1c" }]);
});

test("calcularDISC separa perfil bruto, menos e líquido", () => {
  const resultado = calcularDISC(avaliacao(3), respostasDISCExemplo(3, { mais: "d", menos: "s" }));
  assert.deepEqual(resultado.bruto, { D: 3, I: 0, S: 0, C: 0 });
  assert.deepEqual(resultado.menos, { D: 0, I: 0, S: 3, C: 0 });
  assert.deepEqual(resultado.liquido, { D: 3, I: 0, S: -3, C: 0 });
  assert.deepEqual(resultado.percentuais, { D: 100, I: 0, S: 0, C: 0 });
  assert.deepEqual(resultado.percentuaisMenos, { D: 0, I: 0, S: 100, C: 0 });
  assert.equal(resultado.fatorPredominante, "D");
  assert.equal(resultado.fatorPredominanteNome, "Dominância");
  assert.equal(resultado.perfil, "D");
  assert.equal(resultado.completo, true);
});

test("calcularDISC distribui os percentuais sobre o total de questões", () => {
  const resultado = calcularDISC(avaliacao(3), [
    { questaoId: "q1", mais: "q1d", menos: "q1s" },
    { questaoId: "q2", mais: "q2i", menos: "q2c" },
    { questaoId: "q3", mais: "q3d", menos: "q3c" },
  ]);
  assert.deepEqual(resultado.bruto, { D: 2, I: 1, S: 0, C: 0 });
  assert.deepEqual(resultado.menos, { D: 0, I: 0, S: 1, C: 2 });
  assert.deepEqual(resultado.liquido, { D: 2, I: 1, S: -1, C: -2 });
  assert.deepEqual(resultado.percentuais, { D: 66.67, I: 33.33, S: 0, C: 0 });
  assert.equal(somaPercentuais(resultado.percentuais), 100);
});

test("calcularDISC usa 50 como ponto neutro no percentual líquido", () => {
  const resultado = calcularDISC(avaliacao(2), [
    { questaoId: "q1", mais: "q1d", menos: "q1s" },
    { questaoId: "q2", mais: "q2i", menos: "q2c" },
  ]);
  assert.equal(resultado.percentuaisLiquidos.I, 75);
  assert.equal(resultado.percentuaisLiquidos.S, 25);
  assert.deepEqual(resultado.liquido, { D: 1, I: 1, S: -1, C: -1 });
});

test("calcularDISC sinaliza resultado incompleto e não soma 100 nos percentuais", () => {
  const resultado = calcularDISC(avaliacao(4), respostasDISCExemplo(2));
  assert.equal(resultado.completo, false);
  assert.deepEqual(resultado.pendentes, ["q3", "q4"]);
  assert.equal(resultado.respondidas, 2);
  assert.equal(resultado.totalQuestoes, 4);
  assert.equal(resultado.percentuais.D, 50);
  assert.notEqual(somaPercentuais(resultado.percentuais), 100);
});

test("calcularDISC descarta respostas inválidas do cálculo", () => {
  const resultado = calcularDISC(avaliacao(2), [
    { questaoId: "q1", mais: "q1d", menos: "q1s" },
    { questaoId: "q2", mais: "q2i", menos: "q2i" },
  ]);
  assert.deepEqual(resultado.bruto, { D: 1, I: 0, S: 0, C: 0 });
  assert.equal(resultado.invalidas.length, 1);
  assert.equal(resultado.respondidas, 1);
  assert.equal(resultado.fatorPredominante, "D");
});

test("calcularDISC devolve perfil nulo quando não há resposta válida", () => {
  const resultado = calcularDISC(avaliacao(2), []);
  assert.equal(resultado.perfil, null);
  assert.equal(resultado.fatorPredominante, null);
  assert.equal(resultado.perfilTitulo, null);
  assert.deepEqual(resultado.bruto, { D: 0, I: 0, S: 0, C: 0 });
  assert.deepEqual(resultado.pendentes, ["q1", "q2"]);
});

test("calcularDISC desempata na ordem canônica D antes de I", () => {
  const resultado = calcularDISC(avaliacao(2), [
    { questaoId: "q1", mais: "q1d", menos: "q1s" },
    { questaoId: "q2", mais: "q2i", menos: "q2c" },
  ]);
  assert.equal(resultado.liquido.D, 1);
  assert.equal(resultado.liquido.I, 1);
  assert.equal(resultado.perfil, "DI");
  assert.equal(resultado.fatorPredominante, "D");
});

test("calcularDISC desempata S antes de C e nunca inverte a ordem", () => {
  const resultado = calcularDISC(avaliacao(4), [
    { questaoId: "q1", mais: "q1c", menos: "q1d" },
    { questaoId: "q2", mais: "q2s", menos: "q2i" },
    { questaoId: "q3", mais: "q3s", menos: "q3d" },
    { questaoId: "q4", mais: "q4c", menos: "q4i" },
  ]);
  assert.deepEqual(resultado.liquido, { D: -2, I: -2, S: 2, C: 2 });
  assert.equal(resultado.perfil, "SC");
  assert.equal(resultado.fatorPredominante, "S");
});

test("calcularDISC só gera perfil de duas letras quando o empate é positivo", () => {
  // Todos os fatores zerados: não há predominância real a relatar.
  const resultado = calcularDISC(avaliacao(4), [
    { questaoId: "q1", mais: "q1d", menos: "q1s" },
    { questaoId: "q2", mais: "q2s", menos: "q2d" },
    { questaoId: "q3", mais: "q3i", menos: "q3c" },
    { questaoId: "q4", mais: "q4c", menos: "q4i" },
  ]);
  assert.deepEqual(resultado.liquido, { D: 0, I: 0, S: 0, C: 0 });
  assert.equal(resultado.perfil, "D");
  assert.equal(resultado.fatorPredominante, "D");
});

test("calcularDISC expõe 'pressao' como cópia de 'menos'", () => {
  const resultado = calcularDISC(avaliacao(2), respostasDISCExemplo(2));
  assert.deepEqual(resultado.pressao, resultado.menos);
  assert.notEqual(resultado.pressao, resultado.menos);
});

test("calcularDISC e descreverPerfil carregam as ressalvas do instrumento", () => {
  const resultado = calcularDISC(avaliacao(1), respostasDISCExemplo(1));
  assert.deepEqual(resultado.ressalvas, [...RESSALVAS_DISC]);
  const descricao = descreverPerfil(resultado.perfil);
  assert.ok(descricao.ressalvas.length >= 5);
  const textoLegal = descricao.ressalvas.join(" ");
  assert.match(textoLegal, /não pode ser o único critério/i);
  assert.match(textoLegal, /filtro eliminatório/);
  assert.match(textoLegal, /Lei 9\.029\/1995/);
  assert.match(textoLegal, /LGPD/);
  assert.match(textoLegal, /não é diagnóstico clínico/i);
});

test("tabela de perfis cobre todas as combinações realistas de 1 e 2 letras", () => {
  const codigos = codigosPerfilDISC();
  assert.ok(codigos.length >= 15, `esperados ao menos 15 perfis, obtidos ${codigos.length}`);
  for (const letra of ["D", "I", "S", "C"]) assert.ok(codigos.includes(letra));
  const pares = [];
  for (const a of ["D", "I", "S", "C"]) {
    for (const b of ["D", "I", "S", "C"]) if (a !== b) pares.push(a + b);
  }
  for (const par of pares) assert.ok(codigos.includes(par), `falta o perfil ${par}`);
});

test("cada perfil traz conteúdo útil, sem texto de enchimento", () => {
  for (const codigo of codigosPerfilDISC()) {
    const perfil = descreverPerfil(codigo);
    assert.equal(perfil.codigo, codigo);
    assert.ok(perfil.titulo.length >= 8, `${codigo}: título curto`);
    assert.ok(perfil.resumo.length >= 60, `${codigo}: resumo curto`);
    assert.ok(perfil.forcas.length >= 4, `${codigo}: poucas forças`);
    assert.ok(perfil.desafios.length >= 4, `${codigo}: poucos desafios`);
    assert.ok(perfil.papeisSugeridos.length >= 4, `${codigo}: poucos papéis`);
    for (const item of [...perfil.forcas, ...perfil.desafios, ...perfil.papeisSugeridos]) {
      assert.ok(item.length >= 12, `${codigo}: item curto "${item}"`);
      assert.doesNotMatch(item, /lorem|ipsum|placeholder|todo:/i);
    }
  }
});

test("descreverPerfil devolve fatores nomeados", () => {
  const perfil = descreverPerfil("SC");
  assert.deepEqual(perfil.fatores, [
    { fator: "S", nome: "Estabilidade" },
    { fator: "C", nome: "Conformidade" },
  ]);
});

test("descreverPerfil diferencia a ordem das letras", () => {
  assert.notEqual(descreverPerfil("DI").titulo, descreverPerfil("ID").titulo);
  assert.notEqual(descreverPerfil("DI").resumo, descreverPerfil("ID").resumo);
});

test("descreverPerfil rejeita código inválido", () => {
  assert.throws(() => descreverPerfil("DD"), /fatores diferentes/);
  assert.throws(() => descreverPerfil("X"), /inválido/);
  assert.throws(() => descreverPerfil(""), /inválido/);
  assert.throws(() => descreverPerfil(null), /inválido/);
  assert.throws(() => descreverPerfil("DIS"), /inválido/);
});

test("PERFIS_DISC é imutável e descreverPerfil devolve cópias", () => {
  assert.ok(Object.isFrozen(PERFIS_DISC));
  const perfil = descreverPerfil("D");
  perfil.forcas.push("item indevido");
  assert.equal(descreverPerfil("D").forcas.length, 4);
});
