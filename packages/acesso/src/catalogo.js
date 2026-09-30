/**
 * Catálogo de módulos, níveis e ações do controle de acesso.
 *
 * O modelo é deliberadamente simples de explicar a um gestor de RH:
 * cada perfil tem UM nível em cada módulo, e o nível define o que a pessoa
 * pode fazer ali. Não há centenas de permissões soltas para configurar.
 */

export const MODULOS = Object.freeze([
  { id: "recrutamento", nome: "Recrutamento e seleção", grupo: "Pessoas", descricao: "Vagas, processo seletivo, avaliações e banco de talentos" },
  { id: "colaboradores", nome: "Colaboradores", grupo: "Pessoas", descricao: "Temporários, terceirizados e próprios, vínculos e alocações" },
  { id: "admissao", nome: "Admissão digital", grupo: "Pessoas", descricao: "Documentos, exame admissional, contrato e eSocial" },
  { id: "tomadores", nome: "Tomadores e postos", grupo: "Operação", descricao: "Clientes, contratos, postos de trabalho e escalas" },
  { id: "ponto", nome: "Ponto eletrônico", grupo: "Operação", descricao: "Marcações, espelho de ponto, banco de horas" },
  { id: "folha", nome: "Folha de pagamento", grupo: "Operação", descricao: "Cálculo, holerites, férias, 13º, rescisões e eSocial" },
  { id: "sst", nome: "Saúde e segurança", grupo: "Operação", descricao: "ASO, PGR, PCMSO, EPI e CAT" },
  { id: "treinamentos", nome: "Treinamentos", grupo: "Operação", descricao: "Cursos, NRs e certificados" },
  { id: "comercial", nome: "Comercial", grupo: "Gestão", descricao: "Clientes, prospects, concorrentes, BIDs e propostas" },
  { id: "financeiro", nome: "Financeiro", grupo: "Gestão", descricao: "Faturamento, notas, cobrança, contas a pagar e receber" },
  { id: "contabil", nome: "Contábil", grupo: "Gestão", descricao: "Plano de contas, lançamentos e relatórios" },
  { id: "juridico", nome: "Jurídico", grupo: "Gestão", descricao: "Contratos, processos e prazos" },
  { id: "estoque", nome: "Estoque e compras", grupo: "Gestão", descricao: "EPI, uniformes, requisições e pedidos" },
  { id: "administracao", nome: "Administração do sistema", grupo: "Sistema", descricao: "Usuários, perfis de acesso, auditoria e dados da empresa" },
]);

export const IDS_MODULOS = Object.freeze(MODULOS.map((m) => m.id));

/** Níveis de acesso, do menor ao maior. Cada um inclui tudo do anterior. */
export const NIVEL = Object.freeze({
  SEM_ACESSO: 0,
  CONSULTA: 1,
  OPERADOR: 2,
  GESTOR: 3,
  ADMINISTRADOR: 4,
});

export const NIVEIS = Object.freeze([
  { valor: NIVEL.SEM_ACESSO, id: "SEM_ACESSO", nome: "Sem acesso", descricao: "Não vê o módulo" },
  { valor: NIVEL.CONSULTA, id: "CONSULTA", nome: "Consulta", descricao: "Visualiza informações, sem alterar nada" },
  { valor: NIVEL.OPERADOR, id: "OPERADOR", nome: "Operador", descricao: "Cadastra e altera no dia a dia" },
  { valor: NIVEL.GESTOR, id: "GESTOR", nome: "Gestor", descricao: "Aprova, exclui e exporta" },
  { valor: NIVEL.ADMINISTRADOR, id: "ADMINISTRADOR", nome: "Administrador do módulo", descricao: "Configura o módulo (modelos, regras, parâmetros)" },
]);

/**
 * Ações e o nível mínimo para cada uma. A lista é a mesma em todo módulo,
 * para que "Gestor" signifique a mesma coisa no recrutamento e na folha.
 */
export const ACOES = Object.freeze({
  ver: NIVEL.CONSULTA,
  criar: NIVEL.OPERADOR,
  editar: NIVEL.OPERADOR,
  aprovar: NIVEL.GESTOR,
  excluir: NIVEL.GESTOR,
  exportar: NIVEL.GESTOR,
  dadosSensiveis: NIVEL.GESTOR,
  configurar: NIVEL.ADMINISTRADOR,
});

export const NOME_ACAO = Object.freeze({
  ver: "Visualizar",
  criar: "Cadastrar",
  editar: "Alterar",
  aprovar: "Aprovar",
  excluir: "Excluir",
  exportar: "Exportar",
  dadosSensiveis: "Ver dados de saúde (ASO, laudos, CID)",
  configurar: "Configurar o módulo",
});

export const nomeDoNivel = (valor) => NIVEIS.find((n) => n.valor === valor)?.nome ?? "Sem acesso";
export const acoesDoNivel = (valor) => Object.entries(ACOES).filter(([, minimo]) => valor >= minimo).map(([acao]) => acao);
