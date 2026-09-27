import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

import * as avaliacoes from "../src/index.js";
import { FATOR_DISC, ORDEM_FATORES_DISC, RESSALVAS_DISC, TIPO_AULA, TIPO_TESTE } from "../src/index.js";

const API_ESPERADA = [
  "criarAvaliacaoDISC",
  "responderDISC",
  "calcularDISC",
  "descreverPerfil",
  "codigosPerfilDISC",
  "criarTeste",
  "corrigirTeste",
  "criarRubrica",
  "avaliarComRubrica",
  "criarCurso",
  "matricular",
  "registrarProgresso",
  "calcularProgresso",
  "emitirCertificado",
  "validarCertificado",
  "estaVencendoCertificado",
];

test("barrel exporta toda a API pública", () => {
  for (const nome of API_ESPERADA) {
    assert.equal(typeof avaliacoes[nome], "function", `falta exportar ${nome}()`);
  }
});

test("barrel exporta as constantes compartilhadas", () => {
  assert.deepEqual(FATOR_DISC.DOMINANCIA, "D");
  assert.deepEqual(ORDEM_FATORES_DISC, ["D", "I", "S", "C"]);
  assert.deepEqual(Object.values(TIPO_TESTE), [
    "MULTIPLA_ESCOLHA",
    "VERDADEIRO_FALSO",
    "NUMERICA",
    "DISSERTATIVA",
  ]);
  assert.deepEqual(Object.values(TIPO_AULA), ["VIDEO", "TEXTO", "QUIZ"]);
  assert.ok(RESSALVAS_DISC.length >= 5);
  assert.ok(Object.isFrozen(RESSALVAS_DISC));
});

test("nenhum módulo de src importa pacote externo ou nativo do Node", () => {
  // O mesmo cálculo roda no navegador: só caminho relativo do pacote ou do core.
  const pasta = new URL("../src/", import.meta.url);
  let arquivos = 0;
  for (const arquivo of readdirSync(pasta)) {
    if (!arquivo.endsWith(".js")) continue;
    arquivos += 1;
    const codigo = readFileSync(new URL(arquivo, pasta), "utf8");
    const origens = [...codigo.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    assert.ok(origens.length > 0 || arquivo === "constantes.js", `${arquivo} sem importações`);
    for (const origem of origens) {
      assert.ok(
        origem.startsWith("./") || origem.startsWith("../../core/src/"),
        `${arquivo} importa "${origem}": use caminho relativo do pacote ou do core`
      );
      assert.doesNotMatch(origem, /^node:/, `${arquivo} importa módulo nativo "${origem}"`);
    }
    assert.doesNotMatch(codigo, /\brequire\s*\(/, `${arquivo} usa require()`);
  }
  assert.ok(arquivos >= 4, `esperados ao menos 4 módulos em src, encontrados ${arquivos}`);
});
