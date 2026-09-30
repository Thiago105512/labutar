import { diferencaDias, somarDias } from "../../core/src/datas.js";
import { validarDataISO, somenteDigitos } from "../../core/src/validacao.js";
import { normalizar } from "../../core/src/texto.js";
import { HIPOTESE_TEMPORARIO, PARAMETROS_LEGAIS } from "./constantes.js";

/**
 * Regras do trabalho temporário (Lei 6.019/1974, arts. 2º, 9º, 10 e 12).
 *
 * Toda função é pura: recebe o histórico de contratos da pessoa e devolve
 * erros (bloqueiam), avisos (não bloqueiam) e os números que os explicam.
 * Nada aqui decide sozinho um caso ambíguo — os parâmetros de interpretação
 * vêm de PARAMETROS_LEGAIS e podem ser sobrescritos por tenant.
 */

const dataValida = (valor) => validarDataISO(valor).valido;
const chaveFuncao = (texto) => normalizar(texto).toLowerCase().replace(/\s+/g, " ").trim();

/** Dias corridos de um contrato, contando o primeiro e o último dia. */
export function duracaoEmDias(inicio, fim) {
  return diferencaDias(inicio, fim) + 1;
}

/**
 * "Mesma tomadora" é comparada pela raiz do CNPJ (8 primeiros dígitos):
 * contrato numa filial conta para o limite da empresa. Leitura
 * conservadora — separar por estabelecimento aumentaria o risco de vínculo.
 */
export function mesmaTomadora(cnpjA, cnpjB) {
  const a = somenteDigitos(cnpjA ?? "");
  const b = somenteDigitos(cnpjB ?? "");
  return a.length >= 8 && b.length >= 8 && a.slice(0, 8) === b.slice(0, 8);
}

/**
 * Contratos anteriores com a mesma tomadora que ainda somam no limite de
 * 180 dias "consecutivos ou não". A soma é interrompida quando há um
 * intervalo sem contrato de pelo menos `temporarioIntervaloQueReiniciaContagem`.
 */
export function cicloAtual(historico, { tomadorCnpj, ate, parametros = PARAMETROS_LEGAIS } = {}) {
  const anteriores = (historico ?? [])
    .filter((c) => mesmaTomadora(c.tomadorCnpj, tomadorCnpj) && c.fim && c.fim < ate)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));

  const ciclo = [];
  let referencia = ate;
  for (let i = anteriores.length - 1; i >= 0; i -= 1) {
    const contrato = anteriores[i];
    const intervalo = diferencaDias(contrato.fim, referencia) - 1;
    if (intervalo >= parametros.temporarioIntervaloQueReiniciaContagem) break;
    ciclo.unshift(contrato);
    referencia = contrato.inicio;
  }

  const dias = ciclo.reduce((soma, c) => soma + duracaoEmDias(c.inicio, c.fim), 0);
  return { contratos: ciclo, dias, ultimoFim: anteriores.at(-1)?.fim ?? null };
}

/**
 * Valida um novo contrato temporário (ou a renovação de um) contra o
 * histórico da pessoa. `proposta`:
 *   { tomadorCnpj, inicio, fimPrevisto, hipotese, justificativa,
 *     substituido?, substituiGrevista?, prorrogacao?: { dias, justificativa } }
 */
export function validarContratoTemporario(proposta = {}, historico = [], { parametros = PARAMETROS_LEGAIS } = {}) {
  const erros = [];
  const avisos = [];
  const p = parametros;

  if (!dataValida(proposta.inicio)) erros.push("inicio inválido");
  if (!dataValida(proposta.fimPrevisto)) erros.push("fimPrevisto inválido");
  if (erros.length) return { ok: false, erros, avisos };
  if (proposta.fimPrevisto < proposta.inicio) {
    return { ok: false, erros: ["fimPrevisto anterior ao inicio"], avisos };
  }
  if (somenteDigitos(proposta.tomadorCnpj ?? "").length !== 14) erros.push("tomadorCnpj deve ter 14 dígitos");

  // Motivo justificador — art. 2º e art. 9º, II.
  if (!Object.values(HIPOTESE_TEMPORARIO).includes(proposta.hipotese)) {
    erros.push("hipótese legal obrigatória: substituição transitória de pessoal ou demanda complementar (art. 2º)");
  }
  if (String(proposta.justificativa ?? "").trim().length < 15) {
    erros.push("o contrato com a tomadora exige motivo justificador descrito (art. 9º, II)");
  }
  if (proposta.substituiGrevista) {
    erros.push("é proibido contratar temporário para substituir trabalhadores em greve (art. 2º, §1º)");
  }
  if (proposta.hipotese === HIPOTESE_TEMPORARIO.SUBSTITUICAO_TRANSITORIA && !proposta.substituido) {
    avisos.push("substituição transitória sem identificar quem é substituído enfraquece a prova do motivo");
  }

  // Sobreposição com outro contrato na mesma tomadora.
  const sobreposto = historico.find(
    (c) => mesmaTomadora(c.tomadorCnpj, proposta.tomadorCnpj) &&
      c.inicio <= proposta.fimPrevisto && (c.fim ?? "9999-12-31") >= proposta.inicio
  );
  if (sobreposto) erros.push(`sobrepõe outro contrato temporário na mesma tomadora (${sobreposto.inicio} a ${sobreposto.fim ?? "em aberto"})`);

  // Limite de 180 dias + prorrogação de até 90 — art. 10, §§1º e 2º.
  const ciclo = cicloAtual(historico, { tomadorCnpj: proposta.tomadorCnpj, ate: proposta.inicio, parametros: p });
  const prorrogacao = proposta.prorrogacao;
  let diasProrrogacao = 0;
  if (prorrogacao) {
    if (String(prorrogacao.justificativa ?? "").trim().length < 15) {
      erros.push("prorrogação exige comprovar a manutenção das condições que justificaram o contrato (art. 10, §2º)");
    }
    diasProrrogacao = Math.min(Math.max(0, Number(prorrogacao.dias) || 0), p.temporarioProrrogacaoDias);
    if ((Number(prorrogacao.dias) || 0) > p.temporarioProrrogacaoDias) {
      erros.push(`prorrogação limitada a ${p.temporarioProrrogacaoDias} dias (art. 10, §2º)`);
    }
  }

  const limite = p.temporarioLimiteDias + diasProrrogacao;
  const diasProposta = duracaoEmDias(proposta.inicio, proposta.fimPrevisto);
  const total = ciclo.dias + diasProposta;
  const diasDisponiveis = Math.max(0, limite - ciclo.dias);
  const dataLimite = diasDisponiveis > 0 ? somarDias(proposta.inicio, diasDisponiveis - 1) : null;

  // Quarentena — art. 10, §§5º e 6º. O ciclo anterior esgotou o prazo base
  // e o novo começa antes de terminar o intervalo exigido.
  let quarentenaAte = null;
  if (ciclo.dias >= p.temporarioLimiteDias && ciclo.ultimoFim) {
    quarentenaAte = somarDias(ciclo.ultimoFim, p.temporarioQuarentenaDias);
    if (proposta.inicio <= quarentenaAte) {
      erros.push(
        `a pessoa cumpriu o prazo nesta tomadora; nova colocação só a partir de ${somarDias(quarentenaAte, 1)} ` +
          "— antes disso caracteriza vínculo com a tomadora (art. 10, §§5º e 6º)"
      );
    }
  }

  if (total > limite && !(quarentenaAte && proposta.inicio <= quarentenaAte)) {
    const base = total > p.temporarioLimiteDias && !prorrogacao
      ? ` Com prorrogação justificada o limite sobe para ${p.temporarioLimiteDias + p.temporarioProrrogacaoDias} dias.`
      : "";
    erros.push(
      `excede o limite de ${limite} dias na mesma tomadora: ${ciclo.dias} já cumpridos + ${diasProposta} propostos = ${total}. ` +
        (dataLimite ? `Data final máxima: ${dataLimite}.` : "Não há saldo de dias.") + base
    );
  }

  return {
    ok: erros.length === 0,
    erros,
    avisos,
    diasJaCumpridos: ciclo.dias,
    diasProposta,
    limite,
    diasDisponiveis,
    dataLimite,
    quarentenaAte,
  };
}

/**
 * Situação de um contrato temporário em curso, para alertas do painel.
 */
export function situacaoContratoTemporario(contrato, historico = [], { referencia, parametros = PARAMETROS_LEGAIS } = {}) {
  const ciclo = cicloAtual(historico, { tomadorCnpj: contrato.tomadorCnpj, ate: contrato.inicio, parametros });
  const limite = parametros.temporarioLimiteDias + Math.min(contrato.prorrogacao?.dias ?? 0, parametros.temporarioProrrogacaoDias);
  const saldoInicial = Math.max(0, limite - ciclo.dias);
  const dataLimite = saldoInicial > 0 ? somarDias(contrato.inicio, saldoInicial - 1) : contrato.inicio;
  const fim = contrato.fimPrevisto < dataLimite ? contrato.fimPrevisto : dataLimite;
  const diasRestantes = referencia ? diferencaDias(referencia, fim) : null;
  return {
    diasJaCumpridosAntes: ciclo.dias,
    limite,
    dataLimite,
    fimEfetivoMaximo: fim,
    diasRestantes,
    vencido: diasRestantes !== null && diasRestantes < 0,
    vencendo: diasRestantes !== null && diasRestantes >= 0 && diasRestantes <= parametros.temporarioDiasDeAviso,
  };
}

/**
 * Remuneração equivalente à dos empregados da tomadora na mesma função,
 * calculada à base horária, nunca abaixo do salário mínimo (art. 12, "a").
 * `tabelaTomadora`: [{ funcao, salarioHoraCentavos, vigenciaInicio, vigenciaFim? }]
 */
export function verificarRemuneracaoEquivalente({
  funcao,
  salarioHoraCentavos,
  data,
  tabelaTomadora = [],
  salarioMinimoHoraCentavos = 0,
} = {}) {
  const erros = [];
  const avisos = [];
  const alvo = chaveFuncao(funcao ?? "");

  const referencia = tabelaTomadora
    .filter((l) => chaveFuncao(l.funcao) === alvo && l.vigenciaInicio <= data && (!l.vigenciaFim || l.vigenciaFim >= data))
    .sort((a, b) => b.vigenciaInicio.localeCompare(a.vigenciaInicio))[0] ?? null;

  if (!referencia) {
    avisos.push(`sem salário de referência da tomadora para "${funcao}" em ${data}: cadastre a tabela da tomadora para garantir a equivalência`);
  } else if (salarioHoraCentavos < referencia.salarioHoraCentavos) {
    erros.push(
      `remuneração abaixo da praticada pela tomadora para ${referencia.funcao}: ` +
        `${salarioHoraCentavos} < ${referencia.salarioHoraCentavos} centavos/hora (art. 12, "a")`
    );
  }
  if (salarioMinimoHoraCentavos && salarioHoraCentavos < salarioMinimoHoraCentavos) {
    erros.push("remuneração abaixo do salário mínimo-hora (art. 12, \"a\")");
  }

  const minimo = Math.max(referencia?.salarioHoraCentavos ?? 0, salarioMinimoHoraCentavos);
  return { ok: erros.length === 0, erros, avisos, referencia, salarioHoraMinimoCentavos: minimo };
}
