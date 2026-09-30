/**
 * Pessoa: uma por CPF, para a vida toda (docs/15, seção 7.1). O CPF é o código do trabalhador;
 * enquanto não é informado, a pessoa existe com a pendência "CPF não informado".
 */
import { validarCPF, validarEmail, somenteDigitos } from "../../core/src/validacao.js";
import { validarDataISO } from "../../core/src/validacao.js";
import { anosCompletosEntre, paraISO } from "../../core/src/datas.js";

export const PARENTESCO = Object.freeze({
  CONJUGE: "Cônjuge ou companheiro(a)",
  FILHO: "Filho(a) ou enteado(a)",
  TUTELADO: "Menor sob guarda ou tutela",
  PAI_MAE: "Pai ou mãe",
  OUTRO: "Outro",
});

const dataOk = (d) => validarDataISO(d).valido;

export function validarPessoa(p = {}) {
  const erros = [];
  const avisos = [];
  const nome = String(p.nome ?? "").trim().replace(/\s+/g, " ");
  if (nome.split(" ").length < 2) erros.push("nome completo obrigatório (nome e sobrenome)");
  let cpf = null;
  if (p.cpf) {
    const v = validarCPF(p.cpf);
    if (!v.valido) erros.push(`CPF inválido: ${v.motivo}`);
    else cpf = v.digitos;
  } else avisos.push("CPF não informado: obrigatório para enviar ao eSocial");
  if (p.nascimento && !dataOk(p.nascimento)) erros.push("data de nascimento inválida");
  if (p.email && !validarEmail(p.email).valido) erros.push("e-mail inválido");
  if (p.estrangeiro && !p.documentoEstrangeiro) avisos.push("estrangeiro sem RNM/CRNM informado");

  const dependentes = [];
  for (const [i, d] of (p.dependentes ?? []).entries()) {
    const r = validarDependente(d);
    for (const e of r.erros) erros.push(`dependente ${i + 1}: ${e}`);
    for (const a of r.avisos) avisos.push(`dependente ${i + 1}: ${a}`);
    dependentes.push(r.dependente);
  }

  const banco = p.banco
    ? { banco: somenteDigitos(p.banco.banco).padStart(3, "0").slice(-3), agencia: somenteDigitos(p.banco.agencia), conta: String(p.banco.conta ?? "").trim(), pix: p.banco.pix ?? null }
    : null;

  return {
    ok: erros.length === 0,
    erros,
    avisos,
    pessoa: {
      ...p,
      nome,
      cpf,
      telefone: p.telefone ? somenteDigitos(p.telefone) : null,
      dependentes,
      banco,
    },
  };
}

export function validarDependente(d = {}) {
  const erros = [];
  const avisos = [];
  if (String(d.nome ?? "").trim().length < 3) erros.push("nome obrigatório");
  if (!PARENTESCO[d.parentesco]) erros.push("parentesco inválido");
  if (d.nascimento && !dataOk(d.nascimento)) erros.push("data de nascimento inválida");
  let cpf = null;
  if (d.cpf) {
    const v = validarCPF(d.cpf);
    if (!v.valido) erros.push(`CPF inválido: ${v.motivo}`);
    else cpf = v.digitos;
  } else if (d.deduzIR) {
    // O eSocial valida o CPF do dependente na base da Receita desde a NT 07/2026 (23/11/2026).
    avisos.push("dependente para IRRF sem CPF: o eSocial recusa a partir de 23/11/2026");
  }
  return { erros, avisos, dependente: { nome: String(d.nome ?? "").trim(), parentesco: d.parentesco, nascimento: d.nascimento ?? null, cpf, deduzIR: Boolean(d.deduzIR), salarioFamilia: Boolean(d.salarioFamilia), invalido: Boolean(d.invalido) } };
}

/** Quantos dependentes contam na competência (último dia do mês). */
export function contagemDeDependentes(pessoa, competencia) {
  const [ano, mes] = competencia.split("-").map(Number);
  const fimDoMes = paraISO(new Date(Date.UTC(ano, mes, 0)));
  const deps = pessoa?.dependentes ?? [];
  const dependentesIR = deps.filter((d) => d.deduzIR).length;
  // Salário-família: filho, enteado ou tutelado até 14 anos, ou inválido de qualquer idade.
  const filhosSalarioFamilia = deps.filter(
    (d) => d.salarioFamilia && ["FILHO", "TUTELADO"].includes(d.parentesco) &&
      (d.invalido || (d.nascimento && anosCompletosEntre(d.nascimento, fimDoMes) < 14))
  ).length;
  return { dependentesIR, filhosSalarioFamilia };
}
