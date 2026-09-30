/**
 * Aplicação das convenções (CCT) e acordos coletivos (ACT) ao colaborador.
 *
 * - Qual instrumento vale: o acordo coletivo prevalece sobre a convenção (CLT, art. 620); entre
 *   acordos, o mais específico (posto > tomador > empresa). Só vale o que está em vigência.
 * - Piso: pela função enquadrada no posto (ou no vínculo). Função fora da tabela: piso geral.
 * - Benefícios, contribuições e custos do mês saem das regras do instrumento.
 * Valores em centavos.
 */
import { somenteDigitos } from "../../core/src/validacao.js";

export const TIPO_INSTRUMENTO = Object.freeze({ CCT: "CCT", ACT: "ACT" });

const r = Math.round;
const normalizar = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

/** Confere os dados básicos de um instrumento coletivo. */
export function validarInstrumento(i = {}) {
  const erros = [];
  if (!Object.values(TIPO_INSTRUMENTO).includes(i.tipo)) erros.push("tipo deve ser CCT ou ACT");
  if (!/^[A-Z]{2}\d{6}\/\d{4}$/.test(i.registroMTE ?? "")) erros.push("registro no MTE no formato UF000000/AAAA (Mediador)");
  if (!i.vigencia?.inicio || !i.vigencia?.fim || i.vigencia.fim < i.vigencia.inicio) erros.push("vigência inválida");
  if (somenteDigitos(i.sindicatoLaboral?.cnpj).length !== 14) erros.push("CNPJ do sindicato laboral obrigatório");
  if (i.tipo === TIPO_INSTRUMENTO.CCT && somenteDigitos(i.sindicatoPatronal?.cnpj).length !== 14) erros.push("CNPJ do sindicato patronal obrigatório na convenção");
  if (i.tipo === TIPO_INSTRUMENTO.ACT && !(i.abrangencia?.empresaCnpj || i.abrangencia?.tomadorCnpj)) erros.push("acordo coletivo precisa da empresa ou do tomador que abrange");
  if (!(i.pisoGeral > 0) && !(i.pisos ?? []).length && i.tipo === TIPO_INSTRUMENTO.CCT) erros.push("convenção sem piso salarial");
  return { ok: erros.length === 0, erros };
}

export const emVigencia = (i, data) => i.vigencia.inicio <= data && data <= i.vigencia.fim;

/**
 * Instrumento que vale para o colaborador na data. `enquadramento` é a lista de registros que a
 * empresa aplica (a CCT da categoria dela e os ACTs assinados).
 * @param contexto { data, empresaCnpj?, tomadorCnpj?, postoId?, tipoVinculo? }
 */
export function instrumentoAplicavel(instrumentos, contexto) {
  const vigentes = instrumentos.filter((i) => emVigencia(i, contexto.data))
    .filter((i) => !i.abrangencia?.tiposVinculo || i.abrangencia.tiposVinculo.includes(contexto.tipoVinculo));
  const alcance = (i) => {
    const a = i.abrangencia ?? {};
    if (a.postoId) return a.postoId === contexto.postoId ? 3 : -1;
    if (a.tomadorCnpj) return a.tomadorCnpj === contexto.tomadorCnpj ? 2 : -1;
    if (a.empresaCnpj) return a.empresaCnpj === contexto.empresaCnpj ? 1 : -1;
    return 0;
  };
  const candidatos = vigentes.map((i) => ({ i, alcance: alcance(i) })).filter((x) => x.alcance >= 0);
  const acts = candidatos.filter((x) => x.i.tipo === TIPO_INSTRUMENTO.ACT).sort((a, b) => b.alcance - a.alcance);
  const cct = candidatos.find((x) => x.i.tipo === TIPO_INSTRUMENTO.CCT)?.i ?? null;
  // O ACT prevalece (art. 620); o que ele não trata continua pela CCT.
  return { principal: acts[0]?.i ?? cct, convencao: cct, acordo: acts[0]?.i ?? null };
}

/** Todas as funções da tabela de pisos, achatadas. */
export function funcoesDoInstrumento(instrumento) {
  return (instrumento.pisos ?? []).flatMap((p) => p.funcoes.map((funcao) => ({ funcao, valor: p.valor })));
}

/**
 * Piso da função. Procura pelo nome exato (sem acento e sem o que está entre parênteses); sem
 * achar, usa o piso geral e avisa para enquadrar.
 */
export function pisoDaFuncao(instrumento, funcao) {
  const alvo = normalizar(funcao);
  const achada = funcoesDoInstrumento(instrumento).find((f) => normalizar(f.funcao) === alvo);
  if (achada) return { valor: achada.valor, funcao: achada.funcao, enquadrada: true };
  return { valor: instrumento.pisoGeral ?? 0, funcao: null, enquadrada: false };
}

const PALAVRAS_VAZIAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "com", "para", "a", "o"]);
const palavrasDe = (texto) => normalizar(texto).split(" ").filter((t) => t && !PALAVRAS_VAZIAS.has(t));

/**
 * Funções da tabela mais parecidas com o cargo, para o DP enquadrar o posto. Palavra comum na
 * tabela ("auxiliar", "técnico") pesa menos que a que distingue a função ("limpeza").
 */
export function sugerirFuncoes(instrumento, cargo, limite = 5) {
  const termos = [...new Set(palavrasDe(cargo))];
  if (!termos.length) return [];
  const funcoes = funcoesDoInstrumento(instrumento);
  const frequencia = new Map();
  for (const f of funcoes) for (const p of new Set(palavrasDe(f.funcao))) frequencia.set(p, (frequencia.get(p) ?? 0) + 1);
  const peso = (p) => Math.log((funcoes.length + 1) / ((frequencia.get(p) ?? 0) + 1)) + 1;
  const total = termos.reduce((s, t) => s + peso(t), 0);
  return funcoes
    .map((f) => {
      const palavras = palavrasDe(f.funcao);
      const comuns = termos.filter((t) => palavras.includes(t));
      const pontos = comuns.length ? comuns.reduce((s, t) => s + peso(t), 0) / total - 0.01 * (palavras.length - comuns.length) : 0;
      return { ...f, pontos };
    })
    .filter((f) => f.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.funcao.localeCompare(b.funcao))
    .slice(0, limite);
}

/**
 * Salário diante do piso. Tempo parcial não reduz o piso quando a CCT só permite parcial com o
 * piso integral.
 */
export function conferirSalario(instrumento, { funcao, salario, jornadaMensal = 220 }) {
  const piso = pisoDaFuncao(instrumento, funcao);
  const erros = [];
  const avisos = [];
  const parcialProporcional = jornadaMensal < 220 && !instrumento.tempoParcial?.permitidoSoComPisoIntegral;
  const minimo = parcialProporcional ? r((piso.valor * jornadaMensal) / 220) : piso.valor;
  if (salario < minimo) erros.push(`salário abaixo do piso de ${piso.funcao ?? "piso geral"} (${instrumento.registroMTE}): mínimo ${(minimo / 100).toFixed(2).replace(".", ",")}`);
  if (!piso.enquadrada) avisos.push(`função "${funcao}" fora da tabela da ${instrumento.tipo} ${instrumento.registroMTE}: vale o piso geral; enquadre a função do posto`);
  return { ok: erros.length === 0, erros, avisos, piso: { ...piso, minimo } };
}

/** Salário reajustado na data-base: o maior entre o piso e o salário com o reajuste mínimo. */
export function reajusteNaDataBase(instrumento, { funcao, salario }) {
  const piso = pisoDaFuncao(instrumento, funcao).valor;
  const reajustado = r(salario * (1 + (instrumento.reajuste?.percentual ?? 0) / 100));
  return { novoSalario: Math.max(piso, reajustado), piso, reajustado, desde: instrumento.reajuste?.desde ?? null };
}

/** Grau de insalubridade mínimo pela convenção (o laudo pode dar mais; vale o maior). */
export function insalubridadeMinima(instrumento, { funcao, hospital = false }) {
  const regra = instrumento.insalubridade ?? {};
  const porFuncao = (regra.porFuncao ?? []).find((f) => normalizar(f.funcao) === normalizar(funcao))?.grau ?? 0;
  return Math.max(porFuncao, hospital ? regra.minimoEmHospital ?? 0 : 0);
}

/** Divisor do valor-hora e desconto de vale-transporte conforme a escala. */
export function parametrosDaEscala(instrumento, escala) {
  const e12 = escala === "12X36" && instrumento.escala12x36;
  return {
    divisor: e12 ? instrumento.escala12x36.divisor : null,
    descontoVT: e12 ? instrumento.valeTransporte?.descontoPercentual12x36 ?? 6 : instrumento.valeTransporte?.descontoPercentual ?? 6,
  };
}

/**
 * Benefícios, descontos e custos do mês pela convenção.
 * @param dados { competencia, salarioBase, diasTrabalhados, faltasDias?, atestadoDias?, atrasosHoras?,
 *   associado?, oposicaoContribuicao?, admissao, desligamento?, emFeriasOuAfastado?, refeitorio?,
 *   descontoVRPercentual? (política da empresa, até o máximo da convenção) }
 * @returns { descontos: [{ chave, nome, valor }], custos: [{ chave, nome, valor }], beneficios: [{ chave, nome, valor }], avisos }
 */
export function beneficiosDoMes(instrumento, dados) {
  const descontos = [];
  const custos = [];
  const beneficios = [];
  const avisos = [];
  const mes = Number(dados.competencia.slice(5, 7));
  const inicioMes = `${dados.competencia}-01`;
  const mesCompleto = dados.admissao <= inicioMes && !(dados.desligamento && dados.desligamento.slice(0, 7) === dados.competencia);

  // Vale-refeição: por dia trabalhado, salvo refeitório.
  const vr = instrumento.valeRefeicao;
  if (vr && !(vr.dispensadoComRefeitorio && dados.refeitorio)) {
    const dias = Math.max(0, (dados.diasTrabalhados ?? 0) - (vr.faltaDescontaDia ? dados.faltasDias ?? 0 : 0));
    const valor = dias * vr.porDia;
    if (valor > 0) {
      beneficios.push({ chave: "VALE_REFEICAO", nome: `Vale-refeição (${dias} dias)`, valor });
      custos.push({ chave: "VALE_REFEICAO", nome: "Vale-refeição", valor });
      const pct = Math.min(dados.descontoVRPercentual ?? 0, vr.descontoMaximoPercentual ?? 0);
      if (pct > 0) descontos.push({ chave: "DESCONTO_VALE_REFEICAO", nome: `Vale-refeição (${pct}%)`, valor: r((valor * pct) / 100) });
    }
  }

  // Cesta básica: só associados, com as condições da cláusula.
  const cb = instrumento.cestaBasica;
  if (cb && (!cb.soAssociados || dados.associado)) {
    const motivos = [];
    if ((dados.faltasDias ?? 0) + (dados.atestadoDias ?? 0) > cb.faltasToleradas) motivos.push("faltas ou atestados acima do tolerado");
    if ((dados.atrasosHoras ?? 0) >= cb.atrasosHorasLimite) motivos.push("atrasos e saídas somando um dia");
    if (cb.perdeEmFeriasOuAfastamento && dados.emFeriasOuAfastado) motivos.push("férias ou afastamento no mês");
    if (cb.exigeMesCompleto && !mesCompleto) motivos.push("não trabalhou o mês inteiro");
    if (motivos.length) avisos.push(`Sem cesta básica no mês: ${motivos.join(", ")}.`);
    else {
      beneficios.push({ chave: "CESTA_BASICA", nome: "Cesta básica", valor: cb.valor });
      custos.push({ chave: "CESTA_BASICA", nome: "Cesta básica", valor: cb.valor });
    }
  }

  // Custos fixos por colaborador (odontológico, assistência social, seguro, qualificação).
  for (const c of instrumento.custosPorColaborador ?? []) {
    if (c.soContratosApos && dados.contratoTomadorInicio && dados.contratoTomadorInicio < c.soContratosApos) continue;
    custos.push({ chave: c.chave, nome: c.nome, valor: c.valor });
  }

  // Contribuições descontadas do colaborador, salvo oposição.
  const ct = instrumento.contribuicoes ?? {};
  if (ct.mensalidadeAssociativa && !dados.oposicaoContribuicao) {
    const m = ct.mensalidadeAssociativa;
    descontos.push({ chave: "MENSALIDADE_SINDICAL", nome: `Mensalidade associativa ${instrumento.sindicatoLaboral?.sigla ?? ""} (${m.percentualSalarioBase}%)`.trim(), valor: Math.max(m.minimo ?? 0, r((dados.salarioBase * m.percentualSalarioBase) / 100)) });
  }
  // Só na folha do mês fixado: quem é admitido depois dele não tem o desconto no ano.
  if (ct.assistencial && mes === ct.assistencial.mes && !dados.oposicaoContribuicao) {
    const a = ct.assistencial;
    descontos.push({ chave: "CONTRIBUICAO_ASSISTENCIAL", nome: `Contribuição assistencial ${instrumento.sindicatoLaboral?.sigla ?? ""}`.trim(), valor: dados.associado ? a.associado : a.naoAssociado });
  }
  return { descontos, custos, beneficios, avisos };
}

/** Contribuição negocial patronal do mês pelo número de colaboradores. */
export function contribuicaoPatronal(instrumento, colaboradores) {
  const faixa = (instrumento.contribuicaoNegocialPatronal ?? []).find((f) => f.ate === null || colaboradores <= f.ate);
  return faixa?.valor ?? 0;
}

/** Obrigações da rescisão pela convenção (além da lei). */
export function obrigacoesNaRescisao(instrumento, { admissao, desligamento, motivo }) {
  const regra = instrumento.rescisao ?? {};
  const meses = (Number(desligamento.slice(0, 4)) - Number(admissao.slice(0, 4))) * 12 + Number(desligamento.slice(5, 7)) - Number(admissao.slice(5, 7));
  const itens = [];
  if (regra.homologacaoSindicalAcimaDeMeses != null && meses >= regra.homologacaoSindicalAcimaDeMeses) {
    itens.push(`Homologação no ${instrumento.sindicatoLaboral?.sigla ?? "sindicato laboral"} (mais de ${regra.homologacaoSindicalAcimaDeMeses} meses de contrato).`);
  }
  if (regra.entregaDocumentosDias) itens.push(`Entregar TRCT e documentos ao sindicato em até ${regra.entregaDocumentosDias} dias do desligamento.`);
  if (regra.exigePPP) itens.push("Entregar o PPP na homologação, em qualquer motivo de desligamento.");
  if (regra.sucessaoContratual && motivo === regra.sucessaoContratual.motivoESocial) {
    itens.push(`Sucessão de contrato: rescisão por acordo na Comissão de Conciliação Prévia, com ${regra.sucessaoContratual.multaFGTS}% do FGTS e metade do aviso indenizado.`);
  }
  return { prazoPagamentoDias: regra.pagamentoDias ?? 10, itens };
}
