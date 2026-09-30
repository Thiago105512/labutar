import test from "node:test";
import assert from "node:assert/strict";

import {
  validarCPF,
  validarCNPJ,
  validarPIS,
  validarEmail,
  validarTelefone,
  validarCEP,
  validarDataISO,
  validarInscricao,
  formatarCPF,
  formatarCNPJ,
  formatarPIS,
  formatarTelefone,
  formatarCEP,
  somenteDigitos,
} from "../src/validacao.js";

test("CPF: aceita documento válido com e sem máscara", () => {
  assert.equal(validarCPF("111.444.777-35").valido, true);
  assert.equal(validarCPF("11144477735").valido, true);
});

test("CPF: rejeita dígito verificador errado", () => {
  const resultado = validarCPF("11144477736");
  assert.equal(resultado.valido, false);
  assert.match(resultado.motivo, /verificador/);
});

test("CPF: rejeita sequência de dígitos repetidos", () => {
  assert.equal(validarCPF("11111111111").valido, false);
  assert.equal(validarCPF("00000000000").valido, false);
});

test("CPF: rejeita tamanho incorreto e valores nulos", () => {
  assert.equal(validarCPF("123").valido, false);
  assert.equal(validarCPF(null).valido, false);
  assert.equal(validarCPF(undefined).valido, false);
});

test("CNPJ: aceita documento válido", () => {
  assert.equal(validarCNPJ("11.222.333/0001-81").valido, true);
  assert.equal(validarCNPJ("11222333000181").valido, true);
});

test("CNPJ: rejeita dígito verificador errado", () => {
  assert.equal(validarCNPJ("11222333000182").valido, false);
});

test("CNPJ: rejeita todos os dígitos iguais", () => {
  assert.equal(validarCNPJ("11111111111111").valido, false);
});

test("PIS: aceita documento com dígito verificador correto", () => {
  assert.equal(validarPIS("12056412782").valido, true);
  assert.equal(validarPIS("120.56412.78-2").valido, true);
});

test("PIS: rejeita dígito verificador errado", () => {
  assert.equal(validarPIS("12056412783").valido, false);
});

test("validarInscricao: roteia por tpInsc do eSocial", () => {
  assert.equal(validarInscricao({ tipo: "1", numero: "11222333000181" }).valido, true);
  assert.equal(validarInscricao({ tipo: "2", numero: "11144477735" }).valido, true);
  assert.equal(validarInscricao({ tipo: "9", numero: "11144477735" }).valido, false);
});

test("e-mail: aceita endereços comuns e rejeita inválidos", () => {
  assert.equal(validarEmail("thiago@fenixjuridico.com.br").valido, true);
  assert.equal(validarEmail("nome+sobrenome@sub.dominio.com").valido, true);
  assert.equal(validarEmail("sem-arroba").valido, false);
  assert.equal(validarEmail("a@b").valido, false);
  assert.equal(validarEmail("").valido, false);
});

test("telefone: valida celular e fixo brasileiros, com DDI opcional", () => {
  assert.equal(validarTelefone("(11) 98765-4321").valido, true);
  assert.equal(validarTelefone("+55 11 98765-4321").valido, true);
  assert.equal(validarTelefone("(11) 3456-7890").valido, true);
  assert.equal(validarTelefone("(11) 8765-4321").valido, false);
  assert.equal(validarTelefone("(00) 98765-4321").valido, false);
});

test("telefone: identifica celular pelo nono dígito", () => {
  assert.equal(validarTelefone("11987654321").celular, true);
  assert.equal(validarTelefone("1134567890").celular, false);
});

test("CEP e data ISO", () => {
  assert.equal(validarCEP("06454-000").valido, true);
  assert.equal(validarCEP("6454000").valido, false);

  assert.equal(validarDataISO("2026-09-27").valido, true);
  assert.equal(validarDataISO("2026-02-30").valido, false);
  assert.equal(validarDataISO("2024-02-29").valido, true);
  assert.equal(validarDataISO("2026-13-01").valido, false);
  assert.equal(validarDataISO("27/09/2026").valido, false);
});

test("formatação aplica máscara brasileira", () => {
  assert.equal(formatarCPF("11144477735"), "111.444.777-35");
  assert.equal(formatarCNPJ("11222333000181"), "11.222.333/0001-81");
  assert.equal(formatarPIS("12056412782"), "120.56412.78-2");
  assert.equal(formatarTelefone("11987654321"), "(11) 98765-4321");
  assert.equal(formatarTelefone("1134567890"), "(11) 3456-7890");
  assert.equal(formatarCEP("6454000"), "06454-000");
});

test("somenteDigitos descarta qualquer separador", () => {
  assert.equal(somenteDigitos("11.222.333/0001-81"), "11222333000181");
  assert.equal(somenteDigitos(null), "");
  assert.equal(somenteDigitos("abc"), "");
});

import { normalizarCNPJ, raizCNPJ } from "../src/validacao.js";

test("CNPJ alfanumérico (IN RFB 2.229/2024): valida o exemplo oficial da Receita", () => {
  assert.equal(validarCNPJ("12.ABC.345/01DE-35").valido, true);
  assert.equal(validarCNPJ("12abc34501de35").valido, true); // minúsculas são normalizadas
  assert.equal(validarCNPJ("12.ABC.345/01DE-36").valido, false);
  assert.equal(validarCNPJ("12.ABC.345/01DE-3A").valido, false); // dígitos verificadores são sempre números
  assert.equal(formatarCNPJ("12abc34501de35"), "12.ABC.345/01DE-35");
});

test("CNPJ: raiz identifica a empresa nos dois formatos", () => {
  assert.equal(normalizarCNPJ(" 12.abc.345/01de-35 "), "12ABC34501DE35");
  assert.equal(raizCNPJ("11.222.333/0001-81"), "11222333");
  assert.equal(raizCNPJ("12.ABC.345/01DE-35"), "12ABC345");
  assert.equal(raizCNPJ("123"), null);
});
