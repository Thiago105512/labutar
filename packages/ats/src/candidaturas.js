import { novoId } from "../../core/src/ids.js";
import { diferencaDias, hoje } from "../../core/src/datas.js";
import { arredondar } from "../../core/src/dinheiro.js";
import {
  etapaDeSaidaPorMotivo,
  etapasAtivas,
  etapaPorId,
} from "./vagas.js";
import { triagemAutomatica } from "./triagem.js";
import {
  DECISAO_TRIAGEM,
  MOTIVO_SAIDA,
  STATUS_CANDIDATURA,
  STATUS_VAGA,
  TIPO_ETAPA,
} from "./constantes.js";

const STATUS_POR_MOTIVO_SAIDA = {
  [MOTIVO_SAIDA.REPROVADO]: STATUS_CANDIDATURA.REPROVADO,
  [MOTIVO_SAIDA.DESISTENTE]: STATUS_CANDIDATURA.DESISTENTE,
  [MOTIVO_SAIDA.BANCO_TALENTOS]: STATUS_CANDIDATURA.BANCO,
  [MOTIVO_SAIDA.VAGA_CANCELADA]: STATUS_CANDIDATURA.REPROVADO,
};

const TERMINAIS = new Set([
  STATUS_CANDIDATURA.REPROVADO,
  STATUS_CANDIDATURA.DESISTENTE,
  STATUS_CANDIDATURA.BANCO,
]);

export function estaTerminal(candidatura) {
  return TERMINAIS.has(candidatura?.status);
}

function etapaInicialPorDecisao(vaga, decisao) {
  if (
    decisao === DECISAO_TRIAGEM.REPROVADO_AUTOMATICO ||
    decisao === DECISAO_TRIAGEM.REPROVADO_KNOCKOUT
  ) {
    return etapaDeSaidaPorMotivo(vaga, MOTIVO_SAIDA.REPROVADO);
  }

  const ativas = etapasAtivas(vaga);
  if (decisao === DECISAO_TRIAGEM.APROVADO_AUTOMATICO) {
    return ativas.find((e) => e.tipo !== TIPO_ETAPA.TRIAGEM) ?? ativas[0] ?? null;
  }
  return ativas.find((e) => e.tipo === TIPO_ETAPA.TRIAGEM) ?? ativas[0] ?? null;
}

function statusPorEtapa(etapa, decisao) {
  if (etapa?.tipo === TIPO_ETAPA.SAIDA) {
    return STATUS_POR_MOTIVO_SAIDA[etapa.motivo] ?? STATUS_CANDIDATURA.REPROVADO;
  }
  return decisao === DECISAO_TRIAGEM.REPROVADO_AUTOMATICO ||
    decisao === DECISAO_TRIAGEM.REPROVADO_KNOCKOUT
    ? STATUS_CANDIDATURA.REPROVADO
    : STATUS_CANDIDATURA.EM_ANDAMENTO;
}

/**
 * Cria a candidatura já triada. A vaga precisa estar ABERTA: aceitar
 * candidatura em vaga encerrada geraria passivo trabalhista e reclamação
 * de candidato que nunca recebe retorno.
 */
export function criarCandidatura({ vaga, candidato, respostas = [], origem = null, agora } = {}) {
  if (!vaga?.id) throw new Error("criarCandidatura exige a vaga");
  if (!candidato?.id) throw new Error("criarCandidatura exige o candidato");
  if (vaga.status !== STATUS_VAGA.ABERTA) {
    throw new Error(`vaga ${vaga.id} não está aberta (status: ${vaga.status})`);
  }

  const quando = agora ?? new Date().toISOString();
  const triagem = triagemAutomatica({
    vaga,
    candidato,
    respostas,
    agora: String(quando).slice(0, 10),
  });

  const etapa = etapaInicialPorDecisao(vaga, triagem.decisao);
  if (!etapa) {
    throw new Error(`vaga ${vaga.id} sem etapa para a decisão ${triagem.decisao}`);
  }

  return {
    id: novoId("CTDA"),
    tenantId: vaga.tenantId ?? null,
    vagaId: vaga.id,
    candidatoId: candidato.id,
    etapaAtualId: etapa.id,
    etapaAtualDesde: quando,
    origem: origem ?? { canal: "DIRETO", utm: null, publicacaoId: null },
    respostasKnockout: triagem.knockout.respostas,
    score: {
      total: triagem.score.total,
      corteMinimo: triagem.score.corteMinimo,
      destaque: triagem.score.destaque,
      componentes: triagem.score.componentes,
      pesos: triagem.score.pesos,
    },
    triagem,
    status: statusPorEtapa(etapa, triagem.decisao),
    motivoReprovacao: triagem.decisao.startsWith("REPROVADO") ? triagem.motivo : null,
    historico: [
      {
        etapaId: etapa.id,
        de: null,
        para: etapa.id,
        em: quando,
        porUsuarioId: "sistema",
        observacao: `triagem automática: ${triagem.decisao}`,
      },
    ],
    avaliacoes: [],
    entrevistas: [],
    avaliacoesInternas: [],
    anexos: [],
    criadoEm: quando,
    atualizadoEm: quando,
  };
}

export function moverEtapa(candidatura, { vaga, paraEtapaId, usuarioId, observacao = "", agora, reabrir = false } = {}) {
  if (!candidatura?.id) throw new Error("moverEtapa exige a candidatura");
  if (!vaga?.id) throw new Error("moverEtapa exige a vaga para validar a etapa de destino");

  const quando = agora ?? new Date().toISOString();

  if (estaTerminal(candidatura) && !reabrir) {
    return {
      ok: false,
      candidatura,
      motivo: `candidatura em status terminal ${candidatura.status}; use reabrir: true para desfazer`,
    };
  }

  const etapa = etapaPorId(vaga, paraEtapaId);
  if (!etapa) {
    return { ok: false, candidatura, motivo: `etapa ${paraEtapaId} não existe na vaga ${vaga.id}` };
  }
  if (etapa.id === candidatura.etapaAtualId) {
    return { ok: false, candidatura, motivo: "candidatura já está nessa etapa" };
  }

  const novoStatus = etapa.tipo === TIPO_ETAPA.SAIDA
    ? STATUS_POR_MOTIVO_SAIDA[etapa.motivo] ?? STATUS_CANDIDATURA.REPROVADO
    : STATUS_CANDIDATURA.EM_ANDAMENTO;

  const atualizada = {
    ...candidatura,
    etapaAtualId: etapa.id,
    etapaAtualDesde: quando,
    status: novoStatus,
    motivoReprovacao:
      etapa.tipo === TIPO_ETAPA.SAIDA ? etapa.motivo : null,
    atualizadoEm: quando,
    historico: [
      ...candidatura.historico,
      {
        etapaId: etapa.id,
        de: candidatura.etapaAtualId,
        para: etapa.id,
        em: quando,
        porUsuarioId: usuarioId ?? null,
        observacao,
      },
    ],
  };

  return { ok: true, candidatura: atualizada, motivo: null };
}

export function desistir(candidatura, { vaga, agora, motivo = "" } = {}) {
  const etapa = etapaDeSaidaPorMotivo(vaga, MOTIVO_SAIDA.DESISTENTE);
  if (!etapa) {
    return { ok: false, candidatura, motivo: "a vaga não tem etapa de saída para desistência" };
  }
  return moverEtapa(candidatura, {
    vaga,
    paraEtapaId: etapa.id,
    usuarioId: "candidato",
    observacao: motivo,
    agora,
    reabrir: true,
  });
}

export function registrarAvaliacaoInterna(candidatura, { usuarioId, nota, parecer = "", agora } = {}) {
  if (!usuarioId) throw new Error("avaliação interna exige usuarioId");
  if (typeof nota !== "number" || nota < 0 || nota > 5) {
    throw new Error("nota deve ser um número entre 0 e 5");
  }
  const quando = agora ?? new Date().toISOString();
  return {
    ...candidatura,
    atualizadoEm: quando,
    avaliacoesInternas: [
      ...(candidatura.avaliacoesInternas ?? []).filter((a) => a.usuarioId !== usuarioId),
      { usuarioId, nota, parecer, em: quando },
    ],
  };
}

export function registrarAnexo(candidatura, { nome, url, tipo = "curriculo", agora } = {}) {
  if (!nome || !url) throw new Error("anexo exige nome e url");
  const quando = agora ?? new Date().toISOString();
  return {
    ...candidatura,
    atualizadoEm: quando,
    anexos: [...(candidatura.anexos ?? []), { nome, url, tipo, enviadoEm: quando }],
  };
}

/** Tempo na etapa atual e por etapa já percorrida, contra o SLA configurado. */
export function calcularSLA(candidatura, vaga, referencia = hoje()) {
  const dataRef = String(referencia).slice(0, 10);
  const atual = etapaPorId(vaga, candidatura.etapaAtualId);
  const emAndamento = !estaTerminal(candidatura);

  const desdeAtual = String(candidatura.etapaAtualDesde).slice(0, 10);
  const diasNaEtapa = diferencaDias(desdeAtual, dataRef);
  const slaAtual = atual?.slaDias ?? null;

  const porEtapa = [];
  for (let i = 1; i < candidatura.historico.length; i++) {
    const anterior = candidatura.historico[i - 1];
    const entrada = candidatura.historico[i];
    const etapa = etapaPorId(vaga, anterior.para);
    porEtapa.push({
      etapaId: anterior.para,
      nome: etapa?.nome ?? anterior.para,
      dias: diferencaDias(String(anterior.em).slice(0, 10), String(entrada.em).slice(0, 10)),
      slaDias: etapa?.slaDias ?? null,
    });
  }

  return {
    etapaAtualId: candidatura.etapaAtualId,
    diasNaEtapa,
    slaDias: slaAtual,
    atrasada: emAndamento && slaAtual != null && diasNaEtapa > slaAtual,
    diasExcedidos: slaAtual != null ? Math.max(0, diasNaEtapa - slaAtual) : 0,
    porEtapa,
    diasTotais: diferencaDias(String(candidatura.criadoEm).slice(0, 10), dataRef),
  };
}

/** Funil do processo seletivo — alimenta o dashboard do recrutador. */
export function funil(candidaturas, vaga) {
  const ativas = etapasAtivas(vaga);
  const porEtapa = ativas.map((etapa) => ({
    etapaId: etapa.id,
    nome: etapa.nome,
    quantidade: candidaturas.filter((c) => c.etapaAtualId === etapa.id && !estaTerminal(c)).length,
  }));

  const contagem = (status) => candidaturas.filter((c) => c.status === status).length;
  const total = candidaturas.length;
  const aprovados = contagem(STATUS_CANDIDATURA.APROVADO);
  const reprovados = contagem(STATUS_CANDIDATURA.REPROVADO);

  return {
    total,
    porEtapa,
    emAndamento: contagem(STATUS_CANDIDATURA.EM_ANDAMENTO),
    aprovados,
    reprovados,
    desistentes: contagem(STATUS_CANDIDATURA.DESISTENTE),
    banco: contagem(STATUS_CANDIDATURA.BANCO),
    destaques: candidaturas.filter((c) => c.score?.destaque).length,
    taxaConversao: total > 0 ? arredondar((aprovados / total) * 100, 2) : 0,
    taxaReprovacao: total > 0 ? arredondar((reprovados / total) * 100, 2) : 0,
  };
}

export function tempoMedioPorEtapa(candidaturas, vaga) {
  const acumulado = new Map();
  for (const candidatura of candidaturas) {
    for (const trecho of calcularSLA(candidatura, vaga).porEtapa) {
      const atual = acumulado.get(trecho.etapaId) ?? { etapaId: trecho.etapaId, nome: trecho.nome, dias: 0, amostras: 0 };
      atual.dias += trecho.dias;
      atual.amostras += 1;
      acumulado.set(trecho.etapaId, atual);
    }
  }
  return [...acumulado.values()].map((item) => ({
    etapaId: item.etapaId,
    nome: item.nome,
    amostras: item.amostras,
    diasMedios: arredondar(item.dias / item.amostras, 1),
  }));
}

export function origensDasCandidaturas(candidaturas) {
  const contagem = new Map();
  for (const c of candidaturas) {
    const canal = c.origem?.canal ?? "DESCONHECIDO";
    contagem.set(canal, (contagem.get(canal) ?? 0) + 1);
  }
  return [...contagem.entries()]
    .map(([canal, quantidade]) => ({ canal, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.canal.localeCompare(b.canal));
}
