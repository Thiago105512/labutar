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

import { situacaoDaAdmissao, validarPIS, textoDoContrato } from "../src/index.js";

const PESSOA = {
  nome: "Joana Ribeiro Lima", cpf: "52998224725", nascimento: "1998-03-02", nomeMae: "Maria Ribeiro",
  endereco: { cep: "69000000", logradouro: "Rua Exemplo", numero: "10", municipio: "Manaus", uf: "AM" },
  rg: "1234567", pis: "12056412545", banco: { pix: "joana@exemplo.com" },
};

test("PIS com dígito verificador", () => {
  assert.equal(validarPIS("120.56412.54-5"), true);
  assert.equal(validarPIS("12056412548"), false);
  assert.equal(validarPIS("11111111111"), false);
});

test("situação: etapas, ASO bloqueia e só conclui com tudo em ordem", () => {
  const vazio = situacaoDaAdmissao({ pessoa: { nome: "Joana Ribeiro Lima" }, admissao: {}, exame: null });
  assert.equal(vazio.status, "PENDENTE");
  assert.match(vazio.etapas.find((e) => e.id === "DOCUMENTOS").pendencia, /PIS/);
  const docs = situacaoDaAdmissao({ pessoa: PESSOA, admissao: {}, exame: { status: "AGENDADO", agendadoPara: "2026-10-12" } });
  assert.equal(docs.status, "DOCUMENTOS_OK");
  assert.match(docs.etapas.find((e) => e.id === "ASO").pendencia, /12\/10\/2026/);
  assert.equal(docs.podeConcluir, false);
  const inapto = situacaoDaAdmissao({ pessoa: PESSOA, admissao: { contrato: { aceitoEm: "x" } }, exame: { status: "REALIZADO", resultado: "INAPTO" } });
  assert.equal(inapto.status, "BLOQUEADA");
  assert.equal(inapto.podeConcluir, false);
  const pronto = situacaoDaAdmissao({ pessoa: PESSOA, admissao: { contrato: { aceitoEm: "x" } }, exame: { status: "REALIZADO", resultado: "APTO" } });
  assert.equal(pronto.status, "ASO_OK");
  assert.equal(pronto.podeConcluir, true);
});

test("contrato do temporário cita a Lei 6.019/1974 e o tomador", () => {
  const t = textoDoContrato({ empresa: { razaoSocial: "Empresa Fictícia", cnpj: "11222333000181" }, pessoa: PESSOA, vinculo: { tipo: "TEMPORARIO", cargo: "Operador", salario: 180000, admissao: "2026-10-13", temporario: { fimPrevisto: "2027-01-10" } }, tomador: { razaoSocial: "Tomador Fictício", cnpj: "1", municipio: "Manaus", uf: "AM" } });
  assert.match(t, /Lei 6\.019\/1974/);
  assert.match(t, /R\$ 1\.800,00/);
  assert.match(t, /10\/01\/2027/);
});
