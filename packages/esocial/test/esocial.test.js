import test from "node:test";
import assert from "node:assert/strict";

import {
  EVENTOS,
  AMBIENTES,
  PendenciaError,
  statusIntegracao,
  criarTransmissor,
  gerarS2200,
  gerarS2220,
  gerarS2240,
  validarContraXSD,
  assinar,
  transmitir,
  consultarLote,
} from "../src/index.js";

const PENDENTES = [
  ["criarTransmissor", criarTransmissor],
  ["gerarS2200", gerarS2200],
  ["gerarS2220", gerarS2220],
  ["gerarS2240", gerarS2240],
  ["validarContraXSD", validarContraXSD],
  ["assinar", assinar],
  ["transmitir", transmitir],
  ["consultarLote", consultarLote],
];

test("nenhuma função pendente devolve valor — todas falham alto", () => {
  for (const [nome, fn] of PENDENTES) {
    assert.throws(fn, PendenciaError, `${nome} deveria lançar PendenciaError`);
  }
});

test("PendenciaError nomeia a função e o bloqueio", () => {
  try {
    gerarS2220();
    assert.fail("deveria ter lançado");
  } catch (erro) {
    assert.equal(erro.name, "PendenciaError");
    assert.equal(erro.funcao, "gerarS2220");
    assert.match(erro.bloqueio, /XSD/);
    assert.match(erro.message, /docs\/05-compliance|README/);
  }
});

test("statusIntegracao reporta desabilitado para o server não expor a rota", () => {
  const status = statusIntegracao();
  assert.equal(status.habilitado, false);
  assert.deepEqual(status.eventosSuportados, []);
  assert.equal(Object.keys(status.pendencias).length, PENDENTES.length);
});

test("constantes de evento e ambiente estão congeladas", () => {
  assert.deepEqual(EVENTOS, { S2200: "S-2200", S2220: "S-2220", S2240: "S-2240" });
  assert.equal(AMBIENTES.PRODUCAO_RESTRITA, "producaoRestrita");
  assert.throws(() => {
    "use strict";
    EVENTOS.S2200 = "X";
  }, TypeError);
});
