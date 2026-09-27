import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  desidentificarCandidato,
  desidentificarVaga,
  auditarPayload,
  assertPayloadLimpo,
  detectarPessoais,
  redigirTexto,
  verificarSaidaDesidentificada,
  ErroDadoPessoal,
} from "../src/desidentificacao.js";
import { TIPO_VIOLACAO } from "../src/constantes.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));

const CANDIDATO = {
  id: "CAND_1",
  tenantId: "demo",
  dados: { nome: "João Batista Silva", cpf: "11144477735", nascimento: "1996-04-12", genero: "M" },
  contato: {
    email: "joao.batista@exemplo.com",
    telefone: "(92) 98811-2233",
    cidade: "Manaus",
    uf: "AM",
    links: { linkedin: "https://linkedin.com/in/joao-batista" },
  },
  competencias: [{ nome: "ESD", nivel: 4 }, { nome: "Leitura de componentes eletrônicos", nivel: 4 }],
  experiencias: [
    {
      empresa: "Eldorado Componentes",
      cargo: "Operador de SMT",
      inicio: "2022-03-01",
      atual: true,
      competencias: ["ESD"],
      descricao: "Atuei na Eldorado Componentes operando linha SMT. Dúvidas: joao.batista@exemplo.com",
    },
    { empresa: "Salcomp", cargo: "Auxiliar de produção", inicio: "2020-01-15", fim: "2022-02-28" },
  ],
  formacao: [{ instituicao: "CETAM", curso: "TBO — Treinamento Básico Operacional", nivel: "MEDIO", concluido: true }],
  idiomas: [{ codigo: "EN", nivel: "BASICO" }],
  pretensaoSalarial: 250000,
  disponibilidadeInicio: "imediata",
  curriculoTexto:
    "Sou João Batista Silva, CPF 111.444.777-35, moro em Manaus. Trabalhei na Eldorado Componentes. Tel (92) 98811-2233. CEP 69075-000.",
  consentimento: { aceito: true, em: "2026-09-27", versaoTermo: "1.0" },
};

const desidentificado = desidentificarCandidato(CANDIDATO, { hoje: "2026-09-27" });

// ============================================================
// A porta de LGPD — o teste que mais importa
// ============================================================

test("o candidato bruto é barrado; o desidentificado passa", () => {
  const bruto = auditarPayload(CANDIDATO);
  assert.equal(bruto.limpo, false);
  assert.ok(bruto.violacoes.length >= 4, `esperadas várias violações, vieram ${bruto.violacoes.length}`);

  const tipos = new Set(bruto.violacoes.map((v) => v.tipo));
  assert.ok(tipos.has(TIPO_VIOLACAO.CPF));
  assert.ok(tipos.has(TIPO_VIOLACAO.EMAIL));
  assert.ok(tipos.has(TIPO_VIOLACAO.TELEFONE));
  assert.ok(tipos.has(TIPO_VIOLACAO.URL_PERFIL));
  assert.ok(tipos.has(TIPO_VIOLACAO.CEP));

  assert.throws(() => assertPayloadLimpo(CANDIDATO), ErroDadoPessoal);
  assert.equal(assertPayloadLimpo(desidentificado.texto), true);
});

test("o texto desidentificado não contém nenhum valor real", () => {
  const texto = desidentificado.texto;
  for (const segredo of [
    "João", "Batista", "Silva", "11144477735", "111.444.777-35", "joao.batista@exemplo.com",
    "98811-2233", "988112233", "Manaus", "linkedin.com", "Eldorado", "Salcomp", "CETAM", "1996-04-12", "69075-000",
  ]) {
    assert.ok(!texto.includes(segredo), `o texto ainda contém "${segredo}"`);
  }
});

test("verificarSaidaDesidentificada confirma a saída contra os literais conhecidos", () => {
  const conferido = verificarSaidaDesidentificada(desidentificado, CANDIDATO);
  assert.equal(conferido.limpo, true, JSON.stringify(conferido.violacoes));
});

test("a informação útil para julgar aderência sobrevive", () => {
  const texto = desidentificado.texto;
  assert.match(texto, /CANDIDATO/);
  // toLocaleString("pt-BR") separa "R$" do valor com U+00A0, não espaço comum
  assert.match(texto, /Pretensão salarial: R\$\s*2\.500,00/);
  assert.match(texto, /ESD \(nível 4\)/);
  assert.match(texto, /Leitura de componentes eletrônicos/);
  assert.match(texto, /Operador de SMT/);
  assert.match(texto, /Auxiliar de produção/);
  assert.match(texto, /2022-03-01 → atual/);
  assert.match(texto, /TBO — Treinamento Básico Operacional/);
  assert.match(texto, /EN · BASICO/);
  assert.match(texto, /Disponibilidade de início: imediata/);
});

test("pseudônimo é estável: mesma empresa duas vezes vira o mesmo rótulo", () => {
  const duasVezes = desidentificarCandidato({
    ...CANDIDATO,
    experiencias: [
      { empresa: "Eldorado Componentes", cargo: "Operador", inicio: "2020-01-01", fim: "2021-01-01" },
      { empresa: "ELDORADO COMPONENTES", cargo: "Técnico", inicio: "2021-02-01", atual: true },
    ],
    curriculoTexto: "",
  });
  assert.equal(duasVezes.substituicoes.EMPRESA_1, "Eldorado Componentes");
  assert.equal(duasVezes.substituicoes.EMPRESA_2, undefined);
  assert.match(duasVezes.texto, /Operador · EMPRESA_1/);
  assert.match(duasVezes.texto, /Técnico · EMPRESA_1/);
});

test("o mapeamento de volta fica fora do texto enviável", () => {
  assert.equal(typeof desidentificado.texto, "string");
  assert.ok(!desidentificado.texto.includes("EMPRESA_1= "));
  // substituições é um objeto separado, que nunca vai no payload
  assert.equal(desidentificado.substituicoes.EMPRESA_1, "Eldorado Componentes");
  assert.equal(desidentificado.substituicoes.INSTITUICAO_1, "CETAM");
  assert.doesNotMatch(JSON.stringify({ texto: desidentificado.texto }), /Eldorado|CETAM/);
});

test("camposRemovidos declara o que saiu", () => {
  for (const campo of ["dados.nome", "dados.cpf", "contato.email", "contato.telefone", "contato.cidade", "contato.links"]) {
    assert.ok(desidentificado.camposRemovidos.includes(campo), `${campo} deveria constar como removido`);
  }
});

test("empresa citada dentro de texto livre também é redigida", () => {
  // nenhum regex pega nome de empregador; só o literal conhecido
  const r = desidentificarCandidato({
    ...CANDIDATO,
    curriculoTexto: "",
    experiencias: [{ empresa: "Flextronics", cargo: "Técnico", inicio: "2021-01-01", atual: true, descricao: "Atuei na Flextronics com linha SMT" }],
  });
  assert.doesNotMatch(r.texto, /Flextronics/i);
  assert.match(r.texto, /Atuei na \[removido\] com linha SMT/);
});

test("desidentificarCandidato exige o candidato", () => {
  assert.throws(() => desidentificarCandidato(null), /exige o candidato/);
});

// ============================================================
// Detectores
// ============================================================

test("CPF só é flagged quando o dígito verificador confirma", () => {
  assert.equal(detectarPessoais("CPF 111.444.777-35").length, 1);
  assert.equal(detectarPessoais("CPF 11144477735")[0].tipo, TIPO_VIOLACAO.CPF);
  // 11 dígitos quaisquer não são CPF
  assert.equal(detectarPessoais("pedido 12345678901").length, 0);
  assert.equal(detectarPessoais("11111111111").length, 0);
});

test("detecta e-mail, telefone, CEP e URL de perfil", () => {
  assert.equal(detectarPessoais("fale com ana@exemplo.com.br")[0].tipo, TIPO_VIOLACAO.EMAIL);
  assert.equal(detectarPessoais("ligar (92) 98811-2233")[0].tipo, TIPO_VIOLACAO.TELEFONE);
  assert.equal(detectarPessoais("CEP 69075-000")[0].tipo, TIPO_VIOLACAO.CEP);
  assert.equal(detectarPessoais("veja linkedin.com/in/fulano")[0].tipo, TIPO_VIOLACAO.URL_PERFIL);
});

test("data de nascimento só é flagged com contexto, não qualquer data", () => {
  assert.equal(detectarPessoais("Nascimento: 12/04/1996")[0].tipo, TIPO_VIOLACAO.DATA_NASCIMENTO);
  // data de emprego não é dado sensível do mesmo jeito e não pode virar ruído
  assert.equal(detectarPessoais("Contratado em 12/04/1996").length, 0);
});

test("nome próprio exige inicial maiúscula — cor e advérbio não viram violação", () => {
  assert.equal(detectarPessoais("A candidata Maria informou")[0].tipo, TIPO_VIOLACAO.NOME_PROPRIO);
  assert.equal(detectarPessoais("camisa rosa e pessoa vera").length, 0);
});

test("detector de nome é heurístico e tem falso negativo — documentado, não escondido", () => {
  // "Batista" e "Silva" não estão na lista de prenomes: só o literal conhecido pega
  assert.equal(detectarPessoais("Sr. Batista da Silva").length, 0);
  const comLiteral = auditarPayload("Sr. Batista da Silva", { sensiveis: ["Batista da Silva"] });
  assert.equal(comLiteral.limpo, false);
  assert.equal(comLiteral.violacoes[0].tipo, TIPO_VIOLACAO.DOCUMENTO);
});

test("auditarPayload percorre objeto e array e reporta o caminho", () => {
  const r = auditarPayload({ a: { b: [{ c: "fale com ana@exemplo.com" }] } });
  assert.equal(r.limpo, false);
  assert.equal(r.violacoes[0].caminho, "$.a.b[0].c");
  assert.equal(r.violacoes[0].tipo, TIPO_VIOLACAO.EMAIL);
});

test("auditarPayload não duplica a mesma violação", () => {
  const r = auditarPayload({ x: "ana@exemplo.com", y: "ana@exemplo.com" });
  assert.equal(r.violacoes.length, 2);
  assert.equal(auditarPayload(["ana@exemplo.com", "ana@exemplo.com"]).violacoes.length, 2);
  assert.equal(auditarPayload("ana@exemplo.com ana@exemplo.com").violacoes.length, 1);
});

test("auditarPayload aceita valor limpo e vazio", () => {
  assert.equal(auditarPayload({ competencia: "Node.js", nivel: 4 }).limpo, true);
  assert.equal(auditarPayload(null).limpo, true);
  assert.equal(auditarPayload(42).limpo, true);
});

test("assertPayloadLimpo lista as violações no erro", () => {
  try {
    assertPayloadLimpo({ cpf: "11144477735", email: "a@b.com.br" });
    assert.fail("deveria ter lançado");
  } catch (erro) {
    assert.equal(erro.name, "ErroDadoPessoal");
    assert.ok(erro.violacoes.length >= 2);
    assert.match(erro.message, /LGPD art\. 33/);
    assert.match(erro.message, /Singapura/);
  }
});

test("redigirTexto substitui e preserva o resto", () => {
  const r = redigirTexto("Contato ana@exemplo.com, competência Node.js nível 4.");
  assert.equal(r.texto, "Contato [removido], competência Node.js nível 4.");
  assert.equal(r.encontrados.length, 1);
});

test("redigirTexto aplica literais conhecidos", () => {
  const r = redigirTexto("trabalhei na Eldorado e na ELDORADO", { sensiveis: ["Eldorado"] });
  assert.equal(r.texto, "trabalhei na [removido] e na [removido]");
});

test("desidentificarVaga remove a empresa e mantém o que serve ao juízo", () => {
  const r = desidentificarVaga({
    id: "VAGA_1", titulo: "Operador de Produção", tenantId: "acme",
    local: { modelo: "PRESENCIAL", cidade: "Manaus", uf: "AM", endereco: "Av. Brasil, 100", cep: "69075-000" },
    tipoContrato: "CLT", nivel: "Operacional", area: "Produção",
    salario: { min: 220000, max: 280000, exibir: true },
    requisitos: ["TBO", "NR-12 vigente"],
    competencias: [{ nome: "ESD", peso: 3, obrigatoria: true, nivelMinimo: 3 }],
    formacaoMinima: 2, recrutadorId: "U_1",
  });
  assert.match(r.texto, /Modalidade: PRESENCIAL/);
  assert.match(r.texto, /Local: Manaus\/AM/);
  assert.match(r.texto, /ESD \(peso 3, obrigatória, nível mínimo 3\)/);
  assert.doesNotMatch(r.texto, /Av\. Brasil/);
  assert.doesNotMatch(r.texto, /69075-000/);
  assert.doesNotMatch(r.texto, /U_1/);
  assert.doesNotMatch(r.texto, /acme/);
});
