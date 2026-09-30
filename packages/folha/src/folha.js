/**
 * Folha da competência: calcula o holerite de cada colaborador, separa quem vai para a
 * rescisão e monta o resumo — totais por verba, bases, encargos da empresa e custo por
 * lotação (tomador ou setor próprio), que é a base do S-1200 por lotação e da fatura.
 */
import { calcularHolerite } from "./holerite.js";
import { tabelaDaCompetencia } from "./tabelas.js";

export const REGIME_TRIBUTARIO = Object.freeze({
  /** Lucro real ou presumido: 20% de INSS patronal + RAT ajustado + terceiros. */
  NORMAL: "NORMAL",
  /** Simples Nacional com a contribuição patronal dentro do DAS (anexos I a III e V): sem 20% nem terceiros. */
  SIMPLES_CPP_NO_DAS: "SIMPLES_CPP_NO_DAS",
  /** Simples Nacional, anexo IV (limpeza, vigilância, obras): 20% + RAT fora do DAS; terceiros não. */
  SIMPLES_ANEXO_IV: "SIMPLES_ANEXO_IV",
});

/**
 * @param empresa { regime, ratPercentual, fap, terceirosPercentual, arredondamentoINSS?, local? }
 */
export function encargosDaEmpresa(baseINSS, empresa) {
  const r = Math.round;
  const regime = empresa.regime ?? REGIME_TRIBUTARIO.NORMAL;
  const pagaCPP = regime === REGIME_TRIBUTARIO.NORMAL || regime === REGIME_TRIBUTARIO.SIMPLES_ANEXO_IV;
  const patronal = pagaCPP ? r(baseINSS * 0.2) : 0;
  const rat = pagaCPP ? r((baseINSS * (empresa.ratPercentual ?? 0) * (empresa.fap ?? 1)) / 100) : 0;
  const terceiros = regime === REGIME_TRIBUTARIO.NORMAL ? r((baseINSS * (empresa.terceirosPercentual ?? 0)) / 100) : 0;
  return { patronal, rat, terceiros, total: patronal + rat + terceiros };
}

export function calcularFolha({ empresa = {}, competencia, colaboradores = [], lancamentos = {} }) {
  const tabela = tabelaDaCompetencia(competencia);
  const holerites = [];
  const pendencias = [];
  for (const c of colaboradores) {
    try {
      holerites.push(
        calcularHolerite(c, competencia, lancamentos[c.matricula] ?? {}, {
          tabela,
          local: c.local ?? empresa.local,
          arredondamentoINSS: empresa.arredondamentoINSS,
          arredondamentoFGTS: empresa.arredondamentoFGTS,
          dispensarIRRFAte10: empresa.dispensarIRRFAte10,
        })
      );
    } catch (erro) {
      pendencias.push({ matricula: c.matricula, nome: c.nome, motivo: erro.message });
    }
  }

  const porVerba = new Map();
  const porLotacao = new Map();
  const totais = { proventos: 0, descontos: 0, liquido: 0, baseINSS: 0, baseFGTS: 0, baseIRRF: 0, inss: 0, irrf: 0, fgts: 0 };

  for (const h of holerites) {
    totais.proventos += h.proventos;
    totais.descontos += h.descontos;
    totais.liquido += h.liquido;
    totais.baseINSS += h.bases.inss;
    totais.baseFGTS += h.bases.fgts;
    totais.baseIRRF += h.bases.irrf;
    totais.inss += h.detalhe.inss.valor;
    totais.irrf += h.detalhe.irrf.valor;
    totais.fgts += h.fgts;
    for (const i of h.itens) {
      const atual = porVerba.get(i.codigo) ?? { codigo: i.codigo, nome: i.nome, tipo: i.tipo, colaboradores: 0, valor: 0 };
      atual.colaboradores += 1;
      atual.valor += i.valor;
      porVerba.set(i.codigo, atual);
    }
    const chave = h.colaborador.lotacao ?? "SEM_LOTACAO";
    const l = porLotacao.get(chave) ?? { lotacao: chave, colaboradores: 0, proventos: 0, baseINSS: 0, fgts: 0 };
    l.colaboradores += 1;
    l.proventos += h.proventos;
    l.baseINSS += h.bases.inss;
    l.fgts += h.fgts;
    porLotacao.set(chave, l);
  }

  const lotacoes = [...porLotacao.values()].map((l) => {
    const encargos = encargosDaEmpresa(l.baseINSS, empresa);
    return { ...l, encargos, custoTotal: l.proventos + l.fgts + encargos.total };
  });
  const encargos = lotacoes.reduce(
    (s, l) => ({ patronal: s.patronal + l.encargos.patronal, rat: s.rat + l.encargos.rat, terceiros: s.terceiros + l.encargos.terceiros, total: s.total + l.encargos.total }),
    { patronal: 0, rat: 0, terceiros: 0, total: 0 }
  );

  return {
    competencia,
    tabela: { de: tabela.de, fontes: tabela.fontes },
    holerites,
    pendencias,
    resumo: {
      colaboradores: holerites.length,
      semCPF: holerites.filter((h) => h.pendencias.length).length,
      ...totais,
      encargos,
      custoTotal: totais.proventos + totais.fgts + encargos.total,
      porVerba: [...porVerba.values()].sort((a, b) => a.codigo.localeCompare(b.codigo)),
      porLotacao: lotacoes.sort((a, b) => b.custoTotal - a.custoTotal),
    },
  };
}
