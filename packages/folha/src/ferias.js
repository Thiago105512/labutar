/**
 * Férias (CLT, arts. 129 a 145 e 7º, XVII, da Constituição).
 *
 * - Dias de direito pelas faltas injustificadas do período aquisitivo (art. 130).
 * - Até 3 períodos: um com 14 dias ou mais e os demais com 5 ou mais (art. 134, § 1º).
 * - Não pode começar nos 2 dias antes de feriado ou do repouso semanal (art. 134, § 3º).
 * - Aviso ao colaborador com 30 dias (art. 135); pagamento até 2 dias antes do início (art. 145).
 * - Gozo depois do fim do período concessivo: os dias fora do prazo são pagos em dobro
 *   (art. 137 e Súmula 81 do TST).
 * - Abono pecuniário: até 1/3 dos dias de direito (art. 143); não tem INSS, FGTS nem IRRF.
 * - Remuneração: salário + adicionais + médias das variáveis (art. 142), mais 1/3.
 * - INSS e FGTS entram no mês de gozo; o IRRF é calculado em separado no pagamento, sobre
 *   férias + 1/3, com as mesmas deduções e a redução da Lei 15.270/2025.
 */
import { VERBAS, TIPO_VERBA, efeitoNaBase } from "./verbas.js";
import { calcularINSS, calcularIRRF } from "./impostos.js";
import { tabelaDaCompetencia, ARREDONDAMENTO_INSS, ARREDONDAMENTO_FGTS } from "./tabelas.js";
import { feriadosDoAno } from "./calendario.js";
import { remuneracaoFixa } from "./decimo-terceiro.js";
import { paraData, somarDias, diferencaDias } from "../../core/src/datas.js";

const r = Math.round;

/** Art. 130: dias de férias conforme as faltas injustificadas no período aquisitivo. */
export function diasDeFeriasPorFaltas(faltas = 0) {
  if (faltas <= 5) return 30;
  if (faltas <= 14) return 24;
  if (faltas <= 23) return 18;
  if (faltas <= 32) return 12;
  return 0;
}

function ehDescanso(iso, local) {
  if (paraData(iso).getUTCDay() === 0) return true;
  return feriadosDoAno(Number(iso.slice(0, 4)), local).some((f) => f.data === iso);
}

/**
 * Confere a programação de férias de um período aquisitivo.
 * @param dados { periodo: { inicio, fim, fimConcessivo }, parcelas: [{ inicio, dias }],
 *   abonoDias?, faltas?, hoje?, local? }
 * @returns { ok, erros, avisos, direito, parcelas: [{ inicio, fim, dias, diasEmDobro,
 *   prazoPagamento, prazoAviso }] }
 */
export function validarProgramacaoFerias({ periodo, parcelas = [], abonoDias = 0, faltas = 0, hoje = null, local = {} }) {
  const erros = [];
  const avisos = [];
  const direito = diasDeFeriasPorFaltas(faltas);
  if (direito === 0) erros.push("mais de 32 faltas injustificadas no período aquisitivo: sem direito a férias (art. 130)");
  if (hoje && periodo.fim >= hoje) erros.push("período aquisitivo ainda não completo");
  if (abonoDias > Math.floor(direito / 3)) erros.push(`abono pecuniário de até ${Math.floor(direito / 3)} dias (1/3 do direito, art. 143)`);
  if (parcelas.length === 0 || parcelas.length > 3) erros.push("férias em 1 a 3 períodos (art. 134, § 1º)");
  const total = parcelas.reduce((s, p) => s + p.dias, 0);
  if (total + abonoDias !== direito) erros.push(`dias de gozo (${total}) + abono (${abonoDias}) devem somar ${direito} dias de direito`);
  if (parcelas.length > 1) {
    if (!parcelas.some((p) => p.dias >= 14)) erros.push("um dos períodos precisa ter 14 dias ou mais (art. 134, § 1º)");
    if (parcelas.some((p) => p.dias < 5)) erros.push("nenhum período pode ter menos de 5 dias (art. 134, § 1º)");
  }

  const saida = parcelas.map((p) => {
    const fim = somarDias(p.inicio, p.dias - 1);
    if (ehDescanso(somarDias(p.inicio, 1), local) || ehDescanso(somarDias(p.inicio, 2), local)) {
      erros.push(`início em ${p.inicio} cai nos 2 dias antes de feriado ou repouso semanal (art. 134, § 3º)`);
    }
    if (p.inicio <= periodo.fim) erros.push(`início em ${p.inicio} antes de completar o período aquisitivo`);
    const diasEmDobro = fim > periodo.fimConcessivo
      ? Math.min(p.dias, diferencaDias(periodo.fimConcessivo, fim))
      : 0;
    if (diasEmDobro) avisos.push(`${diasEmDobro} dia(s) depois do fim do período concessivo (${periodo.fimConcessivo}): pagos em dobro (art. 137)`);
    const prazoAviso = somarDias(p.inicio, -30);
    if (hoje && hoje > prazoAviso) avisos.push(`aviso de férias com menos de 30 dias de antecedência (art. 135) para o início em ${p.inicio}`);
    return { inicio: p.inicio, fim, dias: p.dias, diasEmDobro, prazoPagamento: somarDias(p.inicio, -2), prazoAviso };
  });
  return { ok: erros.length === 0, erros, avisos, direito, parcelas: saida };
}

/** Dias de um período por competência (para o INSS e o FGTS de cada mês). */
function diasPorCompetencia(inicio, dias) {
  const mapa = new Map();
  for (let i = 0; i < dias; i++) {
    const c = somarDias(inicio, i).slice(0, 7);
    mapa.set(c, (mapa.get(c) ?? 0) + 1);
  }
  return [...mapa].map(([competencia, d]) => ({ competencia, dias: d }));
}

/** Reparte o valor pelos meses proporcionalmente aos dias; o último mês leva o resto do arredondamento. */
function repartir(valor, meses, dias) {
  let usado = 0;
  return meses.map((c, i) => {
    const parte = i === meses.length - 1 ? valor - usado : r((valor * c.dias) / dias);
    usado += parte;
    return { ...c, valor: parte };
  });
}

/**
 * Recibo de férias. @param dados { colaborador, inicio, dias, abonoDias?, medias?, diasEmDobro?, pensao? }
 * INSS do recibo é sobre férias + 1/3 gozadas; a folha de cada mês de gozo soma essa parte à
 * base do mês e desconta o que o recibo já reteve (`porCompetencia`).
 */
export function calcularFerias({ colaborador, inicio, dias, abonoDias = 0, medias = 0, diasEmDobro = 0, pensao = 0 }, opcoes = {}) {
  const competencia = inicio.slice(0, 7);
  const tabela = opcoes.tabela ?? tabelaDaCompetencia(competencia);
  const base = remuneracaoFixa(colaborador, tabela) + medias;
  const diaria = base / 30;
  const itens = [];
  const lanca = (verba, valor, referencia = null) => {
    if (valor > 0) itens.push({ codigo: verba.codigo, nome: verba.nome, tipo: verba.tipo, referencia, valor, verba });
  };
  const ferias = r(diaria * dias);
  const terco = r(ferias / 3);
  lanca(VERBAS.FERIAS, ferias, `${dias} dias`);
  lanca(VERBAS.FERIAS_TERCO, terco);
  const dobra = r(diaria * diasEmDobro * (4 / 3));
  lanca(VERBAS.FERIAS_DOBRO, dobra, diasEmDobro ? `${diasEmDobro} dias + 1/3` : null);
  const abono = r(diaria * abonoDias);
  lanca(VERBAS.FERIAS_ABONO, abono, abonoDias ? `${abonoDias} dias` : null);
  lanca(VERBAS.FERIAS_ABONO_TERCO, r(abono / 3));

  const somaBase = (b) => Math.max(0, itens.reduce((s, i) => s + efeitoNaBase(i.verba, i.valor, b), 0));
  const inss = calcularINSS(somaBase("inss"), tabela, { arredondamento: opcoes.arredondamentoINSS ?? ARREDONDAMENTO_INSS.POR_FAIXA });
  lanca(VERBAS.INSS, inss.valor, inss.faixas.length ? `até ${inss.faixas.at(-1).aliquota}%` : null);
  const irrf = calcularIRRF({
    rendimentos: somaBase("irrfFerias"),
    inss: inss.valor,
    dependentes: colaborador.dependentesIR ?? 0,
    pensao,
    dispensarAte10: opcoes.dispensarIRRFAte10 ?? true,
  }, tabela);
  lanca(VERBAS.IRRF_FERIAS, irrf.valor, irrf.valor ? `${irrf.aliquota}%` : null);

  const proventos = itens.filter((i) => i.tipo === TIPO_VERBA.PROVENTO).reduce((s, i) => s + i.valor, 0);
  const descontos = itens.filter((i) => i.tipo === TIPO_VERBA.DESCONTO).reduce((s, i) => s + i.valor, 0);
  const baseFGTS = somaBase("fgts");
  const fgtsBruto = (baseFGTS * tabela.fgts.aliquota) / 100;
  const tributavelGozo = ferias + terco + dobra;
  return {
    inicio, fim: somarDias(inicio, dias - 1), dias, abonoDias, base,
    itens: itens.map(({ verba, ...i }) => i),
    proventos, descontos, liquido: proventos - descontos,
    bases: { inss: inss.base, fgts: baseFGTS, irrf: irrf.base },
    fgts: opcoes.arredondamentoFGTS === ARREDONDAMENTO_FGTS.TRUNCAR ? Math.floor(fgtsBruto) : r(fgtsBruto),
    prazoPagamento: somarDias(inicio, -2),
    // Parte das férias (com 1/3) em cada mês de gozo, para a base de INSS e FGTS da folha do mês.
    porCompetencia: repartir(tributavelGozo, diasPorCompetencia(inicio, dias), dias),
    detalhe: { inss, irrf },
  };
}
