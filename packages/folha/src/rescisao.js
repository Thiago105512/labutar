/**
 * Rescisão do contrato de trabalho (termo de rescisão e S-2299 do eSocial).
 *
 * Motivos com os códigos da Tabela 19 do eSocial (mtvDeslig). Regras principais:
 * - Aviso prévio proporcional: 30 dias + 3 por ano completo, até 90 (Lei 12.506/2011), só a
 *   favor do colaborador. Indenizado projeta o contrato para 13º e férias (OJ 82 da SDI-1).
 * - Pedido de demissão sem cumprir o aviso: desconto de 30 dias de salário (CLT, art. 487, § 2º).
 * - Justa causa: só saldo de salário e férias vencidas com 1/3 (art. 146; Lei 4.090, art. 3º).
 * - Culpa recíproca: metade do aviso, do 13º e das férias proporcionais (Súmula 14 do TST);
 *   multa do FGTS de 20%.
 * - Acordo (art. 484-A): metade do aviso indenizado e multa do FGTS de 20%; saque de 80%.
 * - Rescisão antecipada do contrato a termo pelo empregador: indenização de metade da
 *   remuneração até o fim do contrato (art. 479) e multa do FGTS de 40% — exceto no contrato
 *   temporário, em que o art. 479 não se aplica (Decreto 10.854/2021, art. 64, II).
 * - Férias vencidas depois do período concessivo: em dobro (art. 137).
 * - Pagamento em até 10 dias do término (art. 477, § 6º); descontos (fora impostos) limitados a
 *   um mês de remuneração (art. 477, § 5º).
 * - Impostos: saldo e variáveis com INSS e IRRF do mês; 13º com INSS e IRRF próprios;
 *   férias indenizadas e aviso indenizado sem INSS e IRRF; aviso indenizado com FGTS.
 */
import { VERBAS, TIPO_VERBA, efeitoNaBase } from "./verbas.js";
import { calcularINSS, calcularIRRF, calcularSalarioFamilia } from "./impostos.js";
import { calendarioDaCompetencia } from "./calendario.js";
import { tabelaDaCompetencia, ARREDONDAMENTO_INSS, ARREDONDAMENTO_FGTS } from "./tabelas.js";
import { verbasSalariais } from "./holerite.js";
import { remuneracaoFixa, impostosDoDecimoTerceiro } from "./decimo-terceiro.js";
import { avosDecimoTerceiro, avosFerias, periodosAquisitivos, diasNoMesComercial } from "./avos.js";
import { diasDeFeriasPorFaltas } from "./ferias.js";
import { avisoPrevioProporcional, somarDias, diferencaDias, formatarDataBR } from "../../core/src/datas.js";

const r = Math.round;

/** Tabela 19 do eSocial (motivos usados por empresa de trabalho temporário e terceirização). */
export const MOTIVO_DESLIGAMENTO = Object.freeze({
  "01": Object.freeze({ nome: "Justa causa, por iniciativa do empregador", aviso: null, decimoTerceiro: false, feriasProporcionais: false, multaFGTS: 0, saqueFGTS: false }),
  "02": Object.freeze({ nome: "Sem justa causa, por iniciativa do empregador", aviso: "INTEGRAL", decimoTerceiro: true, feriasProporcionais: true, multaFGTS: 40, saqueFGTS: true }),
  "03": Object.freeze({ nome: "Rescisão antecipada do contrato a termo, por iniciativa do empregador", aviso: null, decimoTerceiro: true, feriasProporcionais: true, multaFGTS: 40, saqueFGTS: true, art479: true }),
  "04": Object.freeze({ nome: "Rescisão antecipada do contrato a termo, por iniciativa do colaborador", aviso: null, decimoTerceiro: true, feriasProporcionais: true, multaFGTS: 0, saqueFGTS: false }),
  "05": Object.freeze({ nome: "Culpa recíproca", aviso: "METADE", decimoTerceiro: true, feriasProporcionais: true, metadeDasProporcionais: true, multaFGTS: 20, saqueFGTS: true }),
  "06": Object.freeze({ nome: "Término do contrato a termo", aviso: null, decimoTerceiro: true, feriasProporcionais: true, multaFGTS: 0, saqueFGTS: true }),
  "07": Object.freeze({ nome: "Pedido de demissão", aviso: "DO_COLABORADOR", decimoTerceiro: true, feriasProporcionais: true, multaFGTS: 0, saqueFGTS: false }),
  "10": Object.freeze({ nome: "Falecimento do colaborador", aviso: null, decimoTerceiro: true, feriasProporcionais: true, multaFGTS: 0, saqueFGTS: true }),
  "33": Object.freeze({ nome: "Acordo entre as partes (art. 484-A da CLT)", aviso: "METADE", decimoTerceiro: true, feriasProporcionais: true, multaFGTS: 20, saqueFGTS: true, saquePercentual: 80 }),
});

/**
 * @param dados {
 *   colaborador: { matricula, nome, cpf?, vinculo, salario, admissao, fimPrevisto?, jornadaMensal?,
 *     dependentesIR?, filhosSalarioFamilia?, periculosidade?, insalubridadeGrau? },
 *   desligamento: último dia trabalhado (ISO), motivo: código da Tabela 19,
 *   avisoIndenizado?: true quando o aviso do empregador não é trabalhado,
 *   avisoNaoCumprido?: pedido de demissão sem cumprir o aviso,
 *   lancamentos?: os mesmos da folha mensal (horas, faltas, adiantamento, eConsignado...),
 *   variaveisEmValor?: { CHAVE_DA_VERBA: valor } para lançar verbas já calculadas,
 *   medias?: média mensal das variáveis (aviso, 13º e férias),
 *   periodosGozados?: inícios dos períodos aquisitivos já gozados, faltasPorPeriodo?: { inicio: n },
 *   primeiraParcela13?: 1ª parcela do 13º já paga no ano, saldoFGTS?: saldo para fins rescisórios,
 *   avos?: { decimoTerceiro?, ferias? }, diasSaldo? — para conferir rescisões de outro sistema
 * }
 * @param opcoes { local?, arredondamentoINSS?, arredondamentoFGTS?, dispensarIRRFAte10?, tabela? }
 */
export function calcularRescisao(dados, opcoes = {}) {
  const { colaborador: c, desligamento, motivo: codigo } = dados;
  const motivo = MOTIVO_DESLIGAMENTO[codigo];
  if (!motivo) throw new Error(`motivo de desligamento ${codigo} não previsto (Tabela 19 do eSocial)`);
  if (!desligamento || desligamento < c.admissao) throw new Error("data de desligamento inválida");
  const competencia = desligamento.slice(0, 7);
  const tabela = opcoes.tabela ?? tabelaDaCompetencia(competencia);
  const temporario = c.vinculo === "TEMPORARIO";
  const avisos = [];
  const itens = [];
  const lanca = (verba, valor, referencia = null) => {
    if (valor > 0) itens.push({ codigo: verba.codigo, nome: verba.nome, tipo: verba.tipo, referencia, valor, verba });
  };
  const L = dados.lancamentos ?? {};
  const medias = dados.medias ?? 0;
  const base = remuneracaoFixa(c, tabela) + medias;

  // Saldo de salário e verbas do mês.
  const inicioDoMes = `${competencia}-01`;
  const dias = dados.diasSaldo ?? diasNoMesComercial(c.admissao > inicioDoMes ? c.admissao : inicioDoMes, desligamento);
  const cal = calendarioDaCompetencia(competencia, opcoes.local);
  const salariais = verbasSalariais(c, dias, L, tabela, cal, { verbaDoSalario: VERBAS.SALDO_SALARIO });
  itens.push(...salariais.itens);
  for (const [chave, valor] of Object.entries(dados.variaveisEmValor ?? {})) {
    if (!VERBAS[chave]) throw new Error(`verba ${chave} não existe no catálogo`);
    lanca(VERBAS[chave], valor);
  }

  // Aviso prévio.
  let diasAviso = 0;
  let fimProjetado = desligamento;
  if (motivo.aviso === "INTEGRAL" || motivo.aviso === "METADE") {
    const proporcional = avisoPrevioProporcional(c.admissao, desligamento).diasTotais;
    if (dados.avisoIndenizado) {
      diasAviso = motivo.aviso === "METADE" ? proporcional / 2 : proporcional;
      lanca(VERBAS.AVISO_INDENIZADO, r((base / 30) * diasAviso), `${diasAviso} dias`);
      fimProjetado = somarDias(desligamento, proporcional);
    }
  }
  if (motivo.aviso === "DO_COLABORADOR" && dados.avisoNaoCumprido) lanca(VERBAS.AVISO_NAO_CUMPRIDO, c.salario, "30 dias");

  // Indenização do art. 479 (não se aplica ao temporário).
  if (motivo.art479) {
    if (temporario) avisos.push("Contrato temporário: sem a indenização do art. 479 da CLT (Decreto 10.854/2021, art. 64, II).");
    else if (c.fimPrevisto && c.fimPrevisto > desligamento) {
      const restantes = diferencaDias(desligamento, c.fimPrevisto);
      lanca(VERBAS.INDENIZACAO_ART_479, r((c.salario / 30) * restantes / 2), `metade de ${restantes} dias`);
    }
  }

  const fator = motivo.metadeDasProporcionais ? 0.5 : 1;

  // 13º proporcional (e a parte projetada pelo aviso indenizado).
  const itens13 = [];
  if (motivo.decimoTerceiro) {
    const ano = Number(desligamento.slice(0, 4));
    const avos = dados.avos?.decimoTerceiro ?? avosDecimoTerceiro(ano, { admissao: c.admissao, fim: desligamento });
    const comAviso = fimProjetado > desligamento
      ? avosDecimoTerceiro(ano, { admissao: c.admissao, fim: fimProjetado < `${ano}-12-31` ? fimProjetado : `${ano}-12-31` })
      : avos;
    const pre = itens.length;
    lanca(VERBAS.DECIMO_TERCEIRO_RESCISAO, r((base * avos * fator) / 12), `${avos}/12`);
    lanca(VERBAS.DECIMO_TERCEIRO_AVISO, r((base * (comAviso - avos) * fator) / 12), `${comAviso - avos}/12`);
    itens13.push(...itens.slice(pre));
  }

  // Férias vencidas e proporcionais.
  const gozados = new Set(dados.periodosGozados ?? []);
  const periodos = periodosAquisitivos(c.admissao, fimProjetado);
  for (const p of periodos.filter((x) => x.completo && x.fim <= desligamento && !gozados.has(x.inicio))) {
    const direito = diasDeFeriasPorFaltas(dados.faltasPorPeriodo?.[p.inicio] ?? 0);
    const valor = r((base / 30) * direito);
    lanca(VERBAS.FERIAS_VENCIDAS, valor, `${direito} dias`);
    lanca(VERBAS.FERIAS_VENCIDAS_TERCO, r(valor / 3));
    if (p.fimConcessivo < desligamento) {
      lanca(VERBAS.FERIAS_DOBRO_RESCISAO, r((valor * 4) / 3), "art. 137");
      avisos.push(`Férias do período ${formatarDataBR(p.inicio)} a ${formatarDataBR(p.fim)} vencidas depois do concessivo: pagas em dobro.`);
    }
  }
  if (motivo.feriasProporcionais) {
    const atual = periodos.find((x) => !(x.completo && x.fim <= desligamento)) ?? null;
    if (atual) {
      const direito = diasDeFeriasPorFaltas(dados.faltasPorPeriodo?.[atual.inicio] ?? 0);
      const avos = dados.avos?.ferias ?? avosFerias(atual.inicio, desligamento);
      const comAviso = fimProjetado > desligamento ? avosFerias(atual.inicio, fimProjetado) : avos;
      const valor = r((((base / 30) * direito) * avos * fator) / 12);
      lanca(VERBAS.FERIAS_PROPORCIONAIS, valor, `${avos}/12`);
      lanca(VERBAS.FERIAS_PROPORCIONAIS_TERCO, r(valor / 3));
      const projetadas = r((((base / 30) * direito) * (comAviso - avos) * fator) / 12);
      lanca(VERBAS.FERIAS_AVISO, projetadas, `${comAviso - avos}/12`);
      lanca(VERBAS.FERIAS_AVISO_TERCO, r(projetadas / 3));
    }
  }

  // Impostos do mês (saldo e variáveis) e do 13º.
  const soma = (b) => Math.max(0, itens.reduce((s, i) => s + efeitoNaBase(i.verba, i.valor, b), 0));
  const sf = calcularSalarioFamilia({ remuneracao: soma("inss"), filhos: c.filhosSalarioFamilia ?? 0, diasNoMes: dias }, tabela);
  lanca(VERBAS.SALARIO_FAMILIA, sf.valor, sf.cotas ? `${sf.cotas} cota(s)` : null);
  const inss = calcularINSS(soma("inss"), tabela, { arredondamento: opcoes.arredondamentoINSS ?? ARREDONDAMENTO_INSS.POR_FAIXA });
  lanca(VERBAS.INSS, inss.valor, inss.faixas.length ? `até ${inss.faixas.at(-1).aliquota}%` : null);
  const irrf = calcularIRRF({
    rendimentos: soma("irrf") + (L.outrosRendimentosIRNoMes ?? 0),
    inss: inss.valor,
    dependentes: c.dependentesIR ?? 0,
    pensao: L.pensao ?? 0,
    jaRetido: L.irrfRetidoNoMes ?? 0,
    dispensarAte10: opcoes.dispensarIRRFAte10 ?? true,
  }, tabela);
  lanca(VERBAS.IRRF, irrf.valor, irrf.valor ? `${irrf.aliquota}%` : null);
  const imp13 = itens13.length ? impostosDoDecimoTerceiro(itens13, c, tabela, opcoes, L.pensao ?? 0) : null;
  if (imp13) for (const i of imp13.itens) lanca(i.verba, i.valor, i.referencia);

  // Descontos.
  lanca(VERBAS.DECIMO_TERCEIRO_DESCONTO_ADIANTAMENTO, dados.primeiraParcela13 ?? 0);
  lanca(VERBAS.ADIANTAMENTO, L.adiantamento ?? 0);
  lanca(VERBAS.OUTROS_DESCONTOS, L.outrosDescontos ?? 0);
  lanca(VERBAS.ECONSIGNADO, L.eConsignado ?? 0);

  const proventos = itens.filter((i) => i.tipo === TIPO_VERBA.PROVENTO).reduce((s, i) => s + i.valor, 0);
  const descontos = itens.filter((i) => i.tipo === TIPO_VERBA.DESCONTO).reduce((s, i) => s + i.valor, 0);
  const liquido = proventos - descontos;
  const IMPOSTOS = new Set([VERBAS.INSS.codigo, VERBAS.IRRF.codigo, VERBAS.INSS_13.codigo, VERBAS.IRRF_13.codigo, VERBAS.DECIMO_TERCEIRO_DESCONTO_ADIANTAMENTO.codigo, VERBAS.ADIANTAMENTO.codigo]);
  const compensacoes = itens.filter((i) => i.tipo === TIPO_VERBA.DESCONTO && !IMPOSTOS.has(i.codigo)).reduce((s, i) => s + i.valor, 0);
  if (compensacoes > remuneracaoFixa(c, tabela)) avisos.push("Descontos acima de um mês de remuneração (art. 477, § 5º): revise antes de pagar.");
  if (liquido < 0) avisos.push("Líquido negativo: descontos maiores que os proventos.");

  const baseFGTS = soma("fgts");
  const fgtsBruto = (baseFGTS * tabela.fgts.aliquota) / 100;
  const fgtsMes = opcoes.arredondamentoFGTS === ARREDONDAMENTO_FGTS.TRUNCAR ? Math.floor(fgtsBruto) : r(fgtsBruto);
  const saldoParaMulta = (dados.saldoFGTS ?? 0) + fgtsMes;

  return {
    colaborador: { cpf: c.cpf ?? null, matricula: c.matricula, nome: c.nome, vinculo: c.vinculo },
    desligamento, motivo: { codigo, nome: motivo.nome },
    aviso: { dias: diasAviso, indenizado: Boolean(dados.avisoIndenizado && diasAviso), fimProjetado },
    itens: itens.map(({ verba, ...i }) => i),
    proventos, descontos, liquido,
    bases: { inss: inss.base, inss13: imp13?.inss.base ?? 0, irrf: irrf.base, irrf13: imp13?.irrf.base ?? 0, fgts: baseFGTS },
    fgts: {
      mes: fgtsMes,
      multa: r((saldoParaMulta * motivo.multaFGTS) / 100),
      multaPercentual: motivo.multaFGTS,
      saque: motivo.saqueFGTS ? (motivo.saquePercentual ?? 100) : 0,
    },
    prazoPagamento: somarDias(desligamento, 10),
    esocial: { evento: "S-2299", mtvDeslig: codigo, dtDeslig: desligamento, dtProjFimAPI: fimProjetado > desligamento ? fimProjetado : null },
    detalhe: { inss, irrf, inss13: imp13?.inss ?? null, irrf13: imp13?.irrf ?? null, diasSaldo: dias },
    avisos,
  };
}
