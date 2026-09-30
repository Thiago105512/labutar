import { novoId } from "../../core/src/ids.js";
import { dataNoFuso, hoje, diferencaDias, estaVencendo } from "../../core/src/datas.js";
import { validarDataISO } from "../../core/src/validacao.js";
import { arredondar } from "../../core/src/dinheiro.js";
import { PESO_PRIORIDADE, PRIORIDADE_AVISO, PUBLICO_ALVO } from "./constantes.js";
import { agora, instanteOpcional } from "./instantes.js";

const VALOR_PRIORIDADE = Object.values(PRIORIDADE_AVISO);
const VALOR_PUBLICO = Object.values(PUBLICO_ALVO);

function diaDe(valor) {
  return valor === null || valor === undefined || valor === "" ? null : dataNoFuso(valor);
}

function normalizarVigencia(vigencia, problemas) {
  if (!vigencia) return { de: hoje(), ate: null };
  const de = diaDe(vigencia.de ?? hoje());
  const ate = diaDe(vigencia.ate ?? null);
  for (const [campo, valor] of [
    ["de", de],
    ["ate", ate],
  ]) {
    if (valor && !validarDataISO(valor).valido) {
      problemas.push({
        tipo: "VIGENCIA_INVALIDA",
        campo: `vigencia.${campo}`,
        mensagem: `Vigência "${valor}" não é uma data AAAA-MM-DD.`,
      });
    }
  }
  if (de && ate && diferencaDias(de, ate) < 0) {
    problemas.push({
      tipo: "VIGENCIA_INVERTIDA",
      campo: "vigencia",
      mensagem: `A vigência termina em ${ate}, antes de começar em ${de}.`,
    });
  }
  return { de, ate };
}

function normalizarPublico(publico, problemas) {
  const tipo = String(publico?.tipo ?? PUBLICO_ALVO.TODOS).toUpperCase();
  const valores = (Array.isArray(publico?.valores) ? publico.valores : []).map(String);

  if (!VALOR_PUBLICO.includes(tipo)) {
    problemas.push({
      tipo: "PUBLICO_INVALIDO",
      campo: "publico.tipo",
      mensagem: `Público "${publico?.tipo}" não existe. Use um de: ${VALOR_PUBLICO.join(", ")}.`,
    });
    return { tipo, valores };
  }
  if (tipo !== PUBLICO_ALVO.TODOS && valores.length === 0) {
    problemas.push({
      tipo: "PUBLICO_SEM_VALORES",
      campo: "publico.valores",
      mensagem: `Público ${tipo} exige ao menos um valor em publico.valores.`,
    });
  }
  return { tipo, valores };
}

/**
 * Cria um aviso do mural. Erros de preenchimento viram `problemas` (o autor
 * consegue salvar rascunho e corrigir depois), mas `destinatarios` fecha a porta
 * para público inválido: aviso mal configurado não é disparado para todo mundo.
 */
export function criarAviso({
  id = null,
  tenantId = null,
  titulo = "",
  corpo = "",
  publico = { tipo: PUBLICO_ALVO.TODOS, valores: [] },
  prioridade = PRIORIDADE_AVISO.NORMAL,
  fixado = false,
  vigencia = null,
  anexos = [],
  autorId = null,
  criadoEm = null,
  leituras = [],
} = {}) {
  const problemas = [];
  if (!String(titulo ?? "").trim()) {
    problemas.push({ tipo: "TITULO_OBRIGATORIO", campo: "titulo", mensagem: "O aviso precisa de um título." });
  }
  if (!String(corpo ?? "").trim()) {
    problemas.push({ tipo: "CORPO_OBRIGATORIO", campo: "corpo", mensagem: "O corpo do aviso não pode ficar vazio." });
  }

  const prioridadeNormalizada = String(prioridade ?? PRIORIDADE_AVISO.NORMAL).toUpperCase();
  if (!VALOR_PRIORIDADE.includes(prioridadeNormalizada)) {
    problemas.push({
      tipo: "PRIORIDADE_DESCONHECIDA",
      campo: "prioridade",
      mensagem: `Prioridade "${prioridade}" não existe. Use um de: ${VALOR_PRIORIDADE.join(", ")}.`,
    });
  }

  return {
    id: id ?? novoId("AVISO"),
    tenantId,
    titulo: String(titulo ?? ""),
    corpo: String(corpo ?? ""),
    publico: normalizarPublico(publico, problemas),
    prioridade: prioridadeNormalizada,
    fixado: fixado === true,
    vigencia: normalizarVigencia(vigencia, problemas),
    anexos: Array.isArray(anexos) ? [...anexos] : [],
    autorId,
    leituras: Array.isArray(leituras) ? [...leituras] : [],
    criadoEm: instanteOpcional(criadoEm, agora()),
    problemas,
    valido: problemas.length === 0,
  };
}

function papeisDe(usuario) {
  if (Array.isArray(usuario.papeis)) return usuario.papeis.map(String);
  return usuario.papel ? [String(usuario.papel)] : [];
}

function vagasDe(usuario) {
  if (Array.isArray(usuario.vagasIds)) return usuario.vagasIds.map(String);
  return usuario.vagaId ? [String(usuario.vagaId)] : [];
}

function idDe(usuario) {
  return String(usuario?.id ?? usuario?.usuarioId ?? "");
}

/**
 * Resolve o público-alvo numa lista concreta de usuários. Usuário com
 * `ativo === false` nunca entra. Tipo de público desconhecido devolve lista
 * vazia — melhor ninguém ver do que todo mundo ver o aviso errado.
 */
export function destinatarios(aviso, usuarios = []) {
  const lista = (Array.isArray(usuarios) ? usuarios : []).filter((u) => u && u.ativo !== false);
  const publico = aviso?.publico ?? { tipo: PUBLICO_ALVO.TODOS, valores: [] };
  const valores = new Set((publico.valores ?? []).map(String));

  switch (String(publico.tipo ?? "").toUpperCase()) {
    case PUBLICO_ALVO.TODOS:
      return lista;
    case PUBLICO_ALVO.PAPEIS:
      return lista.filter((u) => papeisDe(u).some((papel) => valores.has(papel)));
    case PUBLICO_ALVO.USUARIOS:
      return lista.filter((u) => valores.has(idDe(u)));
    case PUBLICO_ALVO.VAGA:
      return lista.filter((u) => vagasDe(u).some((vaga) => valores.has(vaga)));
    default:
      return [];
  }
}

/**
 * Confirmação de leitura, idempotente: a segunda chamada devolve o mesmo aviso,
 * preservando o horário do primeiro registro. Não muta a entrada — o servidor
 * grava o objeto retornado no Firestore.
 */
export function registrarLeitura(aviso, usuarioId, em = agora()) {
  if (!aviso || !usuarioId) return aviso;
  const identificador = String(usuarioId);
  const leituras = Array.isArray(aviso.leituras) ? aviso.leituras : [];
  if (leituras.some((leitura) => String(leitura.usuarioId) === identificador)) return aviso;
  return {
    ...aviso,
    leituras: [...leituras, { usuarioId: identificador, em: instanteOpcional(em, agora()) }],
  };
}

/** Leituras de quem está fora do público-alvo não contam para a taxa. */
export function leituraPorUsuario(aviso, usuarios = []) {
  const publico = destinatarios(aviso, usuarios);
  const ids = publico.map(idDe).filter(Boolean);
  const lidas = new Set((aviso?.leituras ?? []).map((leitura) => String(leitura.usuarioId)));
  const lidos = ids.filter((id) => lidas.has(id));
  const naoLidos = ids.filter((id) => !lidas.has(id));
  return {
    total: ids.length,
    lidos,
    naoLidos,
    taxaLeitura: ids.length === 0 ? 0 : arredondar(lidos.length / ids.length, 4),
  };
}

export function avisosVigentes(avisos = [], referencia = hoje()) {
  const dia = diaDe(referencia);
  return (Array.isArray(avisos) ? avisos : []).filter((aviso) => {
    const { de, ate } = aviso?.vigencia ?? {};
    if (diaDe(de) && diferencaDias(diaDe(de), dia) < 0) return false;
    if (diaDe(ate) && diferencaDias(dia, diaDe(ate)) < 0) return false;
    return true;
  });
}

/** Avisos com fim de vigência próximo ou já vencido, usando o core estaVencendo. */
export function avisosVencendo(avisos = [], diasAntes = 7, referencia = hoje()) {
  return (Array.isArray(avisos) ? avisos : [])
    .filter((aviso) => diaDe(aviso?.vigencia?.ate))
    .map((aviso) => {
      const situacao = estaVencendo(diaDe(aviso.vigencia.ate), diasAntes, diaDe(referencia));
      return {
        aviso,
        diasRestantes: situacao.diasRestantes,
        urgencia: situacao.urgencia,
        vencendo: situacao.vencendo,
        vencido: situacao.vencido,
      };
    })
    .filter((item) => item.vencendo || item.vencido)
    .sort((a, b) => a.diasRestantes - b.diasRestantes);
}

/**
 * Ordem do mural, determinística: prioridade, depois fixado, depois o mais
 * recente. Empate técnico desempatado pelo id para a lista não "piscar" entre
 * duas renderizações. Não muta o array recebido.
 */
export function ordenarAvisos(avisos = []) {
  return [...(Array.isArray(avisos) ? avisos : [])].sort((a, b) => {
    const pesoA = PESO_PRIORIDADE[String(a?.prioridade ?? "").toUpperCase()] ?? PESO_PRIORIDADE.NORMAL;
    const pesoB = PESO_PRIORIDADE[String(b?.prioridade ?? "").toUpperCase()] ?? PESO_PRIORIDADE.NORMAL;
    if (pesoA !== pesoB) return pesoA - pesoB;

    const fixadoA = a?.fixado ? 0 : 1;
    const fixadoB = b?.fixado ? 0 : 1;
    if (fixadoA !== fixadoB) return fixadoA - fixadoB;

    const criadoA = String(a?.criadoEm ?? "");
    const criadoB = String(b?.criadoEm ?? "");
    if (criadoA !== criadoB) return criadoA < criadoB ? 1 : -1;

    const idA = String(a?.id ?? "");
    const idB = String(b?.id ?? "");
    if (idA === idB) return 0;
    return idA < idB ? -1 : 1;
  });
}
