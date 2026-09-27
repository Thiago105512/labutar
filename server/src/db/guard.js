/**
 * Fronteira de segurança do multi-tenant.
 *
 * Toda operação de dados passa por aqui. O objetivo não é validar: é tornar
 * impossível esquecer o tenantId. Um repositório sem escopo de tenant num ATS
 * vaza currículo de uma empresa para outra, e currículo é dado pessoal
 * sensível quando revela saúde (ASO, exames, PCD).
 */
export class ErroEscopo extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroEscopo";
    this.status = 403;
  }
}

export class ErroNaoEncontrado extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroNaoEncontrado";
    this.status = 404;
  }
}

export class ErroValidacao extends Error {
  constructor(mensagem, detalhes = null) {
    super(mensagem);
    this.name = "ErroValidacao";
    this.status = 400;
    this.detalhes = detalhes;
  }
}

const PADRAO_TENANT = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export function exigirTenant(tenantId) {
  if (tenantId === null || tenantId === undefined || tenantId === "") {
    throw new ErroEscopo("operação sem tenantId — recusada pela fronteira de escopo");
  }
  const valor = String(tenantId);
  if (!PADRAO_TENANT.test(valor)) {
    throw new ErroEscopo(`tenantId inválido: "${valor}" (esperado: 3-64 chars, [a-z0-9-])`);
  }
  return valor;
}

export function exigirColecao(colecao) {
  const valor = String(colecao ?? "");
  if (!/^[a-zA-Z][a-zA-Z0-9_]{1,63}$/.test(valor)) {
    throw new ErroValidacao(`nome de coleção inválido: "${colecao}"`);
  }
  return valor;
}

export function exigirId(id) {
  const valor = String(id ?? "");
  if (!valor || valor.length > 128) {
    throw new ErroValidacao("id ausente ou longo demais");
  }
  return valor;
}

/**
 * Filtro simples e previsível: igualdade, `in`, comparação numérica e
 * substring. Propositalmente limitado — consulta composta de verdade pertence
 * ao banco, não a um mini-DSL que ninguém consegue auditar.
 */
export function aplicarFiltro(documento, filtro = {}) {
  for (const [campo, esperado] of Object.entries(filtro)) {
    const valor = campo.includes(".")
      ? campo.split(".").reduce((acc, parte) => (acc == null ? acc : acc[parte]), documento)
      : documento?.[campo];

    if (esperado && typeof esperado === "object" && !Array.isArray(esperado)) {
      if ("in" in esperado && !esperado.in.includes(valor)) return false;
      if ("maiorQue" in esperado && !(valor > esperado.maiorQue)) return false;
      if ("menorQue" in esperado && !(valor < esperado.menorQue)) return false;
      if ("contem" in esperado && !String(valor ?? "").toLowerCase().includes(String(esperado.contem).toLowerCase())) {
        return false;
      }
      continue;
    }
    if (valor !== esperado) return false;
  }
  return true;
}
