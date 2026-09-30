/**
 * Holerite mensal de um colaborador. Folha mensal de quem trabalhou na competência;
 * desligamento no mês vai para a rescisão (pacote próprio), não para cá.
 *
 * Regras (mês comercial de 30 dias, CLT):
 * - Salário proporcional aos dias de contrato quando a admissão cai no mês.
 * - Valor-hora = (salário + periculosidade + insalubridade) / jornada mensal: os adicionais
 *   integram a base das horas extras (Súmula 132 e OJ 47 da SDI-1 do TST).
 * - DSR sobre horas extras e adicional noturno = variáveis / dias úteis × domingos e feriados.
 * - Insalubridade sobre o salário mínimo; periculosidade de 30% sobre o salário-base.
 * - Vale-transporte: até 6% do salário-base, limitado ao custo do benefício.
 */
import { VERBAS, TIPO_VERBA, efeitoNaBase } from "./verbas.js";
import { calcularINSS, calcularIRRF, calcularSalarioFamilia } from "./impostos.js";
import { calendarioDaCompetencia } from "./calendario.js";
import { tabelaDaCompetencia, ARREDONDAMENTO_INSS, ARREDONDAMENTO_FGTS } from "./tabelas.js";
import { validarCPF } from "../../core/src/validacao.js";
import { formatarDataBR } from "../../core/src/datas.js";

const r = Math.round;
const JORNADA_PADRAO = 220;

function diasDeContrato(colaborador, competencia) {
  const adm = colaborador.admissao;
  if (!adm || adm.slice(0, 7) < competencia) return 30;
  if (adm.slice(0, 7) > competencia) return 0;
  return Math.max(0, 30 - Number(adm.slice(8, 10)) + 1);
}

/**
 * Verbas do tempo trabalhado no período: salário dos dias, adicionais, horas extras, noturno,
 * DSR sobre variáveis, faltas. Usada pela folha mensal e pelo saldo de salário da rescisão.
 * `verbaDoSalario` troca o código do salário (na rescisão, 6000.01 Saldo de salário).
 */
export function verbasSalariais(colaborador, dias, L, tabela, cal, { verbaDoSalario = VERBAS.SALARIO } = {}) {
  const itens = [];
  const lanca = (verba, valor, referencia = null) => {
    if (valor > 0) itens.push({ codigo: verba.codigo, nome: verba.nome, tipo: verba.tipo, referencia, valor, verba });
  };
  const salario = colaborador.salario;
  const salarioMes = r((salario * dias) / 30);
  lanca(verbaDoSalario, salarioMes, `${dias} dias`);

  const periculosidadeMensal = colaborador.periculosidade ? r(salario * 0.3) : 0;
  const insalubridadeMensal = colaborador.insalubridadeGrau ? r((tabela.salarioMinimo * colaborador.insalubridadeGrau) / 100) : 0;
  lanca(VERBAS.PERICULOSIDADE, r((periculosidadeMensal * dias) / 30), colaborador.periculosidade ? "30%" : null);
  lanca(VERBAS.INSALUBRIDADE, r((insalubridadeMensal * dias) / 30), colaborador.insalubridadeGrau ? `${colaborador.insalubridadeGrau}% do mínimo` : null);

  // Divisor do valor-hora: a jornada mensal, salvo divisor fixado em norma coletiva (12x36: 192).
  const jornada = colaborador.divisorHora ?? colaborador.jornadaMensal ?? JORNADA_PADRAO;
  const valorHora = (salario + periculosidadeMensal + insalubridadeMensal) / jornada;
  const he50 = r((L.horasExtras50 ?? 0) * valorHora * 1.5);
  const he100 = r((L.horasExtras100 ?? 0) * valorHora * 2);
  const noturno = r((L.horasNoturnas ?? 0) * valorHora * 0.2);
  lanca(VERBAS.HORA_EXTRA_50, he50, L.horasExtras50 ? `${L.horasExtras50}h` : null);
  lanca(VERBAS.HORA_EXTRA_100, he100, L.horasExtras100 ? `${L.horasExtras100}h` : null);
  lanca(VERBAS.ADICIONAL_NOTURNO, noturno, L.horasNoturnas ? `${L.horasNoturnas}h` : null);
  const variaveis = he50 + he100 + noturno;
  if (variaveis > 0) lanca(VERBAS.DSR_VARIAVEIS, r((variaveis / cal.uteis) * cal.descanso), `${cal.descanso}/${cal.uteis} dias`);

  const diaria = salario / 30;
  lanca(VERBAS.FALTAS, r((L.faltasDias ?? 0) * diaria), L.faltasDias ? `${L.faltasDias} dias` : null);
  lanca(VERBAS.DSR_FALTAS, r((L.dsrPerdidos ?? 0) * diaria), L.dsrPerdidos ? `${L.dsrPerdidos} dias` : null);
  return { itens, salarioMes, valorHora };
}

/**
 * @param colaborador { matricula, nome, vinculo, salario, jornadaMensal?, admissao, desligamento?,
 *   dependentesIR?, filhosSalarioFamilia?, insalubridadeGrau? (10|20|40), periculosidade?, lotacao }
 * @param lancamentos { horasExtras50?, horasExtras100?, horasNoturnas?, faltasDias?, dsrPerdidos?,
 *   adiantamento?, custoValeTransporte?, pensao?, outrosDescontos?, eConsignado?,
 *   outrosRendimentosIRNoMes?, irrfRetidoNoMes?, verbasExtras? } — outrosRendimentos e irrfRetido para o regime de caixa do IRRF:
 *   o que outro pagamento do mesmo mês já pagou e reteve (13º, férias, complementar).
 * @param opcoes { local?, arredondamentoINSS?, arredondamentoFGTS?, dispensarIRRFAte10?, tabela? }
 */
export function calcularHolerite(colaborador, competencia, lancamentos = {}, opcoes = {}) {
  const tabela = opcoes.tabela ?? tabelaDaCompetencia(competencia);
  const avisos = [];
  if (colaborador.desligamento && colaborador.desligamento.slice(0, 7) <= competencia) {
    throw new Error(`desligamento em ${formatarDataBR(colaborador.desligamento)}: o cálculo é feito na rescisão, não na folha mensal`);
  }
  const dias = diasDeContrato(colaborador, competencia);
  if (dias === 0) throw new Error(`admissão em ${formatarDataBR(colaborador.admissao)}, depois da competência`);

  const cal = calendarioDaCompetencia(competencia, opcoes.local);
  const itens = [];
  const lanca = (verba, valor, referencia = null) => {
    if (valor > 0) itens.push({ codigo: verba.codigo, nome: verba.nome, tipo: verba.tipo, referencia, valor, verba });
  };
  const L = lancamentos;
  const { itens: salariais, salarioMes, valorHora } = verbasSalariais(colaborador, dias, L, tabela, cal);
  itens.push(...salariais);

  // Bases a partir das incidências de cada verba.
  const base = (b) => itens.reduce((s, i) => s + efeitoNaBase(i.verba, i.valor, b), 0);
  const baseINSS = Math.max(0, base("inss"));
  const baseFGTS = Math.max(0, base("fgts"));
  const rendimentosIR = Math.max(0, base("irrf"));

  const sf = calcularSalarioFamilia({ remuneracao: baseINSS, filhos: colaborador.filhosSalarioFamilia ?? 0, diasNoMes: dias }, tabela);
  lanca(VERBAS.SALARIO_FAMILIA, sf.valor, sf.cotas ? `${sf.cotas} cota(s)` : null);

  const inss = calcularINSS(baseINSS, tabela, { arredondamento: opcoes.arredondamentoINSS ?? ARREDONDAMENTO_INSS.POR_FAIXA });
  lanca(VERBAS.INSS, inss.valor, inss.faixas.length ? `até ${inss.faixas.at(-1).aliquota}%` : null);
  const irrf = calcularIRRF({
    rendimentos: rendimentosIR + (L.outrosRendimentosIRNoMes ?? 0),
    inss: inss.valor,
    dependentes: colaborador.dependentesIR ?? 0,
    pensao: L.pensao ?? 0,
    jaRetido: L.irrfRetidoNoMes ?? 0,
    dispensarAte10: opcoes.dispensarIRRFAte10 ?? true,
  }, tabela);
  lanca(VERBAS.IRRF, irrf.valor, irrf.valor ? `${irrf.aliquota}%` : null);
  if (irrf.dispensado) avisos.push("IRRF de até R$ 10,00 dispensado de retenção.");

  lanca(VERBAS.ADIANTAMENTO, L.adiantamento ?? 0);
  lanca(VERBAS.OUTROS_DESCONTOS, L.outrosDescontos ?? 0);
  lanca(VERBAS.ECONSIGNADO, L.eConsignado ?? 0);
  const pctVT = colaborador.percentualVT ?? 6;
  if (L.custoValeTransporte) lanca(VERBAS.VALE_TRANSPORTE, Math.min(L.custoValeTransporte, r((salarioMes * pctVT) / 100)), `${pctVT}%`);
  // Verbas trazidas de fora do cálculo (convenção coletiva): chave do catálogo + valor.
  for (const extra of L.verbasExtras ?? []) {
    if (!VERBAS[extra.chave]) throw new Error(`verba ${extra.chave} não existe no catálogo`);
    lanca(VERBAS[extra.chave], extra.valor, extra.referencia ?? null);
  }

  const proventos = itens.filter((i) => i.tipo === TIPO_VERBA.PROVENTO).reduce((s, i) => s + i.valor, 0);
  const descontos = itens.filter((i) => i.tipo === TIPO_VERBA.DESCONTO).reduce((s, i) => s + i.valor, 0);
  const liquido = proventos - descontos;
  if (liquido < 0) avisos.push("Líquido negativo: descontos maiores que os proventos — revisar lançamentos.");
  // A pessoa é identificada pelo CPF (como no eSocial): sem ele o cálculo sai, mas o envio não.
  const pendencias = [];
  if (!colaborador.cpf) pendencias.push("CPF não informado: obrigatório para enviar ao eSocial.");
  else if (!validarCPF(colaborador.cpf).valido) pendencias.push("CPF inválido: corrija antes de enviar ao eSocial.");
  const fgtsBruto = (baseFGTS * tabela.fgts.aliquota) / 100;
  const fgts = opcoes.arredondamentoFGTS === ARREDONDAMENTO_FGTS.TRUNCAR ? Math.floor(fgtsBruto) : r(fgtsBruto);

  return {
    competencia,
    colaborador: {
      cpf: colaborador.cpf ?? null,
      matricula: colaborador.matricula,
      matriculaAnterior: colaborador.matriculaAnterior ?? null,
      nome: colaborador.nome,
      vinculo: colaborador.vinculo,
      cargo: colaborador.cargo ?? null,
      lotacao: colaborador.lotacao ?? null,
    },
    itens: itens.map(({ verba, ...i }) => i),
    proventos,
    descontos,
    liquido,
    bases: { inss: inss.base, fgts: baseFGTS, irrf: irrf.base, rendimentosIR },
    fgts,
    detalhe: { inss, irrf, salarioFamilia: sf, calendario: cal, diasDeContrato: dias, valorHora: r(valorHora) },
    avisos,
    pendencias,
  };
}
