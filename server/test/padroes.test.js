/**
 * Guarda automática dos padrões do produto (docs/15-padroes.md).
 * Se este teste falhar, o texto novo usa um termo, formato ou nome de norma fora do
 * padrão: troque pelo termo indicado na mensagem em vez de afrouxar a regra.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));

function arquivos(dir, extensoes) {
  const saida = [];
  for (const nome of readdirSync(join(RAIZ, dir))) {
    const caminho = join(RAIZ, dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(relative(RAIZ, caminho), extensoes));
    else if (extensoes.includes(extname(nome))) saida.push(caminho);
  }
  return saida;
}

/** Linhas de código sem comentários de linha e de bloco (o que vira texto na tela). */
function linhasDeCodigo(caminho) {
  const linhas = readFileSync(caminho, "utf8").split("\n");
  let emBloco = false;
  return linhas.map((texto, i) => {
    let t = texto;
    if (emBloco) {
      if (!t.includes("*/")) return { n: i + 1, t: "" };
      t = t.slice(t.indexOf("*/") + 2);
      emBloco = false;
    }
    if (/^\s*(\/\/|\*)/.test(t)) return { n: i + 1, t: "" };
    if (t.includes("/*") && !t.includes("*/")) {
      emBloco = true;
      t = t.slice(0, t.indexOf("/*"));
    }
    return { n: i + 1, t: t.replace(/\s\/\/\s.*$/, "") };
  });
}

const palavra = (p) => new RegExp(`(?<![\\p{L}\\d_])${p}(?![\\p{L}\\d_])`, "iu");

/** Termo fora do padrão → termo do glossário. Espelha a seção 2 de docs/15-padroes.md. */
const GLOSSARIO = [
  [palavra("clientes?"), "tomador (empresa que recebe os colaboradores)"],
  [palavra("trabalhador(?:es|a|as)?"), "colaborador"],
  [palavra("funcion[aá]ri[oa]s?"), "colaborador"],
  [palavra("empregad[oa]s?"), "colaborador"],
  [palavra("rubricas?"), "verba (\"rubrica\" só no código do eSocial)"],
];

/** Rótulos de ação: um verbo por ação em toda a interface. Sensível a maiúsculas (rótulos). */
const ACOES = [
  [/(?<![\p{L}])Gravar(?![\p{L}])/u, "Salvar"],
  [/(?<![\p{L}])(Apagar|Remover|Deletar)(?![\p{L}])/u, "Excluir"],
];

/** Nomes oficiais (programas, leis) ficam como o governo escreve — docs/15, seção 2. */
const NOMES_OFICIAIS = [/Crédito do Trabalhador/g];

// Fontes de texto que o usuário lê: telas e rótulos do catálogo de acesso.
const FONTES_DE_TELA = [
  ...arquivos("web", [".js", ".html"]),
  ...arquivos("packages/acesso/src", [".js"]),
];

test("textos de tela usam só os termos do glossário", () => {
  const achados = [];
  for (const caminho of FONTES_DE_TELA) {
    for (const { n, t: bruto } of linhasDeCodigo(caminho)) {
      const t = NOMES_OFICIAIS.reduce((s, nome) => s.replace(nome, ""), bruto);
      for (const [regra, certo] of [...GLOSSARIO, ...ACOES]) {
        const m = regra.exec(t);
        if (m) achados.push(`${relative(RAIZ, caminho)}:${n} usa "${m[0]}" — use "${certo}"`);
      }
    }
  }
  assert.deepEqual(achados, [], `\n${achados.join("\n")}`);
});

test("telas formatam valores e datas só pelas funções de web/app/ui.js", () => {
  const achados = [];
  for (const caminho of arquivos("web", [".js"])) {
    if (caminho.endsWith(join("app", "ui.js"))) continue;
    for (const { n, t } of linhasDeCodigo(caminho)) {
      if (/toLocale(Date|Time)?String\(|Intl\.(NumberFormat|DateTimeFormat)/.test(t)) {
        achados.push(`${relative(RAIZ, caminho)}:${n} formata por conta própria — use moeda(), data() ou dataHora() de ui.js`);
      }
    }
  }
  assert.deepEqual(achados, [], `\n${achados.join("\n")}`);
});

test("dia civil sai sempre de core/datas.js, no fuso da empresa", () => {
  const achados = [];
  const fontes = [...arquivos("packages", [".js"]), ...arquivos("server/src", [".js"])].filter(
    (c) => !c.includes(`${join("test", "")}`) && !c.includes("node_modules") && !c.endsWith(join("core", "src", "datas.js"))
  );
  for (const caminho of fontes) {
    for (const { n, t } of linhasDeCodigo(caminho)) {
      if (/toISOString\(\)\.slice\(0,\s*10\)|T\d{2}:\d{2}:\d{2}[+-]0[345]:00/.test(t)) {
        achados.push(`${relative(RAIZ, caminho)}:${n} deriva o dia em UTC ou fixa o fuso — use hoje() ou dataNoFuso()`);
      }
    }
  }
  assert.deepEqual(achados, [], `\n${achados.join("\n")}`);
});

test("normas citadas sempre pelo mesmo nome", () => {
  const NOMES = [
    [/Portaria\s+(MTE\s+)?(n[ºo°.]\s*)?671(?!\/2021)|Portaria\s+MTE\s+671/, "Portaria MTP 671/2021"],
    [/Lei\s+(n[ºo°.]\s*)?6\.?019(?!\/1974)/, "Lei 6.019/1974"],
  ];
  const achados = [];
  const fontes = [...arquivos("docs", [".md"]), ...arquivos("web", [".js", ".html"]), join(RAIZ, "README.md")];
  for (const caminho of fontes) {
    readFileSync(caminho, "utf8").split("\n").forEach((t, i) => {
      for (const [regra, certo] of NOMES) {
        const m = regra.exec(t);
        if (m) achados.push(`${relative(RAIZ, caminho)}:${i + 1} cita "${m[0]}" — use "${certo}"`);
      }
    });
  }
  assert.deepEqual(achados, [], `\n${achados.join("\n")}`);
});
