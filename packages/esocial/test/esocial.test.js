import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EVENTOS, AMBIENTES, PendenciaError, statusIntegracao, criarTransmissor, gerarS2200, gerarS2240, transmitir, consultarLote,
  gerarS1200, gerarS2299, gerarS2220, assinarEvento, verificarAssinatura, serializar, el,
} from "../src/index.js";
import { calcularHolerite, calcularRescisao } from "../../folha/src/index.js";

const PENDENTES = [
  ["criarTransmissor", criarTransmissor],
  ["gerarS2200", gerarS2200],
  ["gerarS2240", gerarS2240],
  ["transmitir", transmitir],
  ["consultarLote", consultarLote],
];

test("o que ainda depende do certificado e do WSDL falha alto", () => {
  for (const [nome, fn] of PENDENTES) assert.throws(fn, PendenciaError, `${nome} deveria lançar PendenciaError`);
  try { transmitir(); } catch (erro) { assert.equal(erro.funcao, "transmitir"); assert.match(erro.bloqueio, /certificado A1/); }
});

test("statusIntegracao: gera e assina, não transmite", () => {
  const status = statusIntegracao();
  assert.equal(status.habilitado, false);
  assert.deepEqual(status.eventosSuportados, []);
  assert.deepEqual(status.eventosGerados, ["S-1200", "S-2220", "S-2299"]);
  assert.equal(Object.keys(status.pendencias).length, PENDENTES.length);
  assert.ok(Object.isFrozen(EVENTOS));
  assert.equal(AMBIENTES.PRODUCAO_RESTRITA, "producaoRestrita");
});

test("XML canônico: atributos em ordem, namespace primeiro, vazio aberto e fechado, escapes", () => {
  assert.equal(serializar(el("a", { b: "2", xmlns: "urn:x", Id: "1" }, el("c"), "x<&>\r")), '<a xmlns="urn:x" Id="1" b="2"><c></c>x&lt;&amp;&gt;&#xD;</a>');
});

const EMPRESA = { cnpj: "11222333000181" };
const COL = { matricula: "20048050", nome: "Pessoa Fictícia", vinculo: "TEMPORARIO", salario: 180_000, admissao: "2026-03-01", cpf: "52998224725", insalubridadeGrau: 20 };
const QUANDO = new Date(Date.UTC(2026, 9, 8, 12, 0, 0));

function eventosDeTeste() {
  return {
    evtRemun: gerarS1200({ empresa: EMPRESA, competencia: "2026-09", holerite: calcularHolerite(COL, "2026-09", { horasExtras50: 10, adiantamento: 50_000 }), codLotacao: "TOM_TESTE", quando: QUANDO }),
    evtDeslig: gerarS2299({ empresa: EMPRESA, cpf: COL.cpf, codLotacao: "TOM_TESTE", quando: QUANDO, rescisao: { matricula: COL.matricula, resultado: calcularRescisao({ colaborador: COL, desligamento: "2026-10-15", motivo: "02", avisoIndenizado: true }) } }),
    evtMonit: gerarS2220({ empresa: EMPRESA, cpf: COL.cpf, matricula: COL.matricula, quando: QUANDO, exame: { codigoESocial: "0", asoEm: "2026-02-25", resultado: "APTO", medico: { nome: "Médica Fictícia", crm: "12345/AM" } } }),
  };
}

test("assinatura: confere, acusa alteração e leva o Id oficial", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  for (const [nome, ev] of Object.entries(eventosDeTeste())) {
    const xml = assinarEvento(ev, { chavePrivada: privateKey });
    assert.match(xml, new RegExp(`<${nome} Id="ID111222333000000\\d{19}">`));
    assert.equal(verificarAssinatura(xml).valida, true, nome);
    assert.equal(verificarAssinatura(xml.replace("<cpfTrab>52998224725", "<cpfTrab>11144477735")).valida, false);
  }
  assert.throws(() => gerarS1200({ empresa: EMPRESA, competencia: "2026-09", holerite: { colaborador: { cpf: null, nome: "X" }, itens: [] }, codLotacao: "L" }), /sem CPF/);
});

const XMLLINT = spawnSync("xmllint", ["--version"]).status === 0;
test("eventos válidos pelos XSD oficiais (xmllint)", { skip: !XMLLINT && "xmllint não instalado" }, () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pasta = mkdtempSync(join(tmpdir(), "esocial-"));
  const xsd = fileURLToPath(new URL("../xsd/S-1.3-2026-11-23/", import.meta.url));
  for (const [nome, ev] of Object.entries(eventosDeTeste())) {
    const arquivo = join(pasta, `${nome}.xml`);
    writeFileSync(arquivo, assinarEvento(ev, { chavePrivada: privateKey }));
    execFileSync("xmllint", ["--noout", "--schema", join(xsd, `${nome}.xsd`), arquivo], { stdio: "pipe" });
  }
});

const OPENSSL = spawnSync("openssl", ["version"]).status === 0;
test("assinatura com certificado X.509 (de teste) no KeyInfo", { skip: !OPENSSL && "openssl não instalado" }, () => {
  const pasta = mkdtempSync(join(tmpdir(), "cert-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(pasta, "k.pem"), "-out", join(pasta, "c.pem"), "-days", "2", "-subj", "/CN=EMPRESA FICTICIA:11222333000181"], { stdio: "pipe" });
  const xml = assinarEvento(eventosDeTeste().evtMonit, { chavePrivada: readFileSync(join(pasta, "k.pem"), "utf8"), certificado: readFileSync(join(pasta, "c.pem"), "utf8") });
  const r = verificarAssinatura(xml);
  assert.equal(r.valida, true);
  assert.match(r.certificado.titular, /EMPRESA FICTICIA/);
  assert.match(xml, /<X509Certificate>[A-Za-z0-9+/=]+<\/X509Certificate>/);
});
