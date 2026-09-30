/**
 * Importação dos colaboradores do sistema anterior, por planilha (CSV com ";", como os
 * sistemas de folha exportam). Primeiro valida e mostra o que entra; só grava na confirmação.
 *
 * Colunas (cabeçalho, em qualquer ordem): cpf; nome; nascimento; vinculo; admissao; cargo; cbo;
 * salario; dependentes_ir; matricula_anterior; tomador_cnpj; setor
 */
import { validarPessoa } from "./pessoas.js";
import { TIPO_VINCULO } from "../../mao-de-obra/src/constantes.js";
import { normalizarCNPJ } from "../../core/src/validacao.js";

const VINCULOS = { TEMPORARIO: TIPO_VINCULO.TEMPORARIO, TEMPORÁRIO: TIPO_VINCULO.TEMPORARIO, TERCEIRIZADO: TIPO_VINCULO.TERCEIRIZADO, PROPRIO: TIPO_VINCULO.PROPRIO, PRÓPRIO: TIPO_VINCULO.PROPRIO };
const data = (s) => {
  const t = String(s ?? "").trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
};
const centavos = (s) => {
  const t = String(s ?? "").trim().replace(/[R$\s]/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

export function lerPlanilhaColaboradores(texto) {
  const linhas = String(texto ?? "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return { linhas: [], erros: [{ linha: 1, erros: ["planilha vazia: precisa do cabeçalho e de ao menos uma linha"] }] };
  const cab = linhas[0].split(";").map((c) => c.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_"));
  const faltam = ["nome", "vinculo", "admissao", "cargo", "salario"].filter((c) => !cab.includes(c));
  if (faltam.length) return { linhas: [], erros: [{ linha: 1, erros: [`colunas obrigatórias ausentes: ${faltam.join(", ")}`] }] };

  const saida = [];
  const erros = [];
  const cpfsVistos = new Map();
  linhas.slice(1).forEach((linha, i) => {
    const n = i + 2;
    const col = Object.fromEntries(cab.map((c, j) => [c, (linha.split(";")[j] ?? "").trim()]));
    const e = [];
    const p = validarPessoa({ cpf: col.cpf || null, nome: col.nome, nascimento: data(col.nascimento) ?? undefined });
    e.push(...p.erros);
    const tipo = VINCULOS[String(col.vinculo).toUpperCase()];
    if (!tipo) e.push(`vínculo "${col.vinculo}" inválido (temporário, terceirizado ou próprio)`);
    const admissao = data(col.admissao);
    if (!admissao) e.push("admissão inválida (use DD/MM/AAAA)");
    const salario = centavos(col.salario);
    if (!salario) e.push("salário inválido");
    const tomadorCnpj = col.tomador_cnpj ? normalizarCNPJ(col.tomador_cnpj) : null;
    if (tipo && tipo !== TIPO_VINCULO.PROPRIO && !tomadorCnpj) e.push("temporário e terceirizado precisam do CNPJ do tomador");
    if (tipo === TIPO_VINCULO.PROPRIO && !col.setor) e.push("próprio precisa do setor");
    if (p.pessoa.cpf) {
      if (cpfsVistos.has(p.pessoa.cpf) && cpfsVistos.get(p.pessoa.cpf) !== p.pessoa.nome) e.push(`CPF repetido com outro nome (linha ${[...cpfsVistos.keys()].indexOf(p.pessoa.cpf) + 2})`);
      cpfsVistos.set(p.pessoa.cpf, p.pessoa.nome);
    }
    if (e.length) return erros.push({ linha: n, nome: col.nome, erros: e });
    saida.push({
      linha: n,
      pessoa: p.pessoa,
      avisos: p.avisos,
      vinculo: {
        tipo, admissao, cargo: col.cargo, cbo: col.cbo || null, salario,
        sindicatoCnpj: col.sindicato_cnpj ? normalizarCNPJ(col.sindicato_cnpj) : null,
        matriculaAnterior: col.matricula_anterior || null,
        dependentesIRImportados: Number(col.dependentes_ir || 0),
        tomadorCnpj, setor: col.setor || null,
      },
    });
  });
  return { linhas: saida, erros };
}
