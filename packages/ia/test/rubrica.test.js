import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { criarRubrica, compararComTriagem, scoreDeterministicoComparavel } from "../src/rubrica.js";
import { promptMatching, promptAnuncioVaga, promptParecer, regrasDeSaida } from "../src/prompts.js";
import { CARACTERISTICAS_PROTEGIDAS, PALAVRAS_DE_REPROVACAO } from "../src/constantes.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));

const VAGA_OPERADOR = {
  id: "VAGA_1",
  titulo: "Operador de Produção",
  competencias: [
    { nome: "ESD", peso: 3, obrigatoria: true, nivelMinimo: 3 },
    { nome: "Leitura de componentes eletrônicos", peso: 3, obrigatoria: true, nivelMinimo: 3 },
    { nome: "5S", peso: 1, nivelMinimo: 2 },
    { nome: "Metrologia básica", peso: 2, nivelMinimo: 2 },
  ],
  formacaoMinima: 2,
  regrasTriagem: { experienciaAnosMinimos: 1 },
};

const VAGA_TECNICO = {
  id: "VAGA_2",
  titulo: "Técnico em Eletroeletrônica",
  competencias: [
    { nome: "NR-10", peso: 3, obrigatoria: true, nivelMinimo: 4 },
    { nome: "SMT", peso: 3, obrigatoria: true, nivelMinimo: 3 },
    { nome: "IPC-A-610", peso: 2, nivelMinimo: 3 },
    { nome: "Automação industrial", peso: 2, nivelMinimo: 3 },
  ],
  formacaoMinima: 3,
  idiomas: [{ codigo: "EN", nivel: "INTERMEDIARIO" }],
  regrasTriagem: { experienciaAnosMinimos: 3 },
};

const TRIAGEM = {
  decisao: "APROVADO_AUTOMATICO",
  score: {
    total: 92,
    pesos: { competencias: 40, experiencia: 25, formacao: 15, idiomas: 10, localizacao: 10 },
    componentes: {
      competencias: { score: 100 },
      experiencia: { score: 100 },
      formacao: { score: 100 },
      idiomas: { score: 100 },
      localizacao: { score: 10 },
    },
  },
};

// ============================================================
// Rubrica
// ============================================================

test("criarRubrica deriva critérios da vaga com pesos alinhados à triagem", () => {
  const r = criarRubrica(VAGA_OPERADOR);
  assert.equal(r.criterios.length, 6); // 4 competências + experiência + formação
  assert.deepEqual(r.criterios.filter((c) => c.tipo === "competencia").map((c) => c.id), [
    "comp-esd", "comp-leitura-de-componentes-eletronicos", "comp-5s", "comp-metrologia-basica",
  ]);
  assert.ok(r.criterios.some((c) => c.id === "experiencia"));
  assert.ok(r.criterios.some((c) => c.id === "formacao"));
  assert.match(r.criterios.find((c) => c.id === "experiencia").descricao, /ao menos 1 ano/);
});

test("os pesos das competências somam o peso de competências da triagem", () => {
  const r = criarRubrica(VAGA_OPERADOR);
  const soma = r.criterios.filter((c) => c.tipo === "competencia").reduce((s, c) => s + c.peso, 0);
  // arredondar cada peso a 3 casas deixa deriva de milésimos; o que importa é
  // que a proporção entre competências e o total estejam certos
  assert.ok(Math.abs(soma - 40) < 0.01, `soma deu ${soma}, esperado ~40`);
  assert.equal(r.criterios.find((c) => c.id === "experiencia").peso, 25);
  assert.equal(r.criterios.find((c) => c.id === "formacao").peso, 15);
  assert.ok(Math.abs(r.totalPesos - 80) < 0.01);
});

test("competência obrigatória vem marcada como obrigatória", () => {
  const r = criarRubrica(VAGA_OPERADOR);
  assert.equal(r.criterios.find((c) => c.id === "comp-esd").obrigatorio, true);
  assert.equal(r.criterios.find((c) => c.id === "comp-5s").obrigatorio, false);
  assert.equal(r.criterios.find((c) => c.id === "comp-esd").nivelEsperado, 3);
});

test("idiomas entram na rubrica quando a vaga exige", () => {
  const r = criarRubrica(VAGA_TECNICO);
  const idiomas = r.criterios.filter((c) => c.tipo === "idioma");
  assert.equal(idiomas.length, 1);
  assert.equal(idiomas[0].id, "idioma-en");
  assert.equal(idiomas[0].peso, 10);
  assert.equal(r.totalPesos, 90);
});

test("localização nunca vira critério: ela é removida na desidentificação", () => {
  for (const vaga of [VAGA_OPERADOR, VAGA_TECNICO]) {
    const r = criarRubrica(vaga);
    assert.equal(r.criterios.some((c) => c.tipo === "localizacao"), false);
    assert.equal(r.cobreLocalizacao, false);
    assert.match(r.nota, /scoreDeterministicoComparavel/);
  }
});

test("vaga sem formação mínima e sem competência ainda produz rubrica utilizável", () => {
  const r = criarRubrica({ id: "V", titulo: "Simples" });
  assert.equal(r.criterios.length, 1);
  assert.equal(r.criterios[0].id, "experiencia");
  assert.equal(r.criterios[0].descricao.includes("ao menos"), false);
});

test("criarRubrica exige a vaga", () => {
  assert.throws(() => criarRubrica(null), /exige a vaga/);
});

// ============================================================
// Comparação IA × regra determinística
// ============================================================

test("scoreDeterministicoComparavel exclui localização para a comparação ser justa", () => {
  // localizacao=10 derruba score.total para 92; sem ela, a base é 100
  assert.equal(TRIAGEM.score.total, 92);
  assert.equal(scoreDeterministicoComparavel(TRIAGEM), 100);
});

test("comparar sem excluir localização criaria divergência fantasma", () => {
  const ia = { ok: true, score: 100, componentes: [], motivo: null, divergenciaScoreModelo: null };
  const ingenuo = Math.abs(ia.score - TRIAGEM.score.total);
  const correto = compararComTriagem({ ia, deterministico: TRIAGEM });

  assert.equal(ingenuo, 8, "comparar com score.total geraria 8 pontos de divergência inexistente");
  assert.equal(correto.divergencia, 0);
  assert.equal(correto.baseComparavel, 100);
  assert.equal(correto.exigirRevisaoHumana, false);
  assert.equal(correto.decisaoDeterministica, "APROVADO_AUTOMATICO");
});

test("divergência acima do limite exige revisão humana", () => {
  const ia = { ok: true, score: 60, componentes: [], motivo: null, divergenciaScoreModelo: null };
  const r = compararComTriagem({ ia, deterministico: TRIAGEM });
  assert.equal(r.divergencia, 40);
  assert.equal(r.exigirRevisaoHumana, true);
  assert.ok(r.motivos.some((m) => /divergência de 40/.test(m)));
});

test("o limite é configurável", () => {
  const ia = { ok: true, score: 85, componentes: [], motivo: null, divergenciaScoreModelo: null };
  assert.equal(compararComTriagem({ ia, deterministico: TRIAGEM, limite: 20 }).exigirRevisaoHumana, false);
  assert.equal(compararComTriagem({ ia, deterministico: TRIAGEM, limite: 10 }).exigirRevisaoHumana, true);
});

test("resposta não verificada exige revisão mesmo sem divergência", () => {
  const ia = {
    ok: true, score: 100, motivo: null, divergenciaScoreModelo: null,
    componentes: [{ id: "comp-esd", nota: 5, peso: 20, evidenciaVerificada: false, naoVerificado: true }],
  };
  const r = compararComTriagem({ ia, deterministico: TRIAGEM });
  assert.equal(r.divergencia, 0);
  assert.equal(r.exigirRevisaoHumana, true);
  assert.ok(r.motivos.some((m) => /evidência não confirmada/.test(m)));
});

test("falha na interpretação exige revisão", () => {
  const ia = { ok: false, score: null, motivo: "JSON truncado", componentes: [], divergenciaScoreModelo: null };
  const r = compararComTriagem({ ia, deterministico: TRIAGEM });
  assert.equal(r.exigirRevisaoHumana, true);
  assert.equal(r.scoreIA, null);
  assert.ok(r.motivos.some((m) => /JSON truncado/.test(m)));
});

test("score global do modelo divergente do recalculado exige revisão", () => {
  const ia = { ok: true, score: 100, motivo: null, componentes: [], divergenciaScoreModelo: 45 };
  const r = compararComTriagem({ ia, deterministico: TRIAGEM });
  assert.equal(r.exigirRevisaoHumana, true);
  assert.ok(r.motivos.some((m) => /diverge 45 pontos/.test(m)));
});

test("compararComTriagem exige os dois lados", () => {
  assert.throws(() => compararComTriagem({ deterministico: TRIAGEM }), /exige o resultado da IA/);
  assert.throws(() => compararComTriagem({ ia: { score: 1 } }), /triagem determinística/);
});

// ============================================================
// Prompts
// ============================================================

test("prompt de matching exige JSON puro e proíbe decidir", () => {
  const p = promptMatching({ vagaTexto: "Vaga X", candidatoTexto: "CANDIDATO", criterios: [{ id: "a", descricao: "d", peso: 1 }] });
  assert.match(p.system, /SOMENTE com o objeto JSON/);
  assert.match(p.system, /NÃO decide contratação/);
  assert.match(p.system, /Não calcule um score global/);
  assert.match(p.user, /já desidentificado/);
  assert.match(p.user, /id: a \| d \| peso 1/);
});

test("todos os prompts proíbem inferir característica protegida", () => {
  const prompts = [
    promptMatching({ vagaTexto: "v", candidatoTexto: "c", criterios: [{ id: "a", descricao: "d", peso: 1 }] }),
    promptAnuncioVaga({ dados: { titulo: "Operador" } }),
    promptParecer({ candidatoTexto: "c" }),
  ];
  for (const p of prompts) {
    assert.match(p.system, /proibido|Proibido/i);
    for (const caracteristica of ["raça", "gênero", "idade", "deficiência", "religião", "gravidez"]) {
      assert.ok(p.system.includes(caracteristica), `prompt deveria citar "${caracteristica}"`);
    }
  }
});

test("prompt de parecer proíbe veredito e exige as ressalvas da LGPD", () => {
  const p = promptParecer({ candidatoTexto: "c", componentes: [{ id: "a", nota: 4, evidencia: "x" }] });
  assert.match(p.system, /Não recomenda contratar nem rejeitar/);
  assert.match(p.system, /LGPD art\. 20/);
  assert.match(p.system, /perguntas concretas para a entrevista/);
});

test("prompt de anúncio proíbe os termos que auditarAnuncio barra", () => {
  const p = promptAnuncioVaga({ dados: { titulo: "Operador", requisitos: ["NR-12"] } });
  for (const termo of ["boa aparência", "apenas mulheres", "até X anos", "sem filhos"]) {
    assert.ok(p.system.includes(termo), `prompt deveria vedar "${termo}"`);
  }
  assert.match(p.user, /NR-12/);
});

test("prompts validam as entradas obrigatórias", () => {
  assert.throws(() => promptMatching({ candidatoTexto: "c", criterios: [{ id: "a" }] }), /exige vagaTexto/);
  assert.throws(() => promptMatching({ vagaTexto: "v", criterios: [{ id: "a" }] }), /exige candidatoTexto/);
  assert.throws(() => promptMatching({ vagaTexto: "v", candidatoTexto: "c", criterios: [] }), /ao menos um critério/);
  assert.throws(() => promptAnuncioVaga({ dados: {} }), /exige dados\.titulo/);
  assert.throws(() => promptParecer({}), /exige candidatoTexto/);
});

test("regrasDeSaida devolve as restrições fixas que o transporte deve anexar", () => {
  const regras = regrasDeSaida();
  assert.ok(regras.length >= 6);
  assert.ok(regras.some((r) => /quem decide é uma pessoa/.test(r)));
  assert.ok(regras.some((r) => CARACTERISTICAS_PROTEGIDAS.some((c) => r.includes(c))));
});

test("a lista de palavras de reprovação cobre os verbos de decisão", () => {
  for (const palavra of ["reprovado", "eliminar", "descartar", "não contratar", "desqualificado", "rejeitar", "inapto"]) {
    assert.ok(PALAVRAS_DE_REPROVACAO.includes(palavra), `faltou "${palavra}"`);
  }
});

// ============================================================
// Pureza do pacote
// ============================================================

test("nenhum módulo importa dependência externa, node: ou API de sistema", () => {
  const diretorio = path.resolve(AQUI, "../src");
  const arquivos = readdirSync(diretorio).filter((f) => f.endsWith(".js"));
  assert.ok(arquivos.length >= 5, `esperados ao menos 5 módulos, vieram ${arquivos.length}`);

  const proibidos = [];
  for (const arquivo of arquivos) {
    const fonte = readFileSync(path.join(diretorio, arquivo), "utf8");
    for (const m of fonte.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s*["']([^"']+)["']/g)) {
      const alvo = m[1];
      if (alvo.startsWith(".")) continue;
      if (alvo.startsWith("node:")) { proibidos.push(`${arquivo}: ${alvo} (Node builtin)`); continue; }
      if (["fs", "path", "crypto", "os", "http", "https", "url"].includes(alvo)) {
        proibidos.push(`${arquivo}: ${alvo} (Node builtin sem prefixo)`);
        continue;
      }
      if (!alvo.startsWith("../../")) proibidos.push(`${arquivo}: ${alvo} (specifier externo)`);
    }
    if (/\brequire\s*\(/.test(fonte)) proibidos.push(`${arquivo}: require() — pacote é ESM`);
    if (/\b(fetch|XMLHttpRequest)\s*\(/.test(fonte)) proibidos.push(`${arquivo}: chamada de rede — transporte pertence ao server`);
  }

  assert.deepEqual(proibidos, [], `import ou API proibida:\n${proibidos.join("\n")}`);
});

test("o barrel exporta a superfície pública completa", async () => {
  const ia = await import("../src/index.js");
  for (const nome of [
    "desidentificarCandidato", "desidentificarVaga", "auditarPayload", "assertPayloadLimpo",
    "detectarPessoais", "redigirTexto", "verificarSaidaDesidentificada", "ErroDadoPessoal",
    "promptMatching", "promptAnuncioVaga", "promptParecer", "regrasDeSaida",
    "extrairJson", "interpretarMatching", "interpretarParecer", "interpretarAnuncio",
    "criarRubrica", "compararComTriagem", "scoreDeterministicoComparavel",
    "TIPO_VIOLACAO", "PLACEHOLDER", "NOMES_COMUNS", "CARACTERISTICAS_PROTEGIDAS", "PALAVRAS_DE_REPROVACAO",
  ]) {
    assert.ok(nome in ia, `barrel não exporta ${nome}`);
  }
});
