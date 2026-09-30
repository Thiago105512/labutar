/**
 * Itens de custo (catálogo com preço) e lançamentos de custo. Todo custo tem destino: um
 * colaborador (vai para o contrato em que ele trabalha), um contrato, ou um rateio entre
 * contratos. Material de vida útil longa (bota, uniforme) pode ser amortizado em meses.
 * Valores em centavos.
 */
import { validarDataISO } from "../../core/src/validacao.js";
import { distribuirCentavos } from "../../mao-de-obra/src/rateio.js";

export const TIPO_CUSTO = Object.freeze({
  UNIFORME: Object.freeze({ nome: "Uniforme", material: true }),
  EPI: Object.freeze({ nome: "EPI", material: true }),
  CRACHA: Object.freeze({ nome: "Crachá", material: true }),
  EXAME: Object.freeze({ nome: "Exame ocupacional", material: false }),
  TREINAMENTO: Object.freeze({ nome: "Treinamento", material: false }),
  PREPOSTO: Object.freeze({ nome: "Despesas de preposto e supervisão", material: false }),
  TRANSPORTE: Object.freeze({ nome: "Transporte", material: false }),
  EQUIPAMENTO: Object.freeze({ nome: "Equipamentos e materiais", material: true }),
  ADMINISTRATIVO: Object.freeze({ nome: "Despesa administrativa", material: false }),
  OUTROS: Object.freeze({ nome: "Outros", material: false }),
});

export const DESTINO_CUSTO = Object.freeze({ COLABORADOR: "COLABORADOR", CONTRATO: "CONTRATO", RATEIO: "RATEIO" });

const inteiroEntre = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

export function validarItemDeCusto(i = {}) {
  const erros = [];
  if (String(i.nome ?? "").trim().length < 3) erros.push("nome do item obrigatório");
  if (!TIPO_CUSTO[i.tipo]) erros.push("tipo de custo inválido");
  if (!inteiroEntre(i.custoUnitario, 1, 100_000_000)) erros.push("custo unitário em centavos, maior que zero");
  if (i.amortizarMeses != null && !inteiroEntre(i.amortizarMeses, 1, 60)) erros.push("amortização de 1 a 60 meses");
  return {
    ok: erros.length === 0, erros,
    item: { nome: String(i.nome ?? "").trim(), tipo: i.tipo, custoUnitario: i.custoUnitario, amortizarMeses: i.amortizarMeses ?? 1, descricao: i.descricao ?? null },
  };
}

/**
 * @param l { data, tipo, descricao, quantidade, custoUnitario, amortizarMeses?, itemId?,
 *   destino: { tipo: COLABORADOR, matricula } | { tipo: CONTRATO, contratoId } | { tipo: RATEIO, contratoIds?: [] (vazio = todos) } }
 */
export function validarLancamentoDeCusto(l = {}) {
  const erros = [];
  if (!validarDataISO(l.data ?? "").valido) erros.push("data inválida");
  if (!TIPO_CUSTO[l.tipo]) erros.push("tipo de custo inválido");
  if (String(l.descricao ?? "").trim().length < 3) erros.push("descrição obrigatória");
  if (!inteiroEntre(l.quantidade, 1, 100_000)) erros.push("quantidade inteira maior que zero");
  if (!inteiroEntre(l.custoUnitario, 1, 100_000_000)) erros.push("custo unitário em centavos, maior que zero");
  const amortizar = l.amortizarMeses ?? 1;
  if (!inteiroEntre(amortizar, 1, 60)) erros.push("amortização de 1 a 60 meses");
  const d = l.destino ?? {};
  if (d.tipo === DESTINO_CUSTO.COLABORADOR && !d.matricula) erros.push("informe o colaborador");
  else if (d.tipo === DESTINO_CUSTO.CONTRATO && !d.contratoId) erros.push("informe o contrato");
  else if (d.tipo === DESTINO_CUSTO.RATEIO && d.contratoIds != null && !Array.isArray(d.contratoIds)) erros.push("contratos do rateio em lista");
  else if (!Object.values(DESTINO_CUSTO).includes(d.tipo)) erros.push("destino do custo: colaborador, contrato ou rateio");
  return {
    ok: erros.length === 0, erros,
    lancamento: {
      data: l.data, competencia: String(l.data ?? "").slice(0, 7), tipo: l.tipo, descricao: String(l.descricao ?? "").trim(),
      quantidade: l.quantidade, custoUnitario: l.custoUnitario, valor: (l.quantidade ?? 0) * (l.custoUnitario ?? 0),
      amortizarMeses: amortizar, itemId: l.itemId ?? null,
      destino: d.tipo === DESTINO_CUSTO.RATEIO ? { tipo: d.tipo, contratoIds: d.contratoIds?.length ? d.contratoIds : null } : { ...d },
    },
  };
}

const indiceDoMes = (competencia) => Number(competencia.slice(0, 4)) * 12 + Number(competencia.slice(5, 7)) - 1;

/** Parte do lançamento reconhecida na competência (amortização em parcelas iguais, sem perder centavo). */
export function parcelaNaCompetencia(lancamento, competencia) {
  const n = lancamento.amortizarMeses ?? 1;
  const i = indiceDoMes(competencia) - indiceDoMes(lancamento.data.slice(0, 7));
  if (i < 0 || i >= n) return 0;
  return distribuirCentavos(lancamento.valor, Array(n).fill(1))[i];
}
