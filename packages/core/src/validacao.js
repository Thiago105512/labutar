const DIGITOS = /\d/g;

export function somenteDigitos(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).match(DIGITOS)?.join("") ?? "";
}

function todosIguais(digitos) {
  return digitos.split("").every((d) => d === digitos[0]);
}

function digitoMod11(digitos, pesoInicial) {
  let soma = 0;
  for (let i = 0; i < digitos.length; i++) {
    soma += Number(digitos[i]) * (pesoInicial - i);
  }
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

function digitoMod11Padrao(digitos, pesos) {
  let soma = 0;
  for (let i = 0; i < pesos.length; i++) {
    soma += Number(digitos[i]) * pesos[i];
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCPF(valor) {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11) return { valido: false, motivo: "CPF deve ter 11 dígitos" };
  if (todosIguais(cpf)) return { valido: false, motivo: "CPF com dígitos repetidos" };

  const dv1 = digitoMod11(cpf.slice(0, 9), 10);
  if (dv1 !== Number(cpf[9])) return { valido: false, motivo: "Dígito verificador inválido" };

  const dv2 = digitoMod11(cpf.slice(0, 10), 11);
  if (dv2 !== Number(cpf[10])) return { valido: false, motivo: "Dígito verificador inválido" };

  return { valido: true, motivo: null, digitos: cpf };
}

/**
 * CNPJ com só os caracteres que contam, em maiúsculas. Serve para o formato numérico e
 * para o alfanumérico (IN RFB 2.229/2024, emitido desde julho de 2026): 12 posições com
 * letras ou números + 2 dígitos verificadores. Os dois formatos convivem para sempre.
 */
export function normalizarCNPJ(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** Raiz do CNPJ (8 primeiros caracteres): identifica a empresa, com todas as filiais. */
export function raizCNPJ(valor) {
  const cnpj = normalizarCNPJ(valor);
  return cnpj.length === 14 ? cnpj.slice(0, 8) : null;
}

// Valor de cada caractere no cálculo do dígito: código ASCII − 48 (0–9 valem 0–9, A vale 17…).
function digitoCNPJ(base, pesos) {
  let soma = 0;
  for (let i = 0; i < pesos.length; i++) soma += (base.charCodeAt(i) - 48) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCNPJ(valor) {
  const cnpj = normalizarCNPJ(valor);
  if (cnpj.length !== 14) return { valido: false, motivo: "CNPJ deve ter 14 caracteres" };
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj)) return { valido: false, motivo: "Os 2 últimos caracteres do CNPJ devem ser números" };
  if (todosIguais(cnpj)) return { valido: false, motivo: "CNPJ com caracteres repetidos" };

  const dv1 = digitoCNPJ(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (dv1 !== Number(cnpj[12])) return { valido: false, motivo: "Dígito verificador inválido" };

  const dv2 = digitoCNPJ(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (dv2 !== Number(cnpj[13])) return { valido: false, motivo: "Dígito verificador inválido" };

  return { valido: true, motivo: null, digitos: cnpj };
}

export function validarPIS(valor) {
  const pis = somenteDigitos(valor);
  if (pis.length !== 11) return { valido: false, motivo: "PIS/NIT deve ter 11 dígitos" };
  if (todosIguais(pis)) return { valido: false, motivo: "PIS com dígitos repetidos" };

  const dv = digitoMod11Padrao(pis, [3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (dv !== Number(pis[10])) return { valido: false, motivo: "Dígito verificador inválido" };

  return { valido: true, motivo: null, digitos: pis };
}

/**
 * Algoritmo de módulo 11 com dois dígitos conforme manual do DETRAN.
 * Não há base pública de CNH para conferência em massa: validar contra um
 * documento real conhecido antes de usar como bloqueio em produção.
 */
export function validarCNH(valor) {
  const cnh = somenteDigitos(valor);
  if (cnh.length !== 11) return { valido: false, motivo: "CNH deve ter 11 dígitos" };
  if (todosIguais(cnh)) return { valido: false, motivo: "CNH com dígitos repetidos" };

  let soma = 0;
  let decrescimo = 0;
  for (let i = 0, peso = 9; i < 9; i++, peso--) soma += Number(cnh[i]) * peso;

  let dv1 = soma % 11;
  if (dv1 >= 10) {
    dv1 = 0;
    decrescimo = 2;
  }

  soma = 0;
  for (let i = 0, peso = 1; i < 9; i++, peso++) soma += Number(cnh[i]) * peso;

  let dv2 = soma % 11 - decrescimo;
  if (dv2 < 0) dv2 += 11;
  if (dv2 >= 10) dv2 = 0;

  if (dv1 !== Number(cnh[9]) || dv2 !== Number(cnh[10])) {
    return { valido: false, motivo: "Dígito verificador inválido" };
  }
  return { valido: true, motivo: null, digitos: cnh };
}

export function validarEmail(valor) {
  const email = String(valor ?? "").trim();
  if (email.length === 0) return { valido: false, motivo: "E-mail obrigatório" };
  if (email.length > 254) return { valido: false, motivo: "E-mail acima de 254 caracteres" };
  const partes = email.split("@");
  if (partes.length !== 2) return { valido: false, motivo: "E-mail sem @ ou com @ múltiplos" };
  const [local, dominio] = partes;
  if (local.length === 0 || local.length > 64) return { valido: false, motivo: "Parte local inválida" };
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) {
    return { valido: false, motivo: "Caractere inválido no e-mail" };
  }
  if (!/^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(dominio)) {
    return { valido: false, motivo: "Domínio inválido" };
  }
  return { valido: true, motivo: null, email };
}

export function validarTelefone(valor) {
  const digits = somenteDigitos(valor);
  const semDDI = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  if (semDDI.length !== 10 && semDDI.length !== 11) {
    return { valido: false, motivo: "Telefone deve ter DDD + 8 ou 9 dígitos" };
  }
  const ddd = Number(semDDI.slice(0, 2));
  if (ddd < 11 || ddd > 99) return { valido: false, motivo: "DDD inválido" };

  const numero = semDDI.slice(2);
  const celular = semDDI.length === 11;
  if (celular && numero[0] !== "9") {
    return { valido: false, motivo: "Celular deve começar com 9" };
  }
  if (!celular && !/^[2-5]/.test(numero[0])) {
    return { valido: false, motivo: "Telefone fixo deve começar com 2, 3, 4 ou 5" };
  }
  return { valido: true, motivo: null, ddd, numero, celular };
}

export function validarCEP(valor) {
  const cep = somenteDigitos(valor);
  if (cep.length !== 8) return { valido: false, motivo: "CEP deve ter 8 dígitos" };
  return { valido: true, motivo: null, digitos: cep };
}

export function validarDataISO(valor) {
  const texto = String(valor ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return { valido: false, motivo: "Formato esperado AAAA-MM-DD" };
  const [ano, mes, dia] = texto.split("-").map(Number);
  if (mes < 1 || mes > 12) return { valido: false, motivo: "Mês inválido" };
  if (dia < 1 || dia > diasNoMes(ano, mes)) return { valido: false, motivo: "Dia inválido para o mês" };
  return { valido: true, motivo: null, ano, mes, dia };
}

function diasNoMes(ano, mes) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export function validarInscricao({ tipo, numero }) {
  if (tipo === "1") return validarCNPJ(numero);
  if (tipo === "2") return validarCPF(numero);
  return { valido: false, motivo: "tpInsc deve ser 1 (CNPJ) ou 2 (CPF)" };
}

export function formatarCPF(valor) {
  const cpf = somenteDigitos(valor).padStart(11, "0").slice(0, 11);
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

export function formatarCNPJ(valor) {
  const c = normalizarCNPJ(valor).padStart(14, "0").slice(0, 14);
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

export function formatarPIS(valor) {
  const p = somenteDigitos(valor).padStart(11, "0").slice(0, 11);
  return `${p.slice(0, 3)}.${p.slice(3, 8)}.${p.slice(8, 10)}-${p.slice(10)}`;
}

export function formatarTelefone(valor) {
  const d = somenteDigitos(valor);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(valor ?? "");
}

export function formatarCEP(valor) {
  const c = somenteDigitos(valor).padStart(8, "0").slice(0, 8);
  return `${c.slice(0, 5)}-${c.slice(5)}`;
}
