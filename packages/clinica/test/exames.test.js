import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TIPO_EXAME, RESULTADO_ASO, proximoPeriodico, exigeExameDeRetorno, exameDemissional, proximaAudiometria, exigeToxicologico } from "../src/index.js";

test("códigos dos tipos de exame são os do eSocial (S-2220, tpExameOcup)", () => {
  const xsd = readFileSync(new URL("../../esocial/xsd/S-1.3-2026-12-14/evtMonit.xsd", import.meta.url), "utf8");
  const bloco = /name="tpExameOcup"([\s\S]*?)<\/xs:element>/.exec(xsd)[1];
  const codigos = [...bloco.matchAll(/<xs:enumeration value="(\d)"/g)].map((m) => m[1]);
  assert.deepEqual(Object.values(TIPO_EXAME).map((t) => t.codigo).sort(), codigos.sort());
  const resultados = [.../name="resAso"[\s\S]*?<\/xs:element>/.exec(readFileSync(new URL("../../esocial/xsd/S-1.3-2026-12-14/evtMonit.xsd", import.meta.url), "utf8"))[0].matchAll(/value="(\d)"/g)].map((m) => m[1]);
  assert.deepEqual(Object.values(RESULTADO_ASO).sort(), resultados.sort());
});

test("periódico: anual com risco ou doença crônica, a cada 2 anos nos demais", () => {
  assert.equal(proximoPeriodico("2026-03-10", { expostoARisco: true }), "2027-03-10");
  assert.equal(proximoPeriodico("2026-03-10", { doencaCronica: true }), "2027-03-10");
  assert.equal(proximoPeriodico("2026-03-10"), "2028-03-10");
  assert.equal(proximoPeriodico("2026-03-10", { expostoARisco: true, mesesACriterioMedico: 6 }), "2026-09-10");
});

test("retorno ao trabalho a partir de 30 dias de afastamento por doença ou acidente", () => {
  assert.equal(exigeExameDeRetorno({ inicioAfastamento: "2026-08-01", fimAfastamento: "2026-08-30", motivo: "DOENCA" }), true);
  assert.equal(exigeExameDeRetorno({ inicioAfastamento: "2026-08-01", fimAfastamento: "2026-08-29", motivo: "DOENCA" }), false);
  assert.equal(exigeExameDeRetorno({ inicioAfastamento: "2026-01-01", fimAfastamento: "2026-04-30", motivo: "FERIAS" }), false);
});

test("demissional: 10 dias de prazo e dispensa pelo grau de risco", () => {
  const baixo = exameDemissional({ fimDoContrato: "2026-09-30", ultimoExameClinico: "2026-06-01", grauDeRisco: 2 });
  assert.equal(baixo.dispensavel, true);
  assert.equal(baixo.prazoAte, "2026-10-10");
  const alto = exameDemissional({ fimDoContrato: "2026-09-30", ultimoExameClinico: "2026-06-01", grauDeRisco: 3 });
  assert.equal(alto.dispensavel, false);
  assert.equal(exameDemissional({ fimDoContrato: "2026-09-30", grauDeRisco: 1 }).dispensavel, false);
});

test("audiometria: admissão, 6 meses, depois anual", () => {
  assert.equal(proximaAudiometria({ admissao: "2026-02-02" }), "2026-02-02");
  assert.equal(proximaAudiometria({ admissao: "2026-02-02", ultimaAudiometria: "2026-02-02" }), "2026-08-02");
  assert.equal(proximaAudiometria({ admissao: "2026-02-02", ultimaAudiometria: "2026-08-02" }), "2027-08-02");
});

test("toxicológico só para motorista profissional com CNH C, D ou E", () => {
  assert.equal(exigeToxicologico({ motoristaProfissional: true, categoriaCNH: "D" }), true);
  assert.equal(exigeToxicologico({ motoristaProfissional: true, categoriaCNH: "B" }), false);
  assert.equal(exigeToxicologico({ motoristaProfissional: false, categoriaCNH: "E" }), false);
});
