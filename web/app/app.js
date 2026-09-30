/**
 * Painel da empresa no Labutar.
 *
 * Fluxo: login → escolha do módulo → páginas do módulo. Rotas:
 *   #/                         escolha de módulo
 *   #/<modulo>/<pagina>/<param>
 * A tela só mostra o que o perfil permite; quem decide é sempre o servidor.
 * Todo texto vindo da API passa por `esc()` antes de entrar no HTML.
 */
import { icone } from "./icones.js";
import { api, sessao } from "./sessao.js";
import { paginaColaboradores, paginaImportacao, paginaTomadores, ligarEventosCadastro, limparCadastro } from "./cadastro-telas.js";
import { paginaFolhaResumo, paginaHolerites, paginaFolhaTomadores, paginaVerbas, ligarEventosFolha, limparFolha } from "./folha-telas.js";
import { esc, moeda, dataHora, avatar, etiqueta, diasDesde, quando, aviso, abrirPainel, fecharPainel, matiz } from "./ui.js";
import {
  ICONE_MODULO,
  esconderTelaCheia,
  ligarEventosAcesso,
  paginaAuditoria,
  paginaContasExternas,
  paginaPerfis,
  paginaUsuarios,
  telaLogin,
  telaModulos,
  telaTrocarSenhaObrigatoria,
} from "./acesso-telas.js";

// ---------------------------------------------------------------- módulos e páginas

/** Páginas dos módulos já construídos. Os demais abrem a página "em desenvolvimento". */
const PAGINAS = {
  recrutamento: [
    { id: "inicio", nome: "Início", icone: "inicio" },
    { id: "vagas", nome: "Vagas", icone: "vagas", contador: () => estado.vagas.filter((v) => v.status === "ABERTA").length },
    { id: "pipeline", nome: "Processo seletivo", icone: "pipeline" },
    { id: "candidatos", nome: "Banco de talentos", icone: "candidatos", contador: () => estado.candidatos.length },
  ],
  colaboradores: [
    { id: "lista", nome: "Colaboradores", icone: "cracha" },
    { id: "importar", nome: "Importar planilha", icone: "seta" },
  ],
  tomadores: [
    { id: "lista", nome: "Tomadores e postos", icone: "tomadores" },
  ],
  folha: [
    { id: "resumo", nome: "Resumo da competência", icone: "folha" },
    { id: "holerites", nome: "Holerites", icone: "pessoas" },
    { id: "tomadores", nome: "Custo por tomador", icone: "tomadores" },
    { id: "verbas", nome: "Catálogo de verbas", icone: "dinheiro" },
  ],
  administracao: [
    { id: "usuarios", nome: "Usuários", icone: "pessoas" },
    { id: "perfis", nome: "Perfis de acesso", icone: "cadeado" },
    { id: "externos", nome: "Acessos externos", icone: "tomadores" },
    { id: "auditoria", nome: "Auditoria", icone: "relogio" },
  ],
};

const EM_BREVE = {
  colaboradores: {
    resumo: "Temporários, terceirizados e próprios no mesmo cadastro, cada um com suas regras: onde está alocado hoje, prazo do contrato temporário, quarentenas legais e para qual tomador vai o custo de cada dia.",
    recursos: ["Temporário, terceirizado e próprio", "Alocação por tomador, posto ou setor", "Prazo de 180 + 90 dias com alerta", "Quarentenas legais bloqueadas", "Coberturas de folguistas e feristas", "Plano de desmobilização por contrato"],
  },
  admissao: {
    resumo: "Do candidato aprovado ao colaborador registrado, sem papel: documentos pelo celular, exame admissional, contrato assinado eletronicamente e envio ao eSocial.",
    recursos: ["Documentos pelo celular com OCR", "Agendamento e validade do ASO", "Contrato eletrônico (CLT e temporário)", "Prazos da Lei 6.019/1974", "Envio do S-2200 ao eSocial", "Bloqueio de início sem pendências"],
  },
  tomadores: {
    resumo: "Tomadores, contratos, postos de trabalho e quem está alocado em cada um, com reposição rápida de faltas.",
    recursos: ["Contratos e postos por tomador", "Alocação e escala", "Reposição de faltas", "Portal do tomador", "Medição aprovada pelo tomador", "Compliance da terceirização"],
  },
  ponto: {
    resumo: "Importação das marcações dos relógios instalados nos tomadores, tratamento, espelho aprovado pelo tomador e banco de horas.",
    recursos: ["Relógio no tomador (REP-C)", "Importação do AFD", "Escalas e turnos", "Banco de horas", "Espelho aprovado pelo tomador", "Geração do AEJ"],
  },
  folha: {
    resumo: "Cálculo mensal a partir do ponto, com convenções coletivas, férias, 13º, rescisão e eventos do eSocial.",
    recursos: ["Cálculo por convenção coletiva", "Férias, 13º e rescisão", "Holerite no app", "Pagamento em lote e PIX", "eSocial, FGTS Digital e DCTFWeb", "Tabelas legais por vigência"],
  },
  clinica: {
    resumo: "A clínica de medicina e segurança do trabalho do grupo, com CNPJ próprio: agenda e resultado dos exames, ASO assinado pelo médico, PCMSO, PGR e laudos. O que ela produz alimenta a admissão, o SST e o eSocial da empresa de RH.",
    recursos: ["Agenda de exames (NR-7)", "ASO com liberação da admissão", "PCMSO e PGR por posto do tomador", "LTCAT, PPP e laudos", "Prontuário só para o médico", "Faturamento entre as empresas do grupo"],
  },
  sst: {
    resumo: "PGR, PCMSO, ASO periódico, entrega de EPI e comunicação de acidentes.",
    recursos: ["ASO e exames periódicos", "Entrega de EPI com assinatura", "CAT", "S-2220 e S-2240", "Alertas de vencimento", "Treinamentos NR"],
  },
  comercial: {
    resumo: "Tomadores, possíveis tomadores, concorrentes e processos BID, com planilha de custos e formação de preço por posto.",
    recursos: ["Mapa de tomadores e possíveis tomadores", "Cadastro de concorrentes", "BIDs em andamento e encerrados", "Planilha de custos (Excel e PDF)", "Propostas e contratos", "Relatórios de funil e carteira"],
  },
  financeiro: {
    resumo: "Faturamento por medição, notas fiscais, cobrança e contas a pagar e receber.",
    recursos: ["Fatura por medição", "NFS-e e retenções", "Boleto e PIX", "Contas a pagar e receber", "Conciliação bancária", "Centros de custo"],
  },
  contabil: {
    resumo: "Lançamentos automáticos da folha e do faturamento, DRE e exportação para o contador.",
    recursos: ["Plano de contas", "Lançamentos automáticos", "DRE gerencial", "Exportação ao contador"],
  },
  treinamentos: {
    resumo: "Cursos, trilhas e certificados com validade, que bloqueiam alocação quando vencem.",
    recursos: ["Cursos e trilhas", "Certificados", "Validade de NRs", "Bloqueio de alocação"],
  },
  juridico: {
    resumo: "Contratos, processos trabalhistas, prazos e provisões.",
    recursos: ["Modelos de contrato", "Processos e audiências", "Prazos com alerta", "Provisões"],
  },
  estoque: {
    resumo: "Almoxarifado de EPI e uniformes, requisições, cotações e pedidos de compra.",
    recursos: ["EPI e uniformes", "Validade do CA", "Requisição e cotação", "Pedidos e fornecedores"],
  },
};

// ---------------------------------------------------------------- estado

const estado = {
  vagas: [],
  candidatos: [],
  candidaturas: [],
  resumo: null,
  origens: [],
  filtroVagas: "TODAS",
  vagaPipeline: null,
  busca: "",
};

const candidatoPorId = (id) => estado.candidatos.find((c) => c.id === id);
const vagaPorId = (id) => estado.vagas.find((v) => v.id === id);

async function carregar() {
  const [vagas, candidatos, resumo, origens] = await Promise.all([
    api("/vagas?limite=200"),
    api("/candidatos?limite=200"),
    api("/metricas/resumo").catch(() => null),
    api("/metricas/origens").catch(() => []),
  ]);
  estado.vagas = vagas.itens ?? [];
  estado.candidatos = candidatos.itens ?? [];
  estado.resumo = resumo;
  estado.origens = origens ?? [];

  const listas = await Promise.all(
    estado.vagas.map((v) => api(`/vagas/${v.id}/candidaturas?limite=500`).then((d) => d.itens ?? []).catch(() => []))
  );
  estado.candidaturas = listas.flat();
}

// ---------------------------------------------------------------- utilidades


function faixaSalarial(vaga) {
  const s = vaga.salario;
  if (!s?.min && !s?.max) return "A combinar";
  if (s.min && s.max && s.min !== s.max) return `${moeda(s.min)} – ${moeda(s.max)}`;
  return moeda(s.max || s.min);
}

function local(vaga) {
  if (vaga.local?.modelo === "REMOTO") return "Remoto";
  const partes = [vaga.local?.cidade, vaga.local?.uf].filter(Boolean);
  const base = partes.join(", ") || "Local a definir";
  return vaga.local?.modelo === "HIBRIDO" ? `${base} · Híbrido` : base;
}

const STATUS_VAGA = {
  ABERTA: ["Aberta", "e-verde"],
  RASCUNHO: ["Rascunho", "e-cinza"],
  PAUSADA: ["Pausada", "e-ambar"],
  ENCERRADA: ["Encerrada", "e-azul"],
  CANCELADA: ["Cancelada", "e-vermelho"],
};
const STATUS_CANDIDATURA = {
  EM_ANDAMENTO: ["Em andamento", "e-azul"],
  APROVADO: ["Aprovado", "e-verde"],
  REPROVADO: ["Reprovado", "e-vermelho"],
  DESISTENTE: ["Desistiu", "e-cinza"],
  BANCO: ["Banco de talentos", "e-marca"],
};
const DECISAO = {
  APROVADO_AUTOMATICO: "Aprovado na triagem automática",
  ANALISE_MANUAL: "Encaminhado para análise manual",
  REPROVADO_AUTOMATICO: "Abaixo da nota de corte",
  REPROVADO_KNOCKOUT: "Não atendeu pergunta eliminatória",
};

const CONTRATO = { CLT: "CLT", TEMPORARIO: "Temporário", PJ: "PJ", ESTAGIO: "Estágio", APRENDIZ: "Aprendiz" };

const AREAS = {
  Tecnologia: { icone: "raio", h: 250 },
  Engenharia: { icone: "config", h: 205 },
  Qualidade: { icone: "sst", h: 165 },
  Produção: { icone: "estoque", h: 18 },
  Logística: { icone: "compras", h: 35 },
  Administrativo: { icone: "folha", h: 280 },
};
const visualArea = (area) => AREAS[area] ?? { icone: "vagas", h: matiz(area || "vaga") };

function corScore(v) {
  if (v >= 80) return "var(--verde)";
  if (v >= 60) return "var(--azul)";
  return "var(--ambar)";
}
const anel = (v, classe = "") => {
  const valor = Math.max(0, Math.min(100, Math.round(v ?? 0)));
  return `<span class="anel ${classe}" style="--v:${valor};--cor:${corScore(valor)}"><svg viewBox="0 0 36 36"><circle class="trilho" cx="18" cy="18" r="15.9155"/><circle class="valor" cx="18" cy="18" r="15.9155" pathLength="100"/></svg><b>${valor}</b></span>`;
};

function cargoAtual(candidato) {
  const atual = candidato.experiencias?.find((e) => e.atual) ?? candidato.experiencias?.[0];
  return atual ? `${atual.cargo} · ${atual.empresa}` : candidato.formacao?.[0]?.curso ?? "Sem experiência registrada";
}

const casaBusca = (...textos) => {
  const termo = estado.busca.trim().toLowerCase();
  return !termo || textos.some((t) => String(t ?? "").toLowerCase().includes(termo));
};

// ---------------------------------------------------------------- navegação

function rotaAtual() {
  const [modulo, pagina, param] = location.hash.replace(/^#\/?/, "").split("/").map((p) => (p ? decodeURIComponent(p) : null));
  return { modulo, pagina, param };
}

const paginasDe = (moduloId) => PAGINAS[moduloId] ?? [{ id: "visao", nome: "Visão geral", icone: ICONE_MODULO[moduloId] }];

function desenharMenu(modulo, paginaId) {
  document.getElementById("menu").innerHTML = `
    <a class="modulo-atual" href="#/" title="Trocar de módulo">
      <span class="modulo-atual-icone">${icone(ICONE_MODULO[modulo.id])}</span>
      <span class="modulo-atual-texto"><small>Módulo</small><strong>${esc(modulo.nome)}</strong></span>
      <span class="modulo-atual-trocar">Trocar</span>
    </a>
    <div class="menu-grupo">Páginas</div>
    ${paginasDe(modulo.id).map((p) => {
      const n = p.contador?.();
      return `<a class="menu-item ${p.id === paginaId ? "ativo" : ""}" href="#/${modulo.id}/${p.id}">
        ${icone(p.icone)}<span>${esc(p.nome)}</span>${n ? `<span class="contador">${n}</span>` : ""}
      </a>`;
    }).join("")}
    <div class="menu-nivel">${icone("cadeado")}<span>Seu nível aqui: <b>${esc(modulo.nomeNivel)}</b></span></div>`;
}

function desenharMoldura(modulo, pagina) {
  document.getElementById("titulo-pagina").textContent = pagina?.nome ?? modulo.nome;
  document.getElementById("migalha").textContent = modulo.nome;
  document.getElementById("sidebar").classList.remove("aberta");
  const noRecrutamento = modulo.id === "recrutamento";
  document.getElementById("botao-nova-vaga").hidden = !(noRecrutamento && sessao.pode("recrutamento", "criar"));
  document.querySelector(".busca").hidden = !noRecrutamento;
  const u = sessao.usuario;
  document.getElementById("topo-usuario").innerHTML =
    `${avatar(u?.nome, "avatar-sm")}<span class="usuario-texto"><strong>${esc(u?.nome)}</strong><small>${esc(sessao.perfil?.nome ?? "")}</small></span>`;
  document.getElementById("empresa-nome").textContent = sessao.empresa ?? "";
  document.getElementById("empresa-sigla").textContent = String(sessao.empresa ?? "?").slice(0, 2).toUpperCase();
}

const carregando = '<div class="carregando"><span class="spinner"></span>Carregando…</div>';
let recrutamentoCarregado = false;

function limparDados() {
  recrutamentoCarregado = false;
  limparFolha();
  limparCadastro();
  Object.assign(estado, { vagas: [], candidatos: [], candidaturas: [], resumo: null, origens: [], busca: "" });
}

function irPara(hash) {
  if (location.hash === hash) renderizar();
  else location.hash = hash;
}

async function renderizar() {
  fecharPainel();
  if (!sessao.ativa) {
    return telaLogin({ aoEntrar: () => { limparDados(); irPara("#/"); } });
  }
  if (sessao.usuario?.trocarSenha) {
    return telaTrocarSenhaObrigatoria({ aoConcluir: () => irPara("#/") });
  }

  const { modulo: moduloId, pagina: paginaId, param } = rotaAtual();
  if (!moduloId) return telaModulos();

  const modulo = sessao.modulo(moduloId);
  if (!modulo?.liberado) {
    aviso("Seu perfil não tem acesso a esse módulo.", "erro");
    return irPara("#/");
  }

  esconderTelaCheia();
  const pagina = paginasDe(moduloId).find((p) => p.id === paginaId) ?? paginasDe(moduloId)[0];
  desenharMenu(modulo, pagina.id);
  desenharMoldura(modulo, pagina);
  const conteudo = document.getElementById("conteudo");

  try {
    if (moduloId === "recrutamento") {
      if (!recrutamentoCarregado) {
        conteudo.innerHTML = carregando;
        await carregar();
        recrutamentoCarregado = true;
        desenharMenu(modulo, pagina.id);
      }
      if (pagina.id === "vagas") conteudo.innerHTML = telaVagas();
      else if (pagina.id === "pipeline") conteudo.innerHTML = telaPipeline(param);
      else if (pagina.id === "candidatos") conteudo.innerHTML = telaCandidatos();
      else conteudo.innerHTML = telaInicio();
    } else if (moduloId === "colaboradores") {
      conteudo.innerHTML = carregando;
      conteudo.innerHTML = pagina.id === "importar" ? await paginaImportacao() : await paginaColaboradores();
    } else if (moduloId === "tomadores") {
      conteudo.innerHTML = carregando;
      conteudo.innerHTML = await paginaTomadores();
    } else if (moduloId === "folha") {
      conteudo.innerHTML = carregando;
      const telas = { resumo: paginaFolhaResumo, holerites: paginaHolerites, tomadores: paginaFolhaTomadores, verbas: paginaVerbas };
      conteudo.innerHTML = await telas[pagina.id]();
    } else if (moduloId === "administracao") {
      conteudo.innerHTML = carregando;
      const telas = { usuarios: paginaUsuarios, perfis: paginaPerfis, externos: paginaContasExternas, auditoria: paginaAuditoria };
      conteudo.innerHTML = await telas[pagina.id]();
    } else {
      conteudo.innerHTML = telaEmBreve({ nome: modulo.nome, icone: ICONE_MODULO[moduloId], ...EM_BREVE[moduloId] });
    }
  } catch (erro) {
    if (!sessao.ativa) return undefined;
    conteudo.innerHTML = `<div class="cartao vazio"><strong>Não foi possível carregar.</strong><p class="dica">${esc(erro.message)}</p></div>`;
  }
  return undefined;
}

// ---------------------------------------------------------------- telas

const ILUSTRACAO = `
<svg class="ilustracao" viewBox="0 0 260 170" aria-hidden="true">
  <defs>
    <linearGradient id="il1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".75"/></linearGradient>
    <linearGradient id="il2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff8a3d"/><stop offset="1" stop-color="#ffb547"/></linearGradient>
  </defs>
  <rect x="18" y="22" width="150" height="120" rx="14" fill="url(#il1)"/>
  <circle cx="48" cy="54" r="14" fill="#c9c1ff"/><rect x="70" y="46" width="70" height="7" rx="3.5" fill="#d9d4ff"/><rect x="70" y="58" width="46" height="6" rx="3" fill="#ebe8fd"/>
  <circle cx="48" cy="92" r="14" fill="#ffd3b0"/><rect x="70" y="84" width="60" height="7" rx="3.5" fill="#d9d4ff"/><rect x="70" y="96" width="38" height="6" rx="3" fill="#ebe8fd"/>
  <rect x="34" y="118" width="118" height="9" rx="4.5" fill="#ebe8fd"/><rect x="34" y="118" width="84" height="9" rx="4.5" fill="url(#il2)"/>
  <rect x="150" y="60" width="96" height="92" rx="14" fill="#fff"/>
  <circle cx="198" cy="96" r="24" fill="none" stroke="#ebe8fd" stroke-width="7"/>
  <circle cx="198" cy="96" r="24" fill="none" stroke="url(#il2)" stroke-width="7" stroke-linecap="round" stroke-dasharray="120 151" transform="rotate(-90 198 96)"/>
  <text x="198" y="101" text-anchor="middle" font-family="Inter,sans-serif" font-weight="800" font-size="14" fill="#261c63">87</text>
  <rect x="172" y="132" width="52" height="7" rx="3.5" fill="#ebe8fd"/>
  <circle cx="226" cy="30" r="16" fill="url(#il2)"/><path d="M219 30l5 5 9-10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function telaInicio() {
  const r = estado.resumo ?? { vagas: {}, candidaturas: {} };
  const emAndamento = estado.candidaturas.filter((c) => c.status === "EM_ANDAMENTO");
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  const indicadores = [
    { rotulo: "Vagas abertas", valor: r.vagas.abertas ?? 0, icone: "vagas", cor: "var(--marca-500)", fundo: "var(--marca-100)", nota: `${r.vagas.total ?? 0} no total` },
    { rotulo: "Candidaturas", valor: r.candidaturas.total ?? estado.candidaturas.length, icone: "candidatos", cor: "var(--azul)", fundo: "var(--azul-bg)", nota: `${estado.candidatos.length} no banco de talentos` },
    { rotulo: "Em andamento", valor: r.candidaturas.emAndamento ?? emAndamento.length, icone: "pipeline", cor: "var(--ambar)", fundo: "var(--ambar-bg)", nota: `${(r.slaAtrasadas ?? []).length} com prazo vencido` },
    { rotulo: "Destaques", valor: r.candidaturas.destaques ?? 0, icone: "estrela", cor: "var(--verde)", fundo: "var(--verde-bg)", nota: "score acima de 80" },
  ];

  // Funil agregado de todas as vagas abertas, pela ordem das etapas-padrão.
  const etapas = new Map();
  for (const vaga of estado.vagas.filter((v) => v.status === "ABERTA")) {
    for (const e of vaga.etapas ?? []) if (e.tipo !== "SAIDA" && !etapas.has(e.id)) etapas.set(e.id, { nome: e.nome, ordem: e.ordem, n: 0 });
  }
  for (const c of emAndamento) if (etapas.has(c.etapaAtualId)) etapas.get(c.etapaAtualId).n += 1;
  const linhasFunil = [...etapas.values()].sort((a, b) => a.ordem - b.ordem);
  const maxFunil = Math.max(1, ...linhasFunil.map((l) => l.n));

  const destaques = [...emAndamento].sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0)).slice(0, 5);
  const vagasRecentes = [...estado.vagas].sort((a, b) => String(b.datas?.criadaEm ?? "").localeCompare(String(a.datas?.criadaEm ?? ""))).slice(0, 4);

  return `
    <section class="boas-vindas">
      <div>
        <h2>${saudacao}! Seu processo seletivo em um só lugar.</h2>
        <p>${r.vagas.abertas ?? 0} vagas abertas e ${emAndamento.length} candidatos em andamento. A triagem automática já ordenou todos pelo score de aderência.</p>
        <div class="acoes">
          ${sessao.pode("recrutamento", "criar") ? `<button class="botao botao-claro" data-acao="nova-vaga">${icone("mais")}Publicar vaga</button>` : ""}
          <a class="botao botao-vidro" href="#/recrutamento/pipeline">${icone("pipeline")}Ver processo seletivo</a>
        </div>
      </div>
      ${ILUSTRACAO}
    </section>

    <section class="indicadores">
      ${indicadores.map((i) => `
        <div class="cartao indicador">
          <span class="indicador-icone" style="color:${i.cor};background:${i.fundo}">${icone(i.icone)}</span>
          <div><small>${i.rotulo}</small><strong>${i.valor}</strong><span class="dica">${esc(i.nota)}</span></div>
        </div>`).join("")}
    </section>

    <section class="grade-inicio">
      <div class="cartao">
        <div class="cartao-cabecalho"><div><h3>Funil de seleção</h3><p>Candidatos em andamento por etapa, em todas as vagas abertas</p></div></div>
        <div class="cartao-corpo">
          <div class="funil">
            ${linhasFunil.map((l) => `
              <div class="funil-linha"><span>${esc(l.nome)}</span><div class="barra"><i style="width:${Math.max(l.n ? 6 : 0, (l.n / maxFunil) * 100)}%"></i></div><b>${l.n}</b></div>`).join("") || '<div class="vazio">Nenhuma vaga aberta.</div>'}
          </div>
        </div>
      </div>

      <div class="cartao">
        <div class="cartao-cabecalho"><div><h3>Melhores candidatos</h3><p>Maior aderência entre os que estão em andamento</p></div><a class="botao botao-fantasma botao-sm" href="#/recrutamento/pipeline">Ver todos</a></div>
        <div class="cartao-corpo lista">
          ${destaques.map((c) => {
            const cand = candidatoPorId(c.candidatoId);
            return `<div class="lista-item" data-candidatura="${esc(c.id)}">
              ${avatar(cand?.dados?.nome)}
              <div class="texto"><strong>${esc(cand?.dados?.nome ?? "Candidato")}</strong><small>${esc(vagaPorId(c.vagaId)?.titulo ?? "")}</small></div>
              ${anel(c.score?.total)}
            </div>`;
          }).join("") || '<div class="vazio">Sem candidaturas ainda.</div>'}
        </div>
      </div>

      <div class="cartao">
        <div class="cartao-cabecalho"><div><h3>Vagas recentes</h3><p>Acompanhe as últimas publicações</p></div><a class="botao botao-fantasma botao-sm" href="#/recrutamento/vagas">Ver vagas</a></div>
        <div class="cartao-corpo lista">
          ${vagasRecentes.map((v) => {
            const va = visualArea(v.area);
            const n = estado.candidaturas.filter((c) => c.vagaId === v.id).length;
            return `<a class="lista-item" href="#/recrutamento/pipeline/${encodeURIComponent(v.id)}">
              <span class="indicador-icone" style="width:38px;height:38px;color:hsl(${va.h} 60% 40%);background:hsl(${va.h} 80% 94%)">${icone(va.icone)}</span>
              <div class="texto"><strong>${esc(v.titulo)}</strong><small>${esc(local(v))} · ${n} candidato${n === 1 ? "" : "s"}</small></div>
              ${etiqueta(STATUS_VAGA, v.status)}
            </a>`;
          }).join("")}
        </div>
      </div>

      <div class="cartao">
        <div class="cartao-cabecalho"><div><h3>Origem dos candidatos</h3><p>De onde vêm as candidaturas</p></div></div>
        <div class="cartao-corpo">${graficoOrigens()}</div>
      </div>
    </section>`;
}

const NOME_CANAL = {
  PORTAL_LABUTAR: "Portal de vagas", LINKEDIN: "LinkedIn", INDEED: "Indeed", CATHO: "Catho",
  INFOJOBS: "InfoJobs", INDICACAO: "Indicação", WHATSAPP: "WhatsApp", FACEBOOK: "Facebook", MANUAL: "Cadastro manual",
};
function graficoOrigens() {
  const dados = estado.origens.filter((o) => o.quantidade > 0);
  const total = dados.reduce((s, o) => s + o.quantidade, 0);
  if (!total) return '<div class="vazio">Sem candidaturas ainda.</div>';
  const cores = ["#5b47e0", "#ff8a3d", "#12a071", "#2f7ae5", "#d6455d", "#c77a0a"];
  let acumulado = 0;
  const fatias = dados.map((o, i) => {
    const parte = (o.quantidade / total) * 100;
    const arco = `<circle cx="21" cy="21" r="15.9155" fill="none" stroke="${cores[i % cores.length]}" stroke-width="6" pathLength="100" stroke-dasharray="${parte} ${100 - parte}" stroke-dashoffset="${-acumulado}" transform="rotate(-90 21 21)"/>`;
    acumulado += parte;
    return arco;
  }).join("");
  return `<div class="rosca">
    <svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="#eef0f5" stroke-width="6"/>${fatias}
      <text x="21" y="21" text-anchor="middle" font-size="7" font-weight="800" fill="#171a2b" font-family="Inter,sans-serif">${total}</text>
      <text x="21" y="27" text-anchor="middle" font-size="3.2" fill="#8a90a8" font-family="Inter,sans-serif">candidaturas</text></svg>
    <div class="legenda">${dados.map((o, i) => `<div><i style="background:${cores[i % cores.length]}"></i>${esc(NOME_CANAL[o.canal] ?? o.canal)}<b>${Math.round((o.quantidade / total) * 100)}%</b></div>`).join("")}</div>
  </div>`;
}

function telaVagas() {
  const contagem = (s) => estado.vagas.filter((v) => s === "TODAS" || v.status === s).length;
  const filtros = [["TODAS", "Todas"], ["ABERTA", "Abertas"], ["RASCUNHO", "Rascunhos"], ["PAUSADA", "Pausadas"], ["ENCERRADA", "Encerradas"]];
  const vagas = estado.vagas.filter((v) =>
    (estado.filtroVagas === "TODAS" || v.status === estado.filtroVagas) &&
    casaBusca(v.titulo, v.area, v.local?.cidade, v.resumo));

  return `
    <div class="barra-filtros">
      ${filtros.map(([s, nome]) => `<button class="filtro ${estado.filtroVagas === s ? "ativo" : ""}" data-filtro-vagas="${s}">${nome}<b>${contagem(s)}</b></button>`).join("")}
      <span class="direita">${vagas.length} vaga${vagas.length === 1 ? "" : "s"}</span>
    </div>
    <div class="grade-vagas">
      ${vagas.map(cartaoVaga).join("") || '<div class="cartao vazio">Nenhuma vaga encontrada.</div>'}
    </div>`;
}

function cartaoVaga(v) {
  const va = visualArea(v.area);
  const candidaturas = estado.candidaturas.filter((c) => c.vagaId === v.id);
  const pessoas = candidaturas.slice(0, 4).map((c) => candidatoPorId(c.candidatoId)?.dados?.nome ?? "?");
  const competencias = (v.competencias ?? []).slice(0, 4);
  return `
    <article class="cartao vaga">
      <div class="vaga-capa" style="--h:${va.h}">
        <span class="vaga-capa-icone">${icone(va.icone)}</span>
        ${etiqueta(STATUS_VAGA, v.status)}
      </div>
      <div class="vaga-corpo">
        <div>
          <div class="vaga-area">${esc(v.area || "Geral")}${v.nivel ? ` · ${esc(v.nivel)}` : ""}</div>
          <h3>${esc(v.titulo)}</h3>
        </div>
        ${v.resumo ? `<p class="vaga-resumo">${esc(v.resumo)}</p>` : ""}
        <div class="meta">
          <span>${icone("local")}${esc(local(v))}</span>
          <span>${icone("pessoas")}${v.quantidadeVagas ?? 1} posição${(v.quantidadeVagas ?? 1) > 1 ? "ões" : ""}</span>
          ${v.tipoContrato ? `<span>${icone("admissao")}${esc(CONTRATO[v.tipoContrato] ?? v.tipoContrato)}</span>` : ""}
        </div>
        ${competencias.length ? `<div class="chips">${competencias.map((c) => `<span class="chip">${esc(c.nome)}</span>`).join("")}</div>` : ""}
        <div class="vaga-salario">${esc(faixaSalarial(v))} <small>/ mês</small></div>
      </div>
      <div class="vaga-rodape">
        <div class="pilha">
          ${pessoas.map((n) => avatar(n)).join("")}
          <small>${candidaturas.length ? `${candidaturas.length} candidato${candidaturas.length === 1 ? "" : "s"}` : "Sem candidatos ainda"}</small>
        </div>
        ${v.status === "RASCUNHO" && sessao.pode("recrutamento", "editar")
          ? `<button class="botao botao-secundario botao-sm" data-abrir-vaga="${esc(v.id)}">Publicar</button>`
          : `<a class="botao botao-secundario botao-sm" href="#/recrutamento/pipeline/${encodeURIComponent(v.id)}">Processo ${icone("seta")}</a>`}
      </div>
    </article>`;
}

const COR_ETAPA = { TRIAGEM: "#8a90a8", CURRICULO: "#2f7ae5", AVALIACAO: "#5b47e0", ENTREVISTA: "#c77a0a", PROPOSTA: "#ff8a3d", APPROVACAO: "#12a071", ADMISSAO: "#0e8f6a" };

function telaPipeline(vagaId) {
  const elegiveis = estado.vagas.filter((v) => v.status !== "RASCUNHO" && v.status !== "CANCELADA");
  const vaga = vagaPorId(vagaId) ?? vagaPorId(estado.vagaPipeline) ?? elegiveis[0];
  if (!vaga) return '<div class="cartao vazio">Nenhuma vaga publicada ainda.</div>';
  estado.vagaPipeline = vaga.id;

  const candidaturas = estado.candidaturas.filter((c) => c.vagaId === vaga.id);
  const colunas = (vaga.etapas ?? []).filter((e) => e.tipo !== "SAIDA").sort((a, b) => a.ordem - b.ordem);

  return `
    <div class="pipeline-topo">
      <select class="seletor" id="seletor-vaga">
        ${elegiveis.map((v) => `<option value="${esc(v.id)}" ${v.id === vaga.id ? "selected" : ""}>${esc(v.titulo)}</option>`).join("")}
      </select>
      ${etiqueta(STATUS_VAGA, vaga.status)}
      <div class="meta"><span>${icone("local")}${esc(local(vaga))}</span><span>${icone("candidatos")}${candidaturas.length} candidatura${candidaturas.length === 1 ? "" : "s"}</span></div>
    </div>
    <div class="kanban">
      ${colunas.map((etapa) => {
        const cards = candidaturas
          .filter((c) => c.etapaAtualId === etapa.id && casaBusca(candidatoPorId(c.candidatoId)?.dados?.nome))
          .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
        return `<section class="coluna">
          <header class="coluna-topo"><i style="background:${COR_ETAPA[etapa.tipo] ?? "#8a90a8"}"></i><strong>${esc(etapa.nome)}</strong><span>${cards.length}</span></header>
          ${cards.map(fichaCandidatura).join("") || '<div class="coluna-vazia">Nenhum candidato nesta etapa</div>'}
        </section>`;
      }).join("")}
    </div>`;
}

function fichaCandidatura(c) {
  const cand = candidatoPorId(c.candidatoId);
  const nome = cand?.dados?.nome ?? "Candidato";
  const dias = diasDesde(c.etapaAtualDesde);
  return `<article class="cartao ficha" data-candidatura="${esc(c.id)}">
    <div class="ficha-topo">
      ${avatar(nome)}
      <div class="texto"><strong>${esc(nome)}</strong><small>${esc(cand ? cargoAtual(cand) : "")}</small></div>
      ${anel(c.score?.total)}
    </div>
    <div class="ficha-rodape">
      <span>${icone("relogio")}${dias === null ? "—" : dias === 0 ? "Entrou hoje" : `${dias} dia${dias === 1 ? "" : "s"} na etapa`}</span>
      ${c.status !== "EM_ANDAMENTO" ? etiqueta(STATUS_CANDIDATURA, c.status) : c.score?.destaque ? '<span class="etiqueta e-destaque sem-ponto">★ Destaque</span>' : ""}
    </div>
  </article>`;
}

function telaCandidatos() {
  const lista = estado.candidatos.filter((c) =>
    casaBusca(c.dados?.nome, c.contato?.cidade, cargoAtual(c), ...(c.competencias ?? []).map((x) => x.nome)));
  return `
    <div class="barra-filtros"><span class="direita" style="margin-left:0">${lista.length} pessoa${lista.length === 1 ? "" : "s"} no banco de talentos</span></div>
    <div class="grade-candidatos">
      ${lista.map((c) => {
        const cands = estado.candidaturas.filter((x) => x.candidatoId === c.id);
        const melhor = Math.max(0, ...cands.map((x) => x.score?.total ?? 0));
        const comp = [...(c.competencias ?? [])].sort((a, b) => (b.nivel ?? 0) - (a.nivel ?? 0)).slice(0, 4);
        return `<article class="cartao perfil" data-candidato="${esc(c.id)}">
          <div class="perfil-topo">
            ${avatar(c.dados?.nome, "avatar-lg")}
            <div class="texto"><strong>${esc(c.dados?.nome)}</strong><small>${esc(cargoAtual(c))}</small>
              <div class="meta" style="margin-top:6px"><span>${icone("local")}${esc([c.contato?.cidade, c.contato?.uf].filter(Boolean).join(" / ") || "—")}</span></div>
            </div>
            ${cands.length ? anel(melhor) : ""}
          </div>
          ${comp.length ? `<div class="chips">${comp.map((x) => `<span class="chip">${esc(x.nome)}</span>`).join("")}</div>` : ""}
          <div class="perfil-rodape">
            <span>${cands.length ? `<b>${cands.length}</b> candidatura${cands.length === 1 ? "" : "s"}` : "Sem candidaturas"}${c.pretensaoSalarial ? ` · pretensão <b>${moeda(c.pretensaoSalarial)}</b>` : ""}</span>
            <span class="contatos">
              ${c.contato?.email ? `<a href="mailto:${esc(c.contato.email)}" title="${esc(c.contato.email)}" data-parar>${icone("email")}</a>` : ""}
              ${c.contato?.telefone ? `<a href="tel:${esc(c.contato.telefone.replace(/\D/g, ""))}" title="${esc(c.contato.telefone)}" data-parar>${icone("telefone")}</a>` : ""}
            </span>
          </div>
        </article>`;
      }).join("") || '<div class="cartao vazio">Nenhum candidato encontrado.</div>'}
    </div>`;
}

function telaEmBreve(m) {
  return `<section class="cartao em-breve-pagina">
    <div>
      <span class="etiqueta e-destaque">${icone("foguete", "")}Em desenvolvimento</span>
      <h2>${esc(m.titulo ?? m.nome)}</h2>
      <p>${esc(m.resumo)}</p>
      <div class="recursos">${m.recursos.map((r) => `<div class="recurso">${icone("ok")}<span>${esc(r)}</span></div>`).join("")}</div>
    </div>
    <div class="em-breve-arte">${icone(m.icone)}</div>
  </section>`;
}

// ---------------------------------------------------------------- painel lateral

const NOME_COMPONENTE = { competencias: "Competências", experiencia: "Experiência", formacao: "Formação", idiomas: "Idiomas", localizacao: "Localização" };

function painelCandidatura(id) {
  const c = estado.candidaturas.find((x) => x.id === id);
  if (!c) return;
  const cand = candidatoPorId(c.candidatoId);
  const vaga = vagaPorId(c.vagaId);
  const etapas = (vaga?.etapas ?? []).filter((e) => e.tipo !== "SAIDA").sort((a, b) => a.ordem - b.ordem);
  const indice = etapas.findIndex((e) => e.id === c.etapaAtualId);
  const proxima = etapas[indice + 1];
  const comp = c.score?.componentes ?? {};
  const detalhe = comp.competencias?.detalhe ?? [];
  const nome = cand?.dados?.nome ?? "Candidato";

  abrirPainel(`
    <header class="painel-cabecalho">
      ${avatar(nome, "avatar-lg")}
      <div class="texto">
        <h2>${esc(nome)}</h2>
        <p>${esc(cand ? cargoAtual(cand) : "")}</p>
        <div class="meta" style="margin-top:8px">
          ${cand?.contato?.cidade ? `<span>${icone("local")}${esc(cand.contato.cidade)} / ${esc(cand.contato.uf ?? "")}</span>` : ""}
          ${cand?.contato?.email ? `<span>${icone("email")}${esc(cand.contato.email)}</span>` : ""}
          ${cand?.contato?.telefone ? `<span>${icone("telefone")}${esc(cand.contato.telefone)}</span>` : ""}
        </div>
      </div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <div class="painel-corpo">
      <div class="secao">
        <h4>${esc(vaga?.titulo ?? "")}</h4>
        <div class="etapas-trilha">${etapas.map((e, i) => `<i class="${i < indice ? "feito" : i === indice ? "atual" : ""}" title="${esc(e.nome)}"></i>`).join("")}</div>
        <p class="dica" style="margin-top:8px">Etapa atual: <b>${esc(etapas[indice]?.nome ?? c.etapaAtualId)}</b> · ${quando(c.etapaAtualDesde)} · ${etiqueta(STATUS_CANDIDATURA, c.status)}</p>
      </div>

      <div class="score-resumo">
        ${anel(c.score?.total, "anel-lg")}
        <div>
          <strong>Aderência à vaga</strong>
          <p>${esc(DECISAO[c.triagem?.decisao] ?? (c.score?.destaque ? "Candidato em destaque para esta vaga" : "Calculado pela triagem automática"))}</p>
          <p class="dica">Nota de corte: ${c.score?.corteMinimo ?? "—"}</p>
        </div>
      </div>

      <div class="secao">
        <h4>Composição do score</h4>
        <div class="componentes">
          ${Object.entries(comp).map(([k, v]) => `
            <div class="componente"><span>${NOME_COMPONENTE[k] ?? k}</span><div class="barra"><i style="width:${v?.score ?? 0}%;background:${corScore(v?.score ?? 0)}"></i></div><b>${v?.score ?? 0}</b></div>`).join("")}
        </div>
      </div>

      ${detalhe.length ? `<div class="secao">
        <h4>Competências exigidas</h4>
        <table class="competencias-tabela">
          ${detalhe.map((d) => `<tr>
            <td>${esc(d.competencia)}${d.obrigatoria ? ' <span class="etiqueta e-marca sem-ponto">obrigatória</span>' : ""}</td>
            <td><span class="niveis">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= (d.nivelCandidato ?? 0) ? "cheio" : ""}"></i>`).join("")}</span></td>
            <td>${d.atende ? '<span class="etiqueta e-verde">atende</span>' : '<span class="etiqueta e-vermelho">abaixo</span>'}</td>
          </tr>`).join("")}
        </table>
      </div>` : ""}

      ${(c.respostasKnockout ?? []).length ? `<div class="secao">
        <h4>Perguntas eliminatórias</h4>
        <div class="lista">${c.respostasKnockout.map((k) => `<div class="lista-item" style="cursor:default">
          <div class="texto"><strong style="white-space:normal">${esc(k.pergunta)}</strong><small>Resposta: ${esc(k.valor)}</small></div>
          ${k.pendente ? '<span class="etiqueta e-ambar">pendente</span>' : k.atende ? '<span class="etiqueta e-verde">atende</span>' : '<span class="etiqueta e-vermelho">não atende</span>'}
        </div>`).join("")}</div>
      </div>` : ""}

      <div class="secao">
        <h4>Histórico</h4>
        <ul class="linha-tempo">
          ${(c.historico ?? []).slice().reverse().map((h) => `<li><b>${esc(etapas.find((e) => e.id === (h.paraEtapaId ?? h.etapaId))?.nome ?? h.paraEtapaId ?? h.etapaId ?? h.evento ?? "Movimentação")}</b>${h.observacao ? ` — ${esc(h.observacao)}` : ""}<small>${h.em ? dataHora(h.em) : ""}</small></li>`).join("") || "<li>Candidatura recebida<small>" + esc(quando(c.criadaEm ?? c.etapaAtualDesde)) + "</small></li>"}
        </ul>
      </div>
    </div>
    <footer class="painel-rodape">
      <button class="botao botao-secundario" data-fechar>Fechar</button>
      ${proxima && c.status === "EM_ANDAMENTO" && sessao.pode("recrutamento", "editar")
        ? `<button class="botao botao-primario" data-mover="${esc(c.id)}" data-para="${esc(proxima.id)}">Avançar para ${esc(proxima.nome)} ${icone("seta")}</button>`
        : ""}
    </footer>`);
}

function painelCandidato(id) {
  const c = candidatoPorId(id);
  if (!c) return;
  const cands = estado.candidaturas.filter((x) => x.candidatoId === id);
  abrirPainel(`
    <header class="painel-cabecalho">
      ${avatar(c.dados?.nome, "avatar-lg")}
      <div class="texto"><h2>${esc(c.dados?.nome)}</h2><p>${esc(cargoAtual(c))}</p>
        <div class="meta" style="margin-top:8px">
          ${c.contato?.cidade ? `<span>${icone("local")}${esc(c.contato.cidade)} / ${esc(c.contato.uf ?? "")}</span>` : ""}
          ${c.contato?.email ? `<span>${icone("email")}${esc(c.contato.email)}</span>` : ""}
          ${c.contato?.telefone ? `<span>${icone("telefone")}${esc(c.contato.telefone)}</span>` : ""}
        </div></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <div class="painel-corpo">
      ${c.curriculoTexto ? `<div class="secao"><h4>Resumo</h4><p>${esc(c.curriculoTexto)}</p></div>` : ""}
      <div class="secao"><h4>Candidaturas</h4><div class="lista">
        ${cands.map((x) => `<div class="lista-item" data-candidatura="${esc(x.id)}"><div class="texto"><strong>${esc(vagaPorId(x.vagaId)?.titulo ?? "")}</strong><small>${esc(vagaPorId(x.vagaId)?.etapas?.find((e) => e.id === x.etapaAtualId)?.nome ?? "")}</small></div>${anel(x.score?.total)}</div>`).join("") || '<p class="dica">Nenhuma candidatura.</p>'}
      </div></div>
      ${(c.competencias ?? []).length ? `<div class="secao"><h4>Competências</h4><table class="competencias-tabela">
        ${c.competencias.map((x) => `<tr><td>${esc(x.nome)}</td><td style="text-align:right"><span class="niveis">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= (x.nivel ?? 0) ? "cheio" : ""}"></i>`).join("")}</span></td></tr>`).join("")}
      </table></div>` : ""}
      ${(c.experiencias ?? []).length ? `<div class="secao"><h4>Experiência</h4><ul class="linha-tempo">
        ${c.experiencias.map((e) => `<li><b>${esc(e.cargo)}</b> · ${esc(e.empresa)}<small>${esc(e.inicio?.slice(0, 7) ?? "")} — ${e.atual ? "atual" : esc(e.fim?.slice(0, 7) ?? "")}</small></li>`).join("")}
      </ul></div>` : ""}
      ${(c.formacao ?? []).length ? `<div class="secao"><h4>Formação</h4><ul class="linha-tempo">
        ${c.formacao.map((f) => `<li><b>${esc(f.curso)}</b><small>${esc(f.instituicao ?? "")}${f.concluido ? "" : " · em andamento"}</small></li>`).join("")}
      </ul></div>` : ""}
    </div>
    <footer class="painel-rodape"><button class="botao botao-secundario" data-fechar>Fechar</button></footer>`);
}

function painelNovaVaga() {
  abrirPainel(`
    <header class="painel-cabecalho">
      <span class="indicador-icone" style="color:var(--marca-500);background:var(--marca-100)">${icone("vagas")}</span>
      <div class="texto"><h2>Nova vaga</h2><p>A vaga é criada como rascunho. Você publica quando estiver pronta.</p></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <form class="painel-corpo formulario" id="form-vaga">
      <div class="campo"><label for="f-titulo">Título da vaga *</label><input id="f-titulo" name="titulo" required maxlength="140" placeholder="Ex.: Auxiliar de logística — temporário"></div>
      <div class="campo"><label for="f-resumo">Resumo</label><input id="f-resumo" name="resumo" maxlength="200" placeholder="Uma frase que aparece no cartão da vaga"></div>
      <div class="campo"><label for="f-descricao">Descrição *</label><textarea id="f-descricao" name="descricao" required placeholder="Atividades, requisitos e benefícios"></textarea></div>
      <div class="duas">
        <div class="campo"><label for="f-area">Área</label>
          <select id="f-area" name="area"><option value="">Selecionar</option>${Object.keys(AREAS).map((a) => `<option>${a}</option>`).join("")}</select></div>
        <div class="campo"><label for="f-nivel">Nível</label>
          <select id="f-nivel" name="nivel"><option value="">Selecionar</option><option>Operacional</option><option>Técnico</option><option>Júnior</option><option>Pleno</option><option>Sênior</option><option>Liderança</option></select></div>
      </div>
      <div class="duas">
        <div class="campo"><label for="f-contrato">Contrato</label>
          <select id="f-contrato" name="tipoContrato"><option value="CLT">CLT</option><option value="TEMPORARIO">Temporário</option><option value="PJ">PJ</option><option value="ESTAGIO">Estágio</option><option value="APRENDIZ">Aprendiz</option></select></div>
        <div class="campo"><label for="f-modelo">Modelo</label>
          <select id="f-modelo" name="modelo"><option value="PRESENCIAL">Presencial</option><option value="HIBRIDO">Híbrido</option><option value="REMOTO">Remoto</option></select></div>
      </div>
      <div class="duas">
        <div class="campo"><label for="f-cidade">Cidade</label><input id="f-cidade" name="cidade" placeholder="Ex.: Manaus"></div>
        <div class="campo"><label for="f-uf">UF</label><input id="f-uf" name="uf" maxlength="2" placeholder="AM" style="text-transform:uppercase"></div>
      </div>
      <div class="duas">
        <div class="campo"><label for="f-min">Salário mínimo (R$)</label><input id="f-min" name="salarioMin" type="number" min="0" step="0.01" placeholder="2.200,00"></div>
        <div class="campo"><label for="f-max">Salário máximo (R$)</label><input id="f-max" name="salarioMax" type="number" min="0" step="0.01" placeholder="2.800,00"></div>
      </div>
      <div class="campo"><label for="f-qtd">Número de posições</label><input id="f-qtd" name="quantidadeVagas" type="number" min="1" value="1"></div>
      <p class="dica">Competências, perguntas eliminatórias e etapas podem ser ajustadas depois, antes de publicar.</p>
    </form>
    <footer class="painel-rodape">
      <button class="botao botao-secundario" data-fechar type="button">Cancelar</button>
      <button class="botao botao-primario" type="submit" form="form-vaga">${icone("ok")}Criar rascunho</button>
    </footer>`);
  setTimeout(() => document.getElementById("f-titulo")?.focus(), 250);
}

// ---------------------------------------------------------------- ações

async function criarVaga(form) {
  const f = Object.fromEntries(new FormData(form));
  const centavos = (v) => (v ? Math.round(Number(v) * 100) : 0);
  const corpo = {
    titulo: f.titulo.trim(),
    resumo: f.resumo.trim() || undefined,
    descricao: f.descricao.trim(),
    area: f.area || undefined,
    nivel: f.nivel || undefined,
    tipoContrato: f.tipoContrato,
    local: { modelo: f.modelo, cidade: f.cidade.trim() || undefined, uf: f.uf.trim().toUpperCase() || undefined },
    salario: { min: centavos(f.salarioMin), max: centavos(f.salarioMax), exibir: Boolean(f.salarioMin || f.salarioMax) },
    quantidadeVagas: Math.max(1, Number(f.quantidadeVagas) || 1),
  };
  try {
    const dados = await api("/vagas", { metodo: "POST", corpo });
    estado.vagas.unshift(dados.vaga);
    fecharPainel();
    estado.filtroVagas = "TODAS";
    irPara("#/recrutamento/vagas");
    aviso("Rascunho criado. Complete e publique quando quiser.");
  } catch (erro) {
    aviso(erro.message, "erro");
  }
}

async function publicarVaga(id) {
  try {
    const dados = await api(`/vagas/${id}/status`, { metodo: "POST", corpo: { para: "ABERTA" } });
    const i = estado.vagas.findIndex((v) => v.id === id);
    if (i >= 0) estado.vagas[i] = dados.vaga ?? dados;
    renderizar();
    aviso("Vaga publicada.");
  } catch (erro) {
    aviso(`Não foi possível publicar: ${erro.message}`, "erro");
  }
}

async function moverCandidatura(id, paraEtapaId) {
  try {
    const atualizada = await api(`/candidaturas/${id}/mover`, {
      metodo: "POST",
      corpo: { paraEtapaId, observacao: "Movido pelo painel" },
    });
    const i = estado.candidaturas.findIndex((c) => c.id === id);
    if (i >= 0) estado.candidaturas[i] = { ...estado.candidaturas[i], ...atualizada };
    fecharPainel();
    renderizar();
    aviso("Candidato avançou de etapa.");
  } catch (erro) {
    aviso(erro.message, "erro");
  }
}

// ---------------------------------------------------------------- eventos

document.addEventListener("click", (evento) => {
  const alvo = evento.target;
  if (alvo.closest("[data-parar]")) return;

  if (alvo.closest("[data-fechar]")) return fecharPainel();
  const filtro = alvo.closest("[data-filtro-vagas]");
  if (filtro) { estado.filtroVagas = filtro.dataset.filtroVagas; return renderizar(); }
  const publicar = alvo.closest("[data-abrir-vaga]");
  if (publicar) return publicarVaga(publicar.dataset.abrirVaga);
  const mover = alvo.closest("[data-mover]");
  if (mover) return moverCandidatura(mover.dataset.mover, mover.dataset.para);
  if (alvo.closest("[data-acao='nova-vaga']")) return painelNovaVaga();
  const candidatura = alvo.closest("[data-candidatura]");
  if (candidatura) return painelCandidatura(candidatura.dataset.candidatura);
  const candidato = alvo.closest("[data-candidato]");
  if (candidato) return painelCandidato(candidato.dataset.candidato);
});

document.addEventListener("change", (evento) => {
  if (evento.target.id === "seletor-vaga") location.hash = `#/recrutamento/pipeline/${encodeURIComponent(evento.target.value)}`;
});

document.addEventListener("submit", (evento) => {
  if (evento.target.id === "form-vaga") {
    evento.preventDefault();
    criarVaga(evento.target);
  }
});

document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape") fecharPainel();
});

document.getElementById("busca").addEventListener("input", (evento) => {
  estado.busca = evento.target.value;
  const { modulo, pagina } = rotaAtual();
  if (modulo !== "recrutamento") return;
  if (!["vagas", "candidatos", "pipeline"].includes(pagina)) location.hash = "#/recrutamento/candidatos";
  else renderizar();
});

window.addEventListener("hashchange", renderizar);

// ícones da moldura
document.getElementById("icone-busca").innerHTML = icone("busca");
document.getElementById("botao-sino").innerHTML = `${icone("sino")}<span class="ponto-alerta"></span>`;
document.getElementById("botao-nova-vaga").innerHTML = `${icone("mais")}<span>Nova vaga</span>`;
document.getElementById("botao-nova-vaga").dataset.acao = "nova-vaga";
document.getElementById("abrir-menu").innerHTML = icone("menu");
document.getElementById("botao-sair").innerHTML = icone("sair");
document.getElementById("abrir-menu").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("aberta"));
document.getElementById("sidebar-fundo").addEventListener("click", () => document.getElementById("sidebar").classList.remove("aberta"));

ligarEventosAcesso({ aoAlterar: renderizar });
ligarEventosFolha({ aoAlterar: renderizar });
ligarEventosCadastro({ aoAlterar: renderizar });
sessao.aoSair((motivo) => {
  limparDados();
  history.replaceState(null, "", "#/");
  telaLogin({ motivo, aoEntrar: () => { limparDados(); irPara("#/"); } });
});
renderizar();
