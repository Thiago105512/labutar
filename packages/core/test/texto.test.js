import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizar,
  slug,
  capitalizar,
  nomeParaExibicao,
  iniciais,
  mascararCPF,
  mascararEmail,
  mascararTelefone,
  mascararNome,
  truncar,
  semEspacos,
  escapeXML,
} from "../src/texto.js";

test("normalizar remove acentos", () => {
  assert.equal(normalizar("São Paulo — Seleção"), "Sao Paulo — Selecao");
  assert.equal(normalizar(null), "");
});

test("slug gera identificadores de URL", () => {
  assert.equal(slug("Vaga de Desenvolvedor Sênior"), "vaga-de-desenvolvedor-senior");
  assert.equal(slug("  --Múltiplos   espaços-- "), "multiplos-espacos");
});

test("capitalizar e nomeParaExibicao respeitam partículas", () => {
  assert.equal(capitalizar("maria da silva"), "Maria Da Silva");
  assert.equal(nomeParaExibicao("maria da silva"), "Maria da Silva");
  assert.equal(nomeParaExibicao("JOÃO"), "João");
  assert.equal(nomeParaExibicao(""), "");
});

test("iniciais ignora partículas", () => {
  assert.equal(iniciais("Maria da Silva"), "MS");
  assert.equal(iniciais("Maria da Silva Santos"), "MS");
  assert.equal(iniciais("Ana"), "A");
});

test("máscaras de LGPD preservam apenas o necessário para identificação", () => {
  assert.equal(mascararCPF("111.444.777-35"), "***.444.777-**");
  assert.equal(mascararEmail("thiago@fenixjuridico.com.br"), "th****@fenixjuridico.com.br");
  assert.equal(mascararEmail("ab"), "***");
  assert.equal(mascararTelefone("11987654321"), "(**) *****-4321");
  assert.equal(mascararTelefone("1134567890"), "(**) ****-7890");
  assert.equal(mascararNome("Maria da Silva Souza"), "Maria d. S. S.");
});

test("truncar e semEspacos", () => {
  assert.equal(truncar("Analista de Recursos Humanos", 15), "Analista de Re…");
  assert.equal(truncar("curto", 15), "curto");
  assert.equal(semEspacos("  vaga   aberta \n"), "vaga aberta");
});

test("escapeXML protege os cinco caracteres reservados", () => {
  assert.equal(
    escapeXML(`<nome a="1">&'x'</nome>`),
    "&lt;nome a=&quot;1&quot;&gt;&amp;&apos;x&apos;&lt;/nome&gt;"
  );
  assert.equal(escapeXML(null), "");
});
