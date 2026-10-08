/**
 * Termo de Rescisão do Contrato de Trabalho (TRCT) e recibo de férias, montados a partir do
 * registro gravado. O documento segue os blocos do modelo oficial (empregador, colaborador,
 * contrato, verbas, deduções, quitação). As verbas levam o código de rubrica do sistema (padrão
 * eSocial) e a causa do afastamento leva o código da Tabela 19.
 */
import { formatarDataBR } from "../../core/src/datas.js";

const NOME_VINCULO = Object.freeze({ TEMPORARIO: "Temporário (Lei 6.019/1974)", TERCEIRIZADO: "Prazo indeterminado (terceirizado)", PROPRIO: "Prazo indeterminado" });

/**
 * @param dados { empresa: { razaoSocial, cnpj, local? }, pessoa: { nome, cpf, nascimento?, nomeMae? },
 *   vinculo: { matricula, tipo, admissao, cargo?, sindicato? }, rescisao: registro gravado }
 */
export function montarTRCT({ empresa, pessoa, vinculo, rescisao }) {
  const res = rescisao.resultado;
  const proventos = res.itens.filter((i) => i.tipo === "PROVENTO");
  const descontos = res.itens.filter((i) => i.tipo === "DESCONTO");
  return {
    titulo: "Termo de Rescisão do Contrato de Trabalho",
    empregador: { razaoSocial: empresa.razaoSocial ?? null, cnpj: empresa.cnpj ?? null, municipio: empresa.local?.municipio ?? null, uf: empresa.local?.uf ?? null },
    colaborador: { nome: pessoa?.nome ?? res.colaborador.nome, cpf: pessoa?.cpf ?? res.colaborador.cpf, nascimento: pessoa?.nascimento ?? null, nomeMae: pessoa?.nomeMae ?? null, matricula: vinculo.matricula },
    contrato: {
      tipo: NOME_VINCULO[vinculo.tipo] ?? vinculo.tipo,
      cargo: vinculo.cargo ?? null,
      admissao: vinculo.admissao,
      avisoPrevio: res.aviso.dias ? { dias: res.aviso.dias, indenizado: res.aviso.indenizado } : null,
      afastamento: res.desligamento,
      fimProjetado: res.esocial.dtProjFimAPI,
      causa: { codigo: res.motivo.codigo, nome: res.motivo.nome },
      sindicato: vinculo.sindicato ? { nome: vinculo.sindicato.nome ?? null, cnpj: vinculo.sindicato.cnpj } : null,
      pensaoAlimenticia: null,
    },
    verbas: proventos,
    deducoes: descontos,
    totais: { bruto: res.proventos, deducoes: res.descontos, liquido: res.liquido },
    fgts: { mes: res.fgts.mes, multa: res.fgts.multa, multaPercentual: res.fgts.multaPercentual, saque: res.fgts.saque },
    prazoPagamento: rescisao.prazoPagamento,
    quitacao: `Foi realizada a rescisão do contrato de trabalho do colaborador acima qualificado, nos termos do art. 477 da CLT, com o pagamento das verbas acima especificadas no valor líquido indicado, até ${formatarDataBR(rescisao.prazoPagamento)}.`,
    esocial: res.esocial,
  };
}

/** Recibo de férias (art. 145 da CLT: pago até 2 dias antes do início do gozo). */
export function montarReciboFerias({ empresa, pessoa, vinculo, ferias }) {
  const rec = ferias.recibo;
  return {
    titulo: "Recibo de férias",
    empregador: { razaoSocial: empresa.razaoSocial ?? null, cnpj: empresa.cnpj ?? null },
    colaborador: { nome: pessoa?.nome ?? ferias.nome, cpf: pessoa?.cpf ?? null, matricula: vinculo.matricula, cargo: vinculo.cargo ?? null },
    periodoAquisitivo: { inicio: ferias.periodo.inicio, fim: ferias.periodo.fim },
    gozo: { inicio: rec.inicio, fim: rec.fim, dias: rec.dias, retorno: ferias.retorno },
    abonoDias: rec.abonoDias,
    itens: rec.itens,
    totais: { proventos: rec.proventos, descontos: rec.descontos, liquido: rec.liquido },
    fgts: rec.fgts,
    prazoPagamento: rec.prazoPagamento,
    declaracao: `Recebi a importância líquida acima, referente às férias do período aquisitivo de ${formatarDataBR(ferias.periodo.inicio)} a ${formatarDataBR(ferias.periodo.fim)}, a serem gozadas de ${formatarDataBR(rec.inicio)} a ${formatarDataBR(rec.fim)}, retornando ao trabalho em ${formatarDataBR(ferias.retorno)}.`,
  };
}
