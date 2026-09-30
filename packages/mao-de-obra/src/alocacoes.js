import { validarDataISO } from "../../core/src/validacao.js";
import { mesmaTomadora } from "./temporario.js";
import {
  DESTINO_POR_VINCULO,
  TIPO_ALOCACAO,
  TIPO_VINCULO,
  VINCULO_ACEITO_POR_CONTRATO,
} from "./constantes.js";

/**
 * Alocação: onde um vínculo está lotado num período.
 *   { id, vinculoId, tipo: PRINCIPAL | COBERTURA, postoId? , setorId?, inicio, fim? }
 *
 * PRINCIPAL é o posto fixo; COBERTURA é eventual (folguista, ferista,
 * reposição de falta) e prevalece no dia em que ocorre. É a alocação de
 * cada dia — não a do dia 1º — que decide para qual tomador vai o custo.
 */

const FIM_ABERTO = "9999-12-31";
const dataValida = (valor) => validarDataISO(valor).valido;
const vigente = (item, data) => item.inicio <= data && (item.fim ?? FIM_ABERTO) >= data;
const sobrepoe = (a, b) => a.inicio <= (b.fim ?? FIM_ABERTO) && b.inicio <= (a.fim ?? FIM_ABERTO);

/**
 * Valida uma alocação antes de gravar.
 * `contexto`: { vinculo, posto?, contrato?, setor?, alocacoesDoVinculo? }
 */
export function validarAlocacao(alocacao = {}, { vinculo, posto, contrato, setor, alocacoesDoVinculo = [] } = {}) {
  const erros = [];
  if (!vinculo?.id) return { ok: false, erros: ["alocação exige o vínculo"] };
  if (!Object.values(TIPO_ALOCACAO).includes(alocacao.tipo)) erros.push("tipo de alocação inválido");
  if (!dataValida(alocacao.inicio)) erros.push("inicio inválido");
  if (alocacao.fim && !dataValida(alocacao.fim)) erros.push("fim inválido");
  if (alocacao.fim && alocacao.fim < alocacao.inicio) erros.push("fim anterior ao inicio");
  if (erros.length) return { ok: false, erros };

  // Destino compatível com o tipo de vínculo.
  const destinoEsperado = DESTINO_POR_VINCULO[vinculo.tipo];
  if (destinoEsperado === "SETOR") {
    if (!alocacao.setorId || !setor) erros.push("colaborador próprio é lotado em setor interno, não em posto de tomador");
  } else {
    if (!alocacao.postoId || !posto || !contrato) {
      erros.push(`vínculo ${vinculo.tipo.toLowerCase()} é alocado em posto de um contrato com tomador`);
    } else {
      const aceito = VINCULO_ACEITO_POR_CONTRATO[contrato.tipo];
      if (aceito !== vinculo.tipo) {
        erros.push(
          vinculo.tipo === TIPO_VINCULO.TEMPORARIO
            ? "temporário só pode ser colocado em posto de contrato de trabalho temporário (art. 9º)"
            : "terceirizado só pode ser alocado em posto de contrato de prestação de serviços (art. 5-B)"
        );
      }
      if (posto.contratoId !== contrato.id) erros.push("o posto não pertence ao contrato informado");
      if (vinculo.tipo === TIPO_VINCULO.TEMPORARIO && vinculo.tomadorCnpj && !mesmaTomadora(vinculo.tomadorCnpj, contrato.tomadorCnpj)) {
        erros.push("o contrato temporário da pessoa é com outra tomadora; uma nova tomadora exige novo contrato temporário");
      }
      // Alocação sem fim fica limitada pelo fim do contrato; só um fim
      // explícito além dele, ou um início fora dele, é erro.
      const foraDoContrato = alocacao.inicio < contrato.inicio ||
        (contrato.fim && (alocacao.inicio > contrato.fim || (alocacao.fim && alocacao.fim > contrato.fim)));
      if (foraDoContrato) {
        erros.push(`alocação fora da vigência do contrato com a tomadora (${contrato.inicio} a ${contrato.fim ?? "em aberto"})`);
      }
    }
  }

  // Dentro da vigência do vínculo.
  if (vinculo.admissao && alocacao.inicio < vinculo.admissao) erros.push("alocação começa antes da admissão");
  if (vinculo.desligamento && alocacao.inicio > vinculo.desligamento) erros.push("alocação começa depois do desligamento");
  if (vinculo.desligamento && alocacao.fim && alocacao.fim > vinculo.desligamento) {
    erros.push("alocação termina depois do desligamento");
  }

  // Uma única principal por dia.
  if (alocacao.tipo === TIPO_ALOCACAO.PRINCIPAL) {
    const conflito = alocacoesDoVinculo.find(
      (a) => a.id !== alocacao.id && a.tipo === TIPO_ALOCACAO.PRINCIPAL && sobrepoe(a, alocacao)
    );
    if (conflito) erros.push(`já existe alocação principal no período (${conflito.inicio} a ${conflito.fim ?? "em aberto"}); encerre-a antes`);
  }

  return { ok: erros.length === 0, erros };
}

/** Alocação que vale num dia: cobertura do dia, senão a principal, senão nenhuma. */
export function alocacaoNoDia(alocacoes = [], vinculoId, data) {
  const doVinculo = alocacoes.filter((a) => a.vinculoId === vinculoId && vigente(a, data));
  return (
    doVinculo.find((a) => a.tipo === TIPO_ALOCACAO.COBERTURA) ??
    doVinculo.find((a) => a.tipo === TIPO_ALOCACAO.PRINCIPAL) ??
    null
  );
}

export const SEM_ALOCACAO = "SEM_ALOCACAO";

/**
 * Centro de custo em hierarquia tomador → contrato → posto, ou setor interno.
 * Custo sem alocação cai em SEM_ALOCACAO: é pendência, não despesa — alguém
 * trabalhou (ou recebeu) sem destino de faturamento.
 */
export function centroDeCusto(alocacao, postosPorId = {}) {
  if (!alocacao) return SEM_ALOCACAO;
  if (alocacao.setorId) return `SET:${alocacao.setorId}`;
  const posto = postosPorId[alocacao.postoId];
  if (!posto) return SEM_ALOCACAO;
  return `TOM:${posto.tomadorId}/CTR:${posto.contratoId}/POS:${posto.id}`;
}

/** Decompõe o código do centro de custo, para agregar por tomador ou contrato. */
export function partesDoCentroDeCusto(codigo) {
  if (codigo === SEM_ALOCACAO) return { tipo: SEM_ALOCACAO };
  if (codigo.startsWith("SET:")) return { tipo: "SETOR", setorId: codigo.slice(4) };
  const [tom, ctr, pos] = codigo.split("/");
  return { tipo: "POSTO", tomadorId: tom.slice(4), contratoId: ctr.slice(4), postoId: pos.slice(4) };
}

/**
 * Fim de contrato com um tomador. O temporário encerra junto; o
 * terceirizado NÃO é desligado automaticamente — o contrato de trabalho dele
 * é com a prestadora, e a decisão é realocar ou desligar (com aviso prévio).
 */
export function planoDeDesmobilizacao({ contrato, dataFim, vinculos = [], alocacoes = [], postos = [] } = {}) {
  const postosDoContrato = new Set(postos.filter((p) => p.contratoId === contrato.id).map((p) => p.id));
  const afetados = [];
  for (const vinculo of vinculos) {
    const alocacao = alocacoes.find(
      (a) => a.vinculoId === vinculo.id && a.tipo === TIPO_ALOCACAO.PRINCIPAL && postosDoContrato.has(a.postoId) && vigente(a, dataFim)
    );
    if (!alocacao) continue;
    afetados.push({
      vinculoId: vinculo.id,
      pessoaId: vinculo.pessoaId,
      tipo: vinculo.tipo,
      postoId: alocacao.postoId,
      acao: vinculo.tipo === TIPO_VINCULO.TEMPORARIO ? "ENCERRAR_CONTRATO_TEMPORARIO" : "REALOCAR_OU_DESLIGAR",
    });
  }
  return {
    contratoId: contrato.id,
    dataFim,
    afetados,
    temporarios: afetados.filter((a) => a.tipo === TIPO_VINCULO.TEMPORARIO).length,
    terceirizados: afetados.filter((a) => a.tipo === TIPO_VINCULO.TERCEIRIZADO).length,
  };
}
