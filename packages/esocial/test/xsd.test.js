/**
 * Os padrões do Labutar (docs/15, seção 7) conferidos contra o esquema oficial do eSocial:
 * se o eSocial mudar um formato, este teste avisa antes de um evento ser recusado.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { validarCNPJ, raizCNPJ, validarCPF } from "../../core/src/validacao.js";
import { TIPO_VINCULO, gerarMatricula } from "../../mao-de-obra/src/index.js";

import { ESQUEMAS_ESOCIAL, esquemaVigente } from "../src/esquemas.js";

const PASTA = new URL(`../xsd/${ESQUEMAS_ESOCIAL.at(-1).pasta}/`, import.meta.url);
const TIPOS = readFileSync(new URL("tipos.xsd", PASTA), "utf8");

function tipo(nome) {
  const m = new RegExp(`<xs:simpleType name="${nome}">([\\s\\S]*?)</xs:simpleType>`).exec(TIPOS);
  assert.ok(m, `tipo ${nome} não existe em tipos.xsd`);
  const corpo = m[1];
  const padrao = /<xs:pattern value="([^"]+)"/.exec(corpo)?.[1];
  const max = /<xs:maxLength value="(\d+)"/.exec(corpo)?.[1];
  return {
    // Padrão de XSD é implicitamente ancorado no início e no fim.
    aceita: (v) => (padrao ? new RegExp(`^(?:${padrao})$`).test(v) : true) && (max ? v.length <= Number(max) : true),
    max: max ? Number(max) : null,
  };
}

test("cada pacote guardado tem os 50 eventos do leiaute S-1.3", () => {
  for (const esquema of ESQUEMAS_ESOCIAL) {
    const pasta = new URL(`../xsd/${esquema.pasta}/`, import.meta.url);
    const eventos = readdirSync(pasta).filter((n) => n.startsWith("evt"));
    assert.equal(eventos.length, 50, esquema.pasta);
    for (const n of eventos) {
      assert.match(readFileSync(new URL(n, pasta), "utf8"), /targetNamespace="http:\/\/www\.esocial\.gov\.br\/schema\/evt\/\w+\/v_S_01_03_00"/, n);
    }
  }
});

test("evento é validado pelo esquema vigente na data do envio", () => {
  assert.equal(esquemaVigente("2026-11-23").pasta, "S-1.3-2026-11-23");
  assert.equal(esquemaVigente("2026-12-13").pasta, "S-1.3-2026-11-23");
  assert.equal(esquemaVigente("2026-12-14").pasta, "S-1.3-2026-12-14");
  assert.equal(esquemaVigente("2027-03-01").pasta, "S-1.3-2026-12-14");
  assert.throws(() => esquemaVigente("2026-09-30"), /nenhum esquema/);
});

test("o pacote de 14/12/2026 traz o salário-paternidade (Lei 15.371/2026) que o de 23/11 não tem", () => {
  const rubrica = (pasta) => readFileSync(new URL(`../xsd/${pasta}/evtTabRubrica.xsd`, import.meta.url), "utf8");
  assert.doesNotMatch(rubrica("S-1.3-2026-11-23"), /Salário-paternidade mensal, pago pelo INSS/);
  assert.match(rubrica("S-1.3-2026-12-14"), /Salário-paternidade mensal, pago pelo INSS/);
});

test("CNPJ: o eSocial aceita os dois formatos que o core valida", () => {
  const cnpj = tipo("TS_cnpj");
  for (const valor of ["11.222.333/0001-81", "12.ABC.345/01DE-35", "42.288.454/0001-50"]) {
    const v = validarCNPJ(valor);
    assert.equal(v.valido, true, valor);
    assert.equal(cnpj.aceita(v.digitos), true, `eSocial recusaria ${v.digitos}`);
  }
  assert.equal(cnpj.aceita("12ABC34501DE3A"), false); // dígito verificador com letra
});

test("raiz do CNPJ cabe na inscrição do empregador (8 caracteres)", () => {
  const insc = tipo("TS_nrInsc_8_14");
  assert.equal(insc.aceita(raizCNPJ("12.ABC.345/01DE-35")), true);
  assert.equal(insc.aceita(raizCNPJ("11.222.333/0001-81")), true);
});

test("matrícula V-NNNNNN-D cabe no campo do eSocial", () => {
  const matricula = tipo("TS_matricula");
  for (const v of Object.values(TIPO_VINCULO)) {
    const m = gerarMatricula(v, 999_999);
    assert.equal(matricula.aceita(m), true, m);
    assert.ok(!m.toLowerCase().startsWith("esocial"));
  }
});

test("código de verba NNNN.VV: natureza de 4 dígitos e código até 30 caracteres", () => {
  const natureza = tipo("TS_natRubr");
  const codigo = tipo("TS_codigo_esocial");
  assert.equal(natureza.aceita("1000"), true);
  assert.equal(natureza.aceita("100"), false);
  assert.equal(codigo.max, 30);
  assert.equal(codigo.aceita("1000.01"), true);
});

test("CPF vai ao eSocial só com os 11 dígitos", () => {
  const cpf = tipo("TS_cpf");
  const v = validarCPF("529.982.247-25");
  assert.equal(v.valido, true);
  assert.equal(cpf.aceita(v.digitos), true);
  assert.equal(cpf.aceita("529.982.247-25"), false);
});
