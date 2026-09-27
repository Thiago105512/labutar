import test from "node:test";
import assert from "node:assert/strict";

import {
  novoId,
  gerarToken,
  idEventoESocial,
  validarIdEventoESocial,
} from "../src/ids.js";

test("novoId usa prefixo e é único", () => {
  const ids = new Set(Array.from({ length: 2000 }, () => novoId("VAGA")));
  assert.equal(ids.size, 2000);
  for (const id of ids) assert.match(id, /^VAGA_[0-9A-Z]+$/);
});

test("novoId sem prefixo", () => {
  assert.match(novoId(), /^[0-9A-Z]+$/);
});

test("gerarToken tem tamanho pedido e evita caracteres ambíguos", () => {
  const token = gerarToken(32);
  assert.equal(token.length, 32);
  assert.doesNotMatch(token, /[01IO]/);
  assert.notEqual(token, gerarToken(32));
});

test("idEventoESocial gera 36 caracteres no padrão oficial", () => {
  const quando = new Date(Date.UTC(2026, 8, 27, 12, 0, 0));
  const id = idEventoESocial({
    tpInsc: "1",
    nrInsc: "11222333000181",
    sequencial: 1,
    quando,
  });

  assert.equal(id, "ID1112223330001812026092712000000001");
  assert.equal(id.length, 36);
  assert.equal(validarIdEventoESocial(id).valido, true);
});

test("idEventoESocial preenche inscrição curta com zeros", () => {
  const quando = new Date(Date.UTC(2026, 0, 5, 8, 30, 15));
  const id = idEventoESocial({
    tpInsc: "2",
    nrInsc: "11144477735",
    sequencial: 42,
    quando,
  });

  assert.equal(id, "ID2000111444777352026010508301500042");
  assert.equal(id.length, 36);
});

test("idEventoESocial rejeita inscrição que não caiba em 14 dígitos", () => {
  assert.throws(
    () => idEventoESocial({ tpInsc: "1", nrInsc: "1".repeat(20) }),
    /máximo no eSocial é 14/
  );
});

test("validarIdEventoESocial rejeita formato inválido", () => {
  assert.equal(validarIdEventoESocial("ID123").valido, false);
  assert.equal(validarIdEventoESocial(null).valido, false);
  assert.equal(validarIdEventoESocial("XX" + "1".repeat(34)).valido, false);
  assert.equal(validarIdEventoESocial("ID" + "1".repeat(35)).valido, false);
});
