import { test } from "node:test";
import assert from "node:assert/strict";
import { TIPO_VINCULO, formatarMatricula, gerarMatricula, proximaMatricula, validarMatricula } from "../src/index.js";

test("matrícula traz o vínculo no primeiro dígito e verificador no último", () => {
  const m = gerarMatricula(TIPO_VINCULO.TEMPORARIO, 4821);
  assert.match(m, /^2004821\d$/);
  assert.equal(validarMatricula(m).valido, true);
  assert.equal(validarMatricula(m).vinculo, TIPO_VINCULO.TEMPORARIO);
  assert.equal(gerarMatricula(TIPO_VINCULO.PROPRIO, 1)[0], "1");
  assert.equal(gerarMatricula(TIPO_VINCULO.TERCEIRIZADO, 1)[0], "3");
});

test("verificador pega erro de digitação de um dígito e troca de vizinhos", () => {
  const m = gerarMatricula(TIPO_VINCULO.TERCEIRIZADO, 123456);
  for (let i = 1; i < 7; i++) {
    const trocado = m.slice(0, i) + ((Number(m[i]) + 1) % 10) + m.slice(i + 1);
    assert.equal(validarMatricula(trocado).valido, false, trocado);
  }
  const vizinhos = m[0] + m[2] + m[1] + m.slice(3);
  if (vizinhos !== m) assert.equal(validarMatricula(vizinhos).valido, false);
});

test("formato de tela e aceitação com separadores", () => {
  const m = gerarMatricula(TIPO_VINCULO.TEMPORARIO, 4821);
  const tela = formatarMatricula(m);
  assert.match(tela, /^2-004821-\d$/);
  assert.equal(validarMatricula(tela).valido, true);
});

test("próxima matrícula segue a sequência do vínculo e nunca reaproveita", () => {
  const existentes = [gerarMatricula(TIPO_VINCULO.TEMPORARIO, 7), gerarMatricula(TIPO_VINCULO.TEMPORARIO, 3), gerarMatricula(TIPO_VINCULO.PROPRIO, 50)];
  assert.equal(proximaMatricula(TIPO_VINCULO.TEMPORARIO, existentes), gerarMatricula(TIPO_VINCULO.TEMPORARIO, 8));
  assert.equal(proximaMatricula(TIPO_VINCULO.TERCEIRIZADO, existentes), gerarMatricula(TIPO_VINCULO.TERCEIRIZADO, 1));
});

test("rejeita formato, vínculo e sequência inválidos", () => {
  assert.equal(validarMatricula("123").valido, false);
  assert.equal(validarMatricula("90000011").valido, false);
  assert.throws(() => gerarMatricula("ESTAGIO", 1), /vínculo desconhecido/);
  assert.throws(() => gerarMatricula(TIPO_VINCULO.PROPRIO, 0), /sequência/);
  assert.throws(() => gerarMatricula(TIPO_VINCULO.PROPRIO, 1_000_000), /sequência/);
});
