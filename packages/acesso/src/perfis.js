import { IDS_MODULOS, NIVEL } from "./catalogo.js";

const { SEM_ACESSO, CONSULTA, OPERADOR, GESTOR, ADMINISTRADOR } = NIVEL;

/** Monta o mapa módulo → nível, com SEM_ACESSO para o que não for citado. */
function niveis(parciais = {}, padrao = SEM_ACESSO) {
  return Object.freeze(Object.fromEntries(IDS_MODULOS.map((id) => [id, parciais[id] ?? padrao])));
}

export const ID_ADMINISTRADOR_GERAL = "ADMINISTRADOR_GERAL";

/**
 * Perfis que vêm com todo tenant. São de sistema: não podem ser alterados
 * nem excluídos, só copiados para criar um perfil personalizado.
 */
export const PERFIS_PADRAO = Object.freeze([
  {
    id: ID_ADMINISTRADOR_GERAL,
    nome: "Administrador geral",
    descricao: "Acesso total e irrestrito a todos os módulos, a todas as ações e à administração de usuários e perfis.",
    acessoTotal: true,
    sistema: true,
    niveis: niveis({}, ADMINISTRADOR),
  },
  {
    id: "DIRETORIA",
    nome: "Diretoria",
    descricao: "Vê e aprova em todos os módulos; consulta a administração do sistema.",
    sistema: true,
    niveis: niveis({ administracao: CONSULTA }, GESTOR),
  },
  {
    id: "GERENTE_RH",
    nome: "Gerente de RH e DP",
    descricao: "Responde pelo ciclo do trabalhador, do recrutamento à folha.",
    sistema: true,
    niveis: niveis({
      recrutamento: ADMINISTRADOR, colaboradores: GESTOR, admissao: GESTOR, ponto: GESTOR,
      folha: GESTOR, sst: GESTOR, treinamentos: GESTOR, tomadores: CONSULTA,
    }),
  },
  {
    id: "RECRUTADOR",
    nome: "Recrutador(a)",
    descricao: "Conduz vagas e processos seletivos e inicia admissões.",
    sistema: true,
    niveis: niveis({ recrutamento: OPERADOR, admissao: OPERADOR, colaboradores: CONSULTA, tomadores: CONSULTA }),
  },
  {
    id: "ANALISTA_DP",
    nome: "Analista de departamento pessoal",
    descricao: "Admissão, ponto, folha e documentação dos colaboradores.",
    sistema: true,
    niveis: niveis({
      colaboradores: OPERADOR, admissao: OPERADOR, ponto: OPERADOR, folha: OPERADOR,
      sst: OPERADOR, treinamentos: OPERADOR, recrutamento: CONSULTA, tomadores: CONSULTA,
    }),
  },
  {
    id: "SUPERVISOR_OPERACOES",
    nome: "Supervisor(a) de operações",
    descricao: "Acompanha postos e escalas, aprova ponto e cobre faltas.",
    sistema: true,
    niveis: niveis({ tomadores: OPERADOR, ponto: GESTOR, colaboradores: CONSULTA, treinamentos: CONSULTA, sst: CONSULTA }),
  },
  {
    id: "COMERCIAL",
    nome: "Comercial",
    descricao: "Prospecção, BIDs, planilhas de custo e propostas.",
    sistema: true,
    niveis: niveis({ comercial: GESTOR, tomadores: CONSULTA }),
  },
  {
    id: "FINANCEIRO",
    nome: "Financeiro",
    descricao: "Faturamento, cobrança e contas; consulta a folha para conferência.",
    sistema: true,
    niveis: niveis({ financeiro: GESTOR, contabil: OPERADOR, tomadores: CONSULTA, folha: CONSULTA }),
  },
  {
    id: "CONTADOR",
    nome: "Contador(a)",
    descricao: "Acesso contábil e de conferência, geralmente de escritório externo.",
    sistema: true,
    niveis: niveis({ contabil: GESTOR, financeiro: CONSULTA, folha: CONSULTA }),
  },
  {
    id: "CONSULTA",
    nome: "Somente consulta",
    descricao: "Vê todos os módulos de negócio, sem alterar nada. Útil para auditoria.",
    sistema: true,
    niveis: niveis({ administracao: SEM_ACESSO }, CONSULTA),
  },
]);

export const perfilPadrao = (id) => PERFIS_PADRAO.find((p) => p.id === id) ?? null;
