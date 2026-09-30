import * as ats from "../../../packages/ats/src/index.js";

export const TENANT_DEMO = "demo-industrial";

const DESCRICOES = {
  operador:
    "Atuação em linha de montagem SMT no Polo Industrial de Manaus: operação de pick and place, inspeção visual de placas, retrabalho de solda conforme IPC-A-610 e cumprimento rigoroso de ESD.\n\nAmbiente com IATF 16949, auditoria de camada e rotina de 5S. Reciclagem de NR paga pela empresa.",
  tecnico:
    "Manutenção preventiva e corretiva em linha SMT: impressora de pasta de solda, pick and place, forno de reflow, SPI e AOI. Análise de falha e suporte ao processo.\n\nNecessário NR-10 vigente (validade de 2 anos) e experiência com retrabalho conforme IPC-A-610.",
  qualidade:
    "Inspeção de processo e produto acabado em ambiente IATF 16949. Condução de MSA, análise de CEP, tratamento de não conformidade via 8D e auditoria de camada (LPA).",
  dev: "Time de plataforma do próprio Labutar: Node.js, PostgreSQL, arquitetura de serviços e observabilidade. Autonomia técnica e revisão por pares.",
};

function vaga(dados) {
  return ats.abrirVaga(ats.criarVaga({ tenantId: TENANT_DEMO, ...dados })).vaga;
}

export function vagasDemo() {
  return [
    vaga({
      titulo: "Operador de Produção I — Eletroeletrônica",
      resumo: "Linha SMT no Distrito Industrial. Turno fixo, transporte e refeição no local.",
      descricao: DESCRICOES.operador,
      responsabilidades: ["Operar equipamentos de linha SMT", "Inspeção visual e retrabalho de solda", "Registrar produção e refugo", "Cumprir ESD e 5S"],
      requisitos: ["TBO — Treinamento Básico Operacional concluído", "NR-6 e NR-12 vigentes", "Leitura de componentes eletrônicos", "Disponibilidade para turno fixo"],
      beneficios: ["Transporte fretado", "Refeição no local", "Plano de saúde", "PLR"],
      competencias: [
        { nome: "ESD", peso: 3, obrigatoria: true, nivelMinimo: 3 },
        { nome: "Leitura de componentes eletrônicos", peso: 3, obrigatoria: true, nivelMinimo: 3 },
        { nome: "5S", peso: 1, nivelMinimo: 2 },
        { nome: "Metrologia básica", peso: 2, nivelMinimo: 2 },
      ],
      area: "Produção", nivel: "Operacional", cbo: "7842050", tipoContrato: "CLT",
      jornada: { tipo: "INTEGRAL", horasSemanais: 44 },
      local: { modelo: "PRESENCIAL", cidade: "Manaus", uf: "AM", cep: "69075-000" },
      salario: { min: 220000, max: 280000, exibir: true },
      quantidadeVagas: 40, formacaoMinima: 2,
      knockout: [
        { id: "tbo", pergunta: "Você concluiu o TBO?", tipo: "SIM_NAO", eliminatoria: true },
        { id: "nr12", pergunta: "Sua NR-12 está vigente?", tipo: "SIM_NAO", eliminatoria: true },
        { id: "turno", pergunta: "Turno de preferência", tipo: "MULTIPLA", opcoesAceitas: ["manha", "tarde", "noite"] },
      ],
      regrasTriagem: { experienciaAnosMinimos: 1 },
    }),

    vaga({
      titulo: "Técnico em Eletroeletrônica — SMT",
      resumo: "Manutenção de linha SMT, SPI e AOI. NR-10 obrigatória e vigente.",
      descricao: DESCRICOES.tecnico,
      responsabilidades: ["Manutenção de equipamentos SMT", "Análise de falha e plano de ação", "Ajuste de perfil de reflow", "Treinar operadores em ESD"],
      requisitos: ["NR-10 vigente", "3 anos em SMT", "IPC-A-610", "Inglês técnico para leitura de manual"],
      beneficios: ["Plano de saúde", "Vale alimentação", "Auxílio creche", "PLR"],
      competencias: [
        { nome: "NR-10", peso: 3, obrigatoria: true, nivelMinimo: 4 },
        { nome: "SMT", peso: 3, obrigatoria: true, nivelMinimo: 3 },
        { nome: "IPC-A-610", peso: 2, nivelMinimo: 3 },
        { nome: "Automação industrial", peso: 2, nivelMinimo: 3 },
      ],
      area: "Engenharia", nivel: "Técnico", cbo: "3132050", tipoContrato: "CLT",
      local: { modelo: "PRESENCIAL", cidade: "Manaus", uf: "AM" },
      salario: { min: 450000, max: 650000, exibir: true },
      quantidadeVagas: 3, formacaoMinima: 3,
      idiomas: [{ codigo: "EN", nivel: "INTERMEDIARIO" }],
      knockout: [
        { id: "nr10", pergunta: "NR-10 concluída há menos de 2 anos?", tipo: "SIM_NAO", eliminatoria: true },
        { id: "anos", pergunta: "Anos de experiência em SMT", tipo: "NUMERICA", min: 3, eliminatoria: true },
      ],
      regrasTriagem: { experienciaAnosMinimos: 3 },
    }),

    vaga({
      titulo: "Inspetor de Qualidade — IATF 16949",
      resumo: "Auditoria de processo, MSA e CEP em fornecedor automotivo de duas rodas.",
      descricao: DESCRICOES.qualidade,
      responsabilidades: ["Auditoria de processo", "MSA e estudo de R&R", "Análise de CEP", "8D e plano de ação"],
      requisitos: ["IATF 16949", "Core Tools (APQP, PPAP, FMEA, MSA)", "CEP/SPC"],
      beneficios: ["Plano de saúde", "Transporte", "Refeição"],
      competencias: [
        { nome: "IATF 16949", peso: 3, obrigatoria: true, nivelMinimo: 3 },
        { nome: "MSA", peso: 2, obrigatoria: true, nivelMinimo: 3 },
        { nome: "CEP", peso: 2, nivelMinimo: 3 },
        { nome: "8D", peso: 1, nivelMinimo: 2 },
      ],
      area: "Qualidade", nivel: "Técnico", cbo: "2631050", tipoContrato: "CLT",
      local: { modelo: "PRESENCIAL", cidade: "Manaus", uf: "AM" },
      salario: { min: 350000, max: 480000, exibir: true },
      quantidadeVagas: 2, formacaoMinima: 3,
      knockout: [{ id: "iatf", pergunta: "Já trabalhou com IATF 16949?", tipo: "SIM_NAO", eliminatoria: true }],
    }),

    vaga({
      titulo: "Pessoa Desenvolvedora Sênior — Plataforma",
      resumo: "100% remoto. Node.js, PostgreSQL e arquitetura de serviços.",
      descricao: DESCRICOES.dev,
      responsabilidades: ["Desenhar serviços", "Revisar código", "Sustentar observabilidade"],
      requisitos: ["5 anos com Node.js", "PostgreSQL", "Inglês avançado"],
      beneficios: ["Home office", "Auxílio setup", "Plano de saúde"],
      competencias: [
        { nome: "Node.js", peso: 3, obrigatoria: true, nivelMinimo: 4 },
        { nome: "PostgreSQL", peso: 2, obrigatoria: true, nivelMinimo: 3 },
        { nome: "AWS", peso: 2, nivelMinimo: 3 },
      ],
      area: "Tecnologia", nivel: "Sênior", tipoContrato: "CLT",
      local: { modelo: "REMOTO" },
      salario: { min: 1200000, max: 1800000, exibir: true },
      quantidadeVagas: 1, formacaoMinima: 4,
      idiomas: [{ codigo: "EN", nivel: "AVANCADO" }],
      knockout: [{ id: "disp", pergunta: "Disponibilidade para início em 30 dias?", tipo: "SIM_NAO", eliminatoria: true }],
      regrasTriagem: { experienciaAnosMinimos: 5 },
    }),
  ];
}

function candidato(dados) {
  return ats.criarCandidato({ tenantId: TENANT_DEMO, ...dados }, { agora: new Date().toISOString() });
}

export function candidatosDemo() {
  return [
    candidato({
      dados: { nome: "João Batista Silva", cpf: "11144477735", nascimento: "1996-04-12" },
      contato: { email: "joao.batista@exemplo.com", telefone: "(92) 98811-2233", cidade: "Manaus", uf: "AM" },
      competencias: [{ nome: "ESD", nivel: 4 }, { nome: "Leitura de componentes eletrônicos", nivel: 4 }, { nome: "5S", nivel: 3 }, { nome: "Metrologia básica", nivel: 3 }],
      experiencias: [
        { empresa: "Eldorado Componentes", cargo: "Operador de SMT", inicio: "2022-03-01", atual: true, competencias: ["ESD", "SMT"] },
        { empresa: "Salcomp", cargo: "Auxiliar de produção", inicio: "2020-01-15", fim: "2022-02-28", competencias: ["5S"] },
      ],
      formacao: [{ instituicao: "CETAM", curso: "TBO — Treinamento Básico Operacional", nivel: "MEDIO", concluido: true }],
      pretensaoSalarial: 250000, curriculoTexto: "Operador de linha SMT com 4 anos em eletroeletrônica. TBO pelo CETAM.",
      consentimento: { aceito: true, em: new Date().toISOString().slice(0, 10), versaoTermo: "1.0" },
    }),
    candidato({
      dados: { nome: "Maria Fernanda Costa" },
      contato: { email: "maria.costa@exemplo.com", telefone: "(92) 99122-4455", cidade: "Manaus", uf: "AM" },
      competencias: [{ nome: "NR-10", nivel: 5 }, { nome: "SMT", nivel: 4 }, { nome: "IPC-A-610", nivel: 4 }, { nome: "Automação industrial", nivel: 3 }],
      experiencias: [
        { empresa: "Flextronics", cargo: "Técnica de processo SMT", inicio: "2021-06-01", atual: true, competencias: ["SMT"] },
        { empresa: "Digitron", cargo: "Técnica de manutenção", inicio: "2018-02-01", fim: "2021-05-31", competencias: ["Automação industrial"] },
      ],
      formacao: [{ instituicao: "SENAI-AM", curso: "Técnico em Eletroeletrônica", nivel: "TECNICO", concluido: true }],
      idiomas: [{ codigo: "EN", nivel: "INTERMEDIARIO" }],
      pretensaoSalarial: 580000, curriculoTexto: "Técnica em eletroeletrônica com 8 anos em SMT.",
      consentimento: { aceito: true, em: new Date().toISOString().slice(0, 10), versaoTermo: "1.0" },
    }),
    candidato({
      dados: { nome: "Carlos Eduardo Ramos" },
      contato: { email: "carlos.ramos@exemplo.com", telefone: "(92) 98455-7788", cidade: "Manaus", uf: "AM" },
      competencias: [{ nome: "IATF 16949", nivel: 4 }, { nome: "MSA", nivel: 3 }, { nome: "CEP", nivel: 4 }, { nome: "8D", nivel: 3 }],
      experiencias: [{ empresa: "Caloi Norte", cargo: "Inspetor de qualidade", inicio: "2021-01-10", atual: true, competencias: ["IATF 16949"] }],
      formacao: [{ instituicao: "UniNorte", curso: "Tecnologia em Qualidade", nivel: "TECNICO", concluido: true }],
      pretensaoSalarial: 420000, curriculoTexto: "Inspetor de qualidade em fornecedor automotivo.",
      consentimento: { aceito: true, em: new Date().toISOString().slice(0, 10), versaoTermo: "1.0" },
    }),
    candidato({
      dados: { nome: "Ana Souza Lima" },
      contato: { email: "ana.lima@exemplo.com", telefone: "(11) 98765-4321", cidade: "São Paulo", uf: "SP" },
      competencias: [{ nome: "Node.js", nivel: 5 }, { nome: "PostgreSQL", nivel: 4 }, { nome: "AWS", nivel: 3 }],
      experiencias: [{ empresa: "Fintech", cargo: "Desenvolvedora sênior", inicio: "2019-03-01", atual: true, competencias: ["Node.js"] }],
      formacao: [{ instituicao: "USP", curso: "Ciência da Computação", nivel: "SUPERIOR", concluido: true }],
      idiomas: [{ codigo: "EN", nivel: "FLUENTE" }],
      pretensaoSalarial: 1500000, curriculoTexto: "Sete anos com Node.js em plataforma de pagamentos.",
      consentimento: { aceito: true, em: new Date().toISOString().slice(0, 10), versaoTermo: "1.0" },
    }),
    candidato({
      dados: { nome: "Pedro Henrique Alves" },
      contato: { email: "pedro.alves@exemplo.com", telefone: "(92) 98100-9090", cidade: "Manaus", uf: "AM" },
      competencias: [{ nome: "Atendimento ao cliente", nivel: 4 }, { nome: "Excel", nivel: 3 }],
      experiencias: [{ empresa: "Comércio local", cargo: "Vendedor", inicio: "2023-01-01", atual: true }],
      formacao: [{ instituicao: "Escola estadual", curso: "Ensino médio", nivel: "MEDIO", concluido: true }],
      pretensaoSalarial: 350000, curriculoTexto: "Vendedor buscando primeira oportunidade na indústria.",
      consentimento: { aceito: true, em: new Date().toISOString().slice(0, 10), versaoTermo: "1.0" },
    }),
  ];
}

export const RESPOSTAS_DEMO = {
  "Operador de Produção I — Eletroeletrônica": {
    "João Batista Silva": [{ perguntaId: "tbo", valor: "SIM" }, { perguntaId: "nr12", valor: "SIM" }, { perguntaId: "turno", valor: "manha" }],
    "Pedro Henrique Alves": [{ perguntaId: "tbo", valor: "NAO" }, { perguntaId: "nr12", valor: "NAO" }],
  },
  "Técnico em Eletroeletrônica — SMT": {
    "Maria Fernanda Costa": [{ perguntaId: "nr10", valor: "SIM" }, { perguntaId: "anos", valor: 8 }],
  },
  "Inspetor de Qualidade — IATF 16949": {
    "Carlos Eduardo Ramos": [{ perguntaId: "iatf", valor: "SIM" }],
  },
  "Pessoa Desenvolvedora Sênior — Plataforma": {
    "Ana Souza Lima": [{ perguntaId: "disp", valor: "SIM" }],
  },
};

/** Popula um repositório com o tenant de demonstração. Idempotente por tenant. */
export async function semear(repo, { tenantId = TENANT_DEMO } = {}) {
  const jaExiste = await repo.contar(tenantId, "vagas");
  if (jaExiste > 0) return { tenantId, semeado: false, motivo: "tenant já tem dados" };

  const vagas = vagasDemo().map((v) => ({ ...v, tenantId }));
  const candidatos = candidatosDemo().map((c) => ({ ...c, tenantId }));

  for (const v of vagas) await repo.inserir(tenantId, "vagas", v);
  for (const c of candidatos) await repo.inserir(tenantId, "candidatos", c);

  let candidaturas = 0;
  for (const v of vagas) {
    for (const c of candidatos) {
      const respostas = (RESPOSTAS_DEMO[v.titulo] ?? {})[c.dados.nome];
      if (!respostas) continue;
      await repo.inserir(tenantId, "candidaturas", ats.criarCandidatura({
        vaga: v, candidato: c, respostas, origem: { canal: "PORTAL_LABUTAR" },
      }));
      candidaturas += 1;
    }
  }

  return { tenantId, semeado: true, vagas: vagas.length, candidatos: candidatos.length, candidaturas };
}

/**
 * Usuários de demonstração, um por perfil — SÓ para o servidor de
 * desenvolvimento (src/dev.js). Todos com a mesma senha, conhecida.
 */
export const SENHA_DEMO = "Acesso Demo 2026!";
export const USUARIOS_DEMO = Object.freeze([
  { nome: "Helena Diretora", email: "admin@demo.com.br", perfilId: "ADMINISTRADOR_GERAL" },
  { nome: "Marcos Gerente de RH", email: "rh@demo.com.br", perfilId: "GERENTE_RH" },
  { nome: "Rita Recrutadora", email: "recrutadora@demo.com.br", perfilId: "RECRUTADOR" },
  { nome: "Paulo Analista DP", email: "dp@demo.com.br", perfilId: "ANALISTA_DP" },
  { nome: "Sandra Supervisora", email: "supervisor@demo.com.br", perfilId: "SUPERVISOR_OPERACOES" },
  { nome: "Caio Comercial", email: "comercial@demo.com.br", perfilId: "COMERCIAL" },
  { nome: "Fernanda Financeiro", email: "financeiro@demo.com.br", perfilId: "FINANCEIRO" },
]);

export async function semearUsuarios(acesso, { tenantId = TENANT_DEMO } = {}) {
  const [admin, ...demais] = USUARIOS_DEMO;
  try {
    await acesso.criarPrimeiroAdministrador(tenantId, { ...admin, senha: SENHA_DEMO, trocarSenha: false });
  } catch {
    return { semeado: false, motivo: "empresa já tem usuários" };
  }
  const atorAcesso = { acessoTotal: true, niveis: {} };
  for (const u of demais) {
    await acesso.criarUsuario(tenantId, { ...u, senha: SENHA_DEMO, trocarSenha: false }, { atorAcesso, atorId: "SEED" });
  }
  return { semeado: true, usuarios: USUARIOS_DEMO.length };
}
