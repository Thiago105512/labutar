/**
 * Vínculo = uma contratação da pessoa (matrícula própria). Valida o destino pelo tipo de
 * vínculo e, no temporário, os prazos da Lei 6.019/1974 e a remuneração equivalente.
 */
import { validarDataISO } from "../../core/src/validacao.js";
import { TIPO_VINCULO, VINCULO_ACEITO_POR_CONTRATO, TIPO_CONTRATO_TOMADOR } from "../../mao-de-obra/src/constantes.js";
import { validarContratoTemporario } from "../../mao-de-obra/src/temporario.js";
import { verificarQuarentenaExEmpregado } from "../../mao-de-obra/src/terceirizacao.js";

const dataOk = (d) => validarDataISO(d).valido;

/**
 * @param dados { pessoaId, tipo, admissao, cargo, cbo?, salario, jornadaMensal?, postoId?, setor?,
 *   temporario?: { fimPrevisto, hipotese?, justificativa?, substituido? } }
 * @param contexto { pessoa, posto, contrato, tomador, vinculosDaPessoa, salarioMinimo, ocupados? }
 *   `ocupados`: vínculos ativos já no posto. Posto cheio impede a admissão: aumente as vagas
 *   no contrato com o tomador antes (o que o tomador pediu é o que se fatura).
 */
export function validarVinculo(dados = {}, contexto = {}) {
  const erros = [];
  const avisos = [];
  const { posto, contrato, tomador, vinculosDaPessoa = [], salarioMinimo = 0 } = contexto;
  if (!contexto.pessoa) erros.push("pessoa não encontrada no cadastro");
  if (!Object.values(TIPO_VINCULO).includes(dados.tipo)) erros.push("tipo de vínculo inválido");
  if (!dataOk(dados.admissao)) erros.push("data de admissão inválida");
  if (String(dados.cargo ?? posto?.funcao ?? "").trim().length < 3) erros.push("cargo obrigatório");
  if (!(Number.isInteger(dados.salario) && dados.salario > 0)) erros.push("salário em centavos, maior que zero");
  else if (salarioMinimo && dados.salario < salarioMinimo && !(dados.jornadaMensal < 220)) {
    erros.push("salário abaixo do salário mínimo para jornada integral");
  }
  if (erros.length) return { ok: false, erros, avisos };

  const ativo = vinculosDaPessoa.find((v) => !v.desligamento || v.desligamento >= dados.admissao);
  if (ativo) avisos.push(`a pessoa já tem vínculo ativo (matrícula ${ativo.matricula}): confira se é um segundo contrato de fato`);

  if (dados.tipo === TIPO_VINCULO.PROPRIO) {
    if (!dados.setor) erros.push("colaborador próprio é lotado em setor interno");
    if (dados.postoId) erros.push("colaborador próprio não ocupa posto de tomador");
  } else {
    if (!posto || !contrato || !tomador) {
      erros.push(`vínculo ${dados.tipo === TIPO_VINCULO.TEMPORARIO ? "temporário" : "terceirizado"} é alocado em posto de um contrato com tomador`);
      return { ok: false, erros, avisos };
    }
    if (VINCULO_ACEITO_POR_CONTRATO[contrato.tipo] !== dados.tipo) {
      erros.push(dados.tipo === TIPO_VINCULO.TEMPORARIO
        ? "temporário só pode ir para posto de contrato de trabalho temporário (art. 9º)"
        : "terceirizado só pode ir para posto de contrato de prestação de serviços (art. 5-B)");
    }
    if (Number.isInteger(contexto.ocupados) && posto.vagas && contexto.ocupados >= posto.vagas) {
      erros.push(`posto "${posto.funcao}" sem vaga livre (${contexto.ocupados} de ${posto.vagas} ocupadas): aumente as vagas no contrato com o tomador`);
    }
    if (dados.admissao < contrato.inicio || (contrato.fim && dados.admissao > contrato.fim)) {
      erros.push(`admissão fora da vigência do contrato com o tomador (${contrato.inicio} a ${contrato.fim ?? "em aberto"})`);
    }
  }

  if (dados.tipo === TIPO_VINCULO.TEMPORARIO && contrato?.tipo === TIPO_CONTRATO_TOMADOR.TRABALHO_TEMPORARIO) {
    const t = dados.temporario ?? {};
    const historico = vinculosDaPessoa
      .filter((v) => v.tipo === TIPO_VINCULO.TEMPORARIO && v.tomadorCnpj)
      .map((v) => ({ tomadorCnpj: v.tomadorCnpj, inicio: v.admissao, fim: v.desligamento ?? v.temporario?.fimPrevisto ?? null }));
    const r = validarContratoTemporario({
      inicio: dados.admissao,
      fimPrevisto: t.fimPrevisto,
      tomadorCnpj: tomador.cnpj,
      hipotese: t.hipotese ?? contrato.hipotese,
      justificativa: t.justificativa ?? contrato.justificativa,
      substituido: t.substituido,
      prorrogacao: t.prorrogacao,
    }, historico);
    erros.push(...r.erros);
    avisos.push(...(r.avisos ?? []));
    // Remuneração equivalente à dos empregados da tomadora na mesma função (art. 12, a).
    if (posto.salarioReferencia && dados.salario < posto.salarioReferencia) {
      erros.push(`salário abaixo do pago pela tomadora na função (remuneração equivalente, art. 12): mínimo ${(posto.salarioReferencia / 100).toFixed(2).replace(".", ",")}`);
    }
  }

  // Ex-empregado do tomador só vira terceirizado dele depois de 18 meses (art. 5-D).
  if (dados.tipo === TIPO_VINCULO.TERCEIRIZADO && tomador) {
    const q = verificarQuarentenaExEmpregado(contexto.pessoa?.empregosAnteriores ?? [], { tomadorCnpj: tomador.cnpj, inicio: dados.admissao });
    erros.push(...q.erros);
  }

  return { ok: erros.length === 0, erros, avisos };
}

/** Salário vigente na data, pelo histórico salarial (ordem de vigência). */
export function salarioNaData(vinculo, data) {
  const historico = [...(vinculo.historicoSalarial ?? [])].sort((a, b) => a.desde.localeCompare(b.desde));
  let atual = null;
  for (const h of historico) if (h.desde <= data) atual = h;
  return atual?.valor ?? vinculo.salario;
}

/** Registra alteração salarial com vigência e motivo (S-2206 no eSocial). */
export function alterarSalario(vinculo, { desde, valor, motivo }) {
  if (!dataOk(desde)) throw new Error("data de vigência inválida");
  if (desde < vinculo.admissao) throw new Error("alteração anterior à admissão");
  if (!(Number.isInteger(valor) && valor > 0)) throw new Error("salário em centavos, maior que zero");
  if (String(motivo ?? "").trim().length < 3) throw new Error("motivo da alteração obrigatório");
  const historico = [...(vinculo.historicoSalarial ?? [{ desde: vinculo.admissao, valor: vinculo.salario, motivo: "Admissão" }])]
    .filter((h) => h.desde !== desde);
  historico.push({ desde, valor, motivo: String(motivo).trim() });
  historico.sort((a, b) => a.desde.localeCompare(b.desde));
  return { ...vinculo, historicoSalarial: historico, salario: historico.at(-1).valor };
}
