import { novoId } from "../../core/src/ids.js";
import { slug, normalizar } from "../../core/src/texto.js";
import { somenteDigitos, validarDataISO } from "../../core/src/validacao.js";
import { diferencaDias } from "../../core/src/datas.js";
import {
  ETAPAS_PADRAO,
  MODELO_TRABALHO,
  MOTIVO_SAIDA,
  REGRAS_TRIAGEM_PADRAO,
  STATUS_VAGA,
  TIPO_ETAPA,
  TIPO_KNOCKOUT,
} from "./constantes.js";

const TRANSICOES = {
  [STATUS_VAGA.RASCUNHO]: [STATUS_VAGA.ABERTA, STATUS_VAGA.CANCELADA],
  [STATUS_VAGA.ABERTA]: [STATUS_VAGA.PAUSADA, STATUS_VAGA.ENCERRADA, STATUS_VAGA.CANCELADA],
  [STATUS_VAGA.PAUSADA]: [STATUS_VAGA.ABERTA, STATUS_VAGA.ENCERRADA, STATUS_VAGA.CANCELADA],
  [STATUS_VAGA.ENCERRADA]: [STATUS_VAGA.ABERTA],
  [STATUS_VAGA.CANCELADA]: [],
};

export function transicoesPermitidas(status) {
  return TRANSICOES[status] ?? [];
}

export function etapasPadrao() {
  return ETAPAS_PADRAO.map((etapa) => ({ ...etapa }));
}

export function slugUnico(titulo, slugsExistentes = []) {
  const base = slug(titulo) || "vaga";
  const usados = new Set(slugsExistentes);
  if (!usados.has(base)) return base;
  let sufixo = 2;
  while (usados.has(`${base}-${sufixo}`)) sufixo += 1;
  return `${base}-${sufixo}`;
}

export function criarVaga(dados = {}, { agora } = {}) {
  const titulo = String(dados.titulo ?? "").trim();
  if (!titulo) throw new Error("titulo é obrigatório para criar uma vaga");

  const etapas = (dados.etapas ?? etapasPadrao()).map((etapa, indice) => ({
    slaDias: 5,
    ...etapa,
    ordem: etapa.ordem ?? indice + 1,
  }));

  return {
    id: dados.id ?? novoId("VAGA"),
    tenantId: dados.tenantId ?? null,
    clienteId: dados.clienteId ?? null,
    titulo,
    slug: dados.slug ?? slugUnico(titulo),
    resumo: dados.resumo ?? "",
    descricao: dados.descricao ?? "",
    responsabilidades: dados.responsabilidades ?? [],
    requisitos: dados.requisitos ?? [],
    beneficios: dados.beneficios ?? [],
    competencias: dados.competencias ?? [],
    area: dados.area ?? null,
    nivel: dados.nivel ?? null,
    cbo: dados.cbo ?? null,
    tipoContrato: dados.tipoContrato ?? "CLT",
    jornada: dados.jornada ?? { tipo: "INTEGRAL", horasSemanais: 44 },
    local: dados.local ?? { modelo: MODELO_TRABALHO.PRESENCIAL },
    salario: dados.salario ?? { min: null, max: null, exibir: false },
    quantidadeVagas: dados.quantidadeVagas ?? 1,
    idiomas: dados.idiomas ?? [],
    formacaoMinima: dados.formacaoMinima ?? 0,
    etapas,
    knockout: dados.knockout ?? [],
    regrasTriagem: { ...REGRAS_TRIAGEM_PADRAO, ...(dados.regrasTriagem ?? {}) },
    status: STATUS_VAGA.RASCUNHO,
    recrutadorId: dados.recrutadorId ?? null,
    requisitanteId: dados.requisitanteId ?? null,
    datas: {
      criadaEm: dados.datas?.criadaEm ?? agora ?? new Date().toISOString(),
      abertaEm: dados.datas?.abertaEm ?? null,
      encerradaEm: dados.datas?.encerradaEm ?? null,
      previsaoContratacao: dados.datas?.previsaoContratacao ?? null,
    },
    seo: dados.seo ?? null,
    diversidade: dados.diversidade ?? null,
    acessibilidade: dados.acessibilidade ?? null,
  };
}

export function validarVaga(vaga = {}) {
  const erros = [];
  const avisos = [];

  const titulo = String(vaga.titulo ?? "").trim();
  if (titulo.length < 3) erros.push("titulo deve ter ao menos 3 caracteres");
  if (titulo.length > 120) erros.push("titulo deve ter no máximo 120 caracteres");

  const descricao = String(vaga.descricao ?? "");
  if (descricao.trim().length < 50) erros.push("descricao deve ter ao menos 50 caracteres");
  else if (descricao.trim().length < 200) avisos.push("descricao curta reduz a taxa de candidatura");

  if (!(vaga.quantidadeVagas >= 1)) erros.push("quantidadeVagas deve ser ao menos 1");

  const salario = vaga.salario ?? {};
  if (salario.min != null && salario.max != null && salario.min > salario.max) {
    erros.push("salario.min não pode ser maior que salario.max");
  }
  if (!salario.exibir || (salario.min == null && salario.max == null)) {
    avisos.push("vaga sem faixa salarial publicada atrai menos candidatos qualificados");
  }

  const local = vaga.local ?? {};
  if (local.modelo === MODELO_TRABALHO.PRESENCIAL || local.modelo === MODELO_TRABALHO.HIBRIDO) {
    if (!local.cidade || !local.uf) erros.push(`vaga ${local.modelo} exige cidade e uf`);
  }
  if (local.uf && !/^[A-Za-z]{2}$/.test(local.uf)) erros.push("local.uf deve ter 2 letras");

  if (vaga.cbo != null) {
    const cbo = somenteDigitos(vaga.cbo);
    if (cbo.length !== 7) erros.push("cbo deve ter 7 dígitos");
  }

  const etapas = vaga.etapas ?? [];
  const idsEtapa = new Set();
  for (const etapa of etapas) {
    if (!etapa.id) erros.push("toda etapa precisa de id");
    else if (idsEtapa.has(etapa.id)) erros.push(`etapa duplicada: ${etapa.id}`);
    idsEtapa.add(etapa.id);
    if (!Object.values(TIPO_ETAPA).includes(etapa.tipo)) {
      erros.push(`etapa ${etapa.id} com tipo inválido: ${etapa.tipo}`);
    }
    if (etapa.tipo === TIPO_ETAPA.SAIDA && !Object.values(MOTIVO_SAIDA).includes(etapa.motivo)) {
      erros.push(`etapa de saída ${etapa.id} precisa de um motivo válido`);
    }
  }
  const ordens = etapas.map((e) => e.ordem);
  if (new Set(ordens).size !== ordens.length) erros.push("ordem das etapas deve ser única");
  if (etapasAtivas({ etapas }).length < 2) erros.push("a vaga precisa de ao menos 2 etapas ativas");
  if (!etapas.some((e) => e.tipo === TIPO_ETAPA.SAIDA)) {
    avisos.push("sem etapa de saída não há como registrar reprovação ou desistência");
  }

  const idsKnockout = new Set();
  for (const pergunta of vaga.knockout ?? []) {
    if (!pergunta.id) erros.push("toda pergunta knockout precisa de id");
    else if (idsKnockout.has(pergunta.id)) erros.push(`knockout duplicado: ${pergunta.id}`);
    idsKnockout.add(pergunta.id);
    if (!Object.values(TIPO_KNOCKOUT).includes(pergunta.tipo)) {
      erros.push(`knockout ${pergunta.id} com tipo inválido: ${pergunta.tipo}`);
    }
    if (pergunta.tipo === TIPO_KNOCKOUT.MULTIPLA && !(pergunta.opcoesAceitas ?? []).length) {
      erros.push(`knockout ${pergunta.id} MULTIPLA precisa de opcoesAceitas`);
    }
  }
  if ((vaga.knockout ?? []).length === 0) {
    avisos.push("sem perguntas knockout a triagem automática só usa o score de aderência");
  }

  for (const competencia of vaga.competencias ?? []) {
    if (!competencia.nome?.trim()) erros.push("competência sem nome");
    if ((competencia.peso ?? 1) <= 0) erros.push(`peso da competência ${competencia.nome} deve ser positivo`);
  }

  const regras = vaga.regrasTriagem ?? {};
  const pesos = { ...REGRAS_TRIAGEM_PADRAO.pesos, ...(regras.pesos ?? {}) };
  const somaPesos = Object.values(pesos).reduce((a, b) => a + b, 0);
  if (somaPesos <= 0) erros.push("a soma dos pesos da triagem deve ser positiva");
  const corte = regras.corteMinimo ?? REGRAS_TRIAGEM_PADRAO.corteMinimo;
  if (corte < 0 || corte > 100) erros.push("corteMinimo deve estar entre 0 e 100");

  for (const campo of ["abertaEm", "encerradaEm", "previsaoContratacao"]) {
    const valor = vaga.datas?.[campo];
    if (valor && !validarDataISO(valor).valido) erros.push(`datas.${campo} inválida`);
  }
  if (vaga.datas?.abertaEm && vaga.datas?.encerradaEm) {
    if (diferencaDias(vaga.datas.abertaEm, vaga.datas.encerradaEm) <= 0) {
      erros.push("datas.encerradaEm deve ser posterior a datas.abertaEm");
    }
  }

  if (!Object.values(STATUS_VAGA).includes(vaga.status)) erros.push(`status inválido: ${vaga.status}`);

  return { valido: erros.length === 0, erros, avisos };
}

export function mudarStatus(vaga, para, { agora, motivo } = {}) {
  const permitidas = transicoesPermitidas(vaga.status);
  if (!permitidas.includes(para)) {
    return {
      ok: false,
      motivo: `transição ${vaga.status} → ${para} não é permitida (permitidas: ${permitidas.join(", ") || "nenhuma"})`,
    };
  }

  const atualizada = { ...vaga, status: para, datas: { ...vaga.datas } };
  const quando = agora ?? new Date().toISOString();

  if (para === STATUS_VAGA.ABERTA) atualizada.datas.abertaEm = atualizada.datas.abertaEm ?? quando;
  if (para === STATUS_VAGA.ENCERRADA) atualizada.datas.encerradaEm = quando;
  if (para === STATUS_VAGA.CANCELADA) {
    atualizada.datas.encerradaEm = quando;
    atualizada.motivoCancelamento = motivo ?? null;
  }

  return { ok: true, vaga: atualizada, motivo: null };
}

export function abrirVaga(vaga, opcoes) {
  return mudarStatus(vaga, STATUS_VAGA.ABERTA, opcoes);
}

export function pausarVaga(vaga, opcoes) {
  return mudarStatus(vaga, STATUS_VAGA.PAUSADA, opcoes);
}

export function encerrarVaga(vaga, opcoes) {
  return mudarStatus(vaga, STATUS_VAGA.ENCERRADA, opcoes);
}

export function cancelarVaga(vaga, opcoes) {
  return mudarStatus(vaga, STATUS_VAGA.CANCELADA, opcoes);
}

export function etapasAtivas(vaga) {
  return (vaga?.etapas ?? [])
    .filter((e) => e.tipo !== TIPO_ETAPA.SAIDA)
    .sort((a, b) => a.ordem - b.ordem);
}

export function etapasDeSaida(vaga) {
  return (vaga?.etapas ?? [])
    .filter((e) => e.tipo === TIPO_ETAPA.SAIDA)
    .sort((a, b) => a.ordem - b.ordem);
}

export function etapaPorId(vaga, etapaId) {
  return (vaga?.etapas ?? []).find((e) => e.id === etapaId) ?? null;
}

export function etapaDeSaidaPorMotivo(vaga, motivo) {
  return etapasDeSaida(vaga).find((e) => e.motivo === motivo) ?? null;
}

export function proximaEtapa(vaga, etapaAtualId) {
  const ativas = etapasAtivas(vaga);
  const indice = ativas.findIndex((e) => e.id === etapaAtualId);
  if (indice === -1) return null;
  return ativas[indice + 1] ?? null;
}

export function criarModeloProcesso({ nome, etapas, tenantId = null }) {
  if (!nome?.trim()) throw new Error("modelo de processo precisa de nome");
  if (!(etapas ?? []).length) throw new Error("modelo de processo precisa de etapas");
  return { id: novoId("MOD"), tenantId, nome: nome.trim(), etapas: etapas.map((e) => ({ ...e })) };
}

export function aplicarModelo(vaga, modelo) {
  const atualizada = { ...vaga, etapas: modelo.etapas.map((e) => ({ ...e })) };
  const validacao = validarVaga(atualizada);
  if (!validacao.valido) {
    return { ok: false, vaga, erros: validacao.erros };
  }
  return { ok: true, vaga: atualizada, erros: [] };
}

export function urlPublica(vaga, { baseUrl, tenantSlug } = {}) {
  if (!baseUrl) return null;
  const origem = baseUrl.replace(/\/+$/, "");
  return tenantSlug
    ? `${origem}/${tenantSlug}/${vaga.slug}`
    : `${origem}/${vaga.slug}`;
}

/**
 * Palavras que em anúncio de vaga configuram discriminação (art. 373-A da CLT
 * e Lei 9.029/1995). São avisos, não erros: o revisor humano decide.
 */
const TERMOS_DISCRIMINATORIOS = [
  "sexo masculino",
  "sexo feminino",
  "apenas homens",
  "apenas mulheres",
  "boa aparência",
  "apresentável",
  "jovem",
  "até 30 anos",
  "até 35 anos",
  "até 40 anos",
  "sem filhos",
  "não portador",
  "portador de deficiência física",
  "estado civil",
  "solteiro",
  "casado",
  "gravidez",
  "raça",
  "cor da pele",
  "religião",
  "opção política",
];

export function auditarAnuncio(vaga) {
  const texto = normalizar(
    [vaga.titulo, vaga.resumo, vaga.descricao, ...(vaga.requisitos ?? [])].join(" \n ")
  ).toLowerCase();

  const encontrados = TERMOS_DISCRIMINATORIOS.map((termo) => normalizar(termo).toLowerCase()).filter((termo) =>
    texto.includes(termo)
  );

  return {
    limpo: encontrados.length === 0,
    termosEncontrados: encontrados,
    orientacao: encontrados.length
      ? "Termo potencialmente discriminatório. Art. 373-A da CLT proíbe anúncio com referência a sexo, idade, cor ou estado civil; Lei 9.029/1995 veda prática discriminatória para efeito admissional. Revisar antes de publicar."
      : null,
  };
}
