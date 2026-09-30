import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUS_ADMISSAO, TIPO_REGIME } from "../src/index.js";

test("status da admissão seguem docs/02-modelo-de-dados.md", () => {
  assert.deepEqual(Object.keys(STATUS_ADMISSAO), [
    "PENDENTE", "DOCUMENTOS_OK", "ASO_OK", "ENVIADA", "CONCLUIDA", "BLOQUEADA",
  ]);
});

test("constantes são imutáveis", () => {
  assert.ok(Object.isFrozen(STATUS_ADMISSAO));
  assert.ok(Object.isFrozen(TIPO_REGIME));
});
