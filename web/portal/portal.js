/**
 * Portal dos públicos externos: candidato, colaborador e cliente (tomador).
 *
 * Cada tipo de conta vê uma área própria. Tudo que aparece aqui vem de rotas
 * /api/portal/* que filtram pelo escopo gravado na conta — a tela nunca envia
 * "de quem" é o dado.
 */
import { icone } from "../app/icones.js";
import { api, adotarSessao, entrar, sessao } from "../app/sessao.js";
import { esc, avatar, aviso, abrirPainel, fecharPainel, dataHora } from "../app/ui.js";
import { esconderTelaCheia, ligarEventosAcesso, telaTrocarSenhaObrigatoria } from "../app/acesso-telas.js";
import { validarSenha } from "/packages/acesso/src/index.js";

const TIPOS = {
  CANDIDATO: { id: "CANDIDATO", nome: "Candidato", titulo: "Portal do candidato", icone: "candidatos",
    chamada: "Acompanhe suas candidaturas e encontre novas vagas." },
  COLABORADOR: { id: "COLABORADOR", nome: "Colaborador", titulo: "Portal do colaborador", icone: "cracha",
    chamada: "Holerites, ponto, férias e documentos na palma da mão." },
  TOMADOR: { id: "TOMADOR", nome: "Cliente", titulo: "Portal do cliente", icone: "tomadores",
    chamada: "Acompanhe os trabalhadores do seu contrato, aprove ponto e veja faturas." },
};

const MARCA = `<span class="marca-logo" aria-hidden="true"><svg viewBox="0 0 32 32"><defs><linearGradient id="lgp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a3d"/><stop offset="1" stop-color="#ffb547"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#lgp)"/><path d="M10 8v16h12" fill="none" stroke="#1b1446" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="21" cy="11" r="3" fill="#1b1446"/></svg></span>`;

const parametros = new URLSearchParams(location.search);
const local = ["localhost", "127.0.0.1"].includes(location.hostname);
const empresaPadrao = () => parametros.get("empresa") ?? (() => { try { return localStorage.getItem("labutar.empresa"); } catch { return null; } })() ?? (local ? "demo-industrial" : "");
let tipoEscolhido = String(parametros.get("perfil") ?? "CANDIDATO").toUpperCase();
if (!TIPOS[tipoEscolhido]) tipoEscolhido = "CANDIDATO";

const telaCheia = () => document.getElementById("tela-cheia");
function mostrarTelaCheia(html) {
  document.getElementById("portal").hidden = true;
  telaCheia().innerHTML = html;
  telaCheia().hidden = false;
}

// ------------------------------------------------------------------ login e cadastro

const CONTAS_DEMO = {
  CANDIDATO: ["ana.lima@exemplo.com", "Ana (candidata)"],
  COLABORADOR: ["joao.batista@exemplo.com", "João (colaborador)"],
  TOMADOR: ["gestor@eletronica-amazonia.com.br", "Gestor do cliente"],
};

function telaEntrada({ modo = "entrar", motivo = null } = {}) {
  const t = TIPOS[tipoEscolhido];
  const cadastro = modo === "cadastro" && t.id === "CANDIDATO";
  mostrarTelaCheia(`
    <div class="login">
      <section class="login-marca">
        <div class="login-marca-topo">${MARCA}<span><strong>Labutar</strong><small>${esc(t.titulo)}</small></span></div>
        <div class="login-marca-texto">
          <h1>${esc(t.titulo)}</h1>
          <p>${esc(t.chamada)}</p>
          <ul>
            <li>${icone("cadeado")}Você vê somente os seus dados</li>
            <li>${icone("ok")}Acesso com a sua própria senha</li>
            <li>${icone("relogio")}Disponível a qualquer hora, também no celular</li>
          </ul>
        </div>
        <small class="login-rodape">É da equipe da empresa? Use o <a href="../app/index.html">painel da empresa</a>.</small>
      </section>
      <section class="login-form-area">
        <form class="login-form" id="form-portal" autocomplete="on">
          <div class="abas" role="tablist">
            ${Object.values(TIPOS).map((x) => `<button type="button" role="tab" class="aba ${x.id === t.id ? "ativa" : ""}" data-tipo="${x.id}">${icone(x.icone)}${esc(x.nome)}</button>`).join("")}
          </div>
          <h2>${cadastro ? "Criar minha conta" : "Entrar"}</h2>
          ${motivo ? `<div class="alerta">${icone("relogio")}<span>${esc(motivo)}</span></div>` : ""}
          <div class="alerta erro" id="portal-erro" hidden></div>
          ${cadastro ? `
            <div class="campo"><label for="p-nome">Nome completo</label><input id="p-nome" name="nome" required minlength="3" autocomplete="name"></div>` : ""}
          <div class="campo"><label for="p-email">E-mail</label><input id="p-email" name="email" type="email" required autocomplete="username"></div>
          ${cadastro ? `
            <div class="duas">
              <div class="campo"><label for="p-cidade">Cidade</label><input id="p-cidade" name="cidade" autocomplete="address-level2"></div>
              <div class="campo"><label for="p-uf">UF</label><input id="p-uf" name="uf" maxlength="2" style="text-transform:uppercase"></div>
            </div>
            <div class="campo"><label for="p-telefone">Celular</label><input id="p-telefone" name="telefone" autocomplete="tel"></div>` : ""}
          <div class="campo"><label for="p-senha">${cadastro ? "Crie uma senha" : "Senha"}</label>
            <div class="campo-senha"><input id="p-senha" name="senha" type="password" required ${cadastro ? 'minlength="10" autocomplete="new-password"' : 'autocomplete="current-password"'}>
            <button type="button" class="botao-fantasma botao-sm" data-mostrar-senha="p-senha">Mostrar</button></div>
            ${cadastro ? '<p class="dica">Mínimo de 10 caracteres. Uma frase curta funciona bem.</p>' : ""}</div>
          ${cadastro ? `
            <div class="campo" id="campo-codigo" hidden><label for="p-codigo">Código de acompanhamento</label>
              <input id="p-codigo" name="codigoAcompanhamento" placeholder="recebido quando você se candidatou">
              <p class="dica">Já existe um currículo com este e-mail. O código prova que é você e liga suas candidaturas antigas à conta.</p></div>
            <label class="aceite"><input type="checkbox" name="aceite" required>
              <span>Autorizo a <b>${esc(empresaPadrao() || "empresa")}</b> a tratar meus dados para processos seletivos, conforme a LGPD. Posso pedir a exclusão a qualquer momento.</span></label>` : ""}
          <details class="empresa-campo" ${empresaPadrao() ? "" : "open"}><summary>Empresa: <b>${esc(empresaPadrao() || "informe")}</b></summary>
            <div class="campo"><input id="p-empresa" name="empresa" required value="${esc(empresaPadrao())}" placeholder="identificador da empresa"></div></details>
          <button class="botao botao-primario botao-largo" type="submit" id="botao-portal">${cadastro ? "Criar conta e entrar" : "Entrar"}</button>
          ${t.id === "CANDIDATO" ? `<p class="troca-modo">${cadastro
            ? 'Já tem conta? <a href="#" data-modo="entrar">Entrar</a>'
            : 'Ainda não tem conta? <a href="#" data-modo="cadastro">Criar conta grátis</a>'}</p>`
            : `<p class="dica">O acesso de ${t.id === "COLABORADOR" ? "colaborador é liberado pelo RH da empresa" : "cliente é liberado pela empresa contratada"}. Fale com eles se ainda não recebeu o seu.</p>`}
          ${local && !cadastro ? `<button type="button" class="chip conta-demo" data-demo>Entrar como ${esc(CONTAS_DEMO[t.id][1])} (demonstração)</button>` : ""}
        </form>
      </section>
    </div>`);

  const form = document.getElementById("form-portal");
  form.addEventListener("click", (e) => {
    const aba = e.target.closest("[data-tipo]");
    if (aba) { tipoEscolhido = aba.dataset.tipo; return telaEntrada(); }
    const modoLink = e.target.closest("[data-modo]");
    if (modoLink) { e.preventDefault(); return telaEntrada({ modo: modoLink.dataset.modo }); }
    if (e.target.closest("[data-demo]")) {
      form.email.value = CONTAS_DEMO[t.id][0];
      form.senha.value = "Acesso Demo 2026!";
      form.requestSubmit();
    }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    const botao = document.getElementById("botao-portal");
    const erro = document.getElementById("portal-erro");
    const falhar = (msg) => { erro.innerHTML = `${icone("fechar")}<span>${esc(msg)}</span>`; erro.hidden = false; };
    erro.hidden = true;
    const empresa = String(d.empresa ?? "").trim().toLowerCase();
    try {
      botao.disabled = true;
      if (cadastro) {
        const politica = validarSenha(d.senha, { email: d.email, nome: d.nome, empresa });
        if (!politica.ok) throw new Error(politica.erros[0]);
        const dados = await api("/portal/candidato/cadastro", {
          metodo: "POST", anonimo: true,
          corpo: {
            empresa, nome: d.nome, email: d.email, senha: d.senha, cidade: d.cidade || null, uf: (d.uf || "").toUpperCase() || null,
            telefone: d.telefone || null, codigoAcompanhamento: d.codigoAcompanhamento || undefined,
            consentimento: { aceito: true, versaoTermo: "1.0" },
          },
        });
        adotarSessao(dados);
      } else {
        await entrar({ empresa, email: d.email, senha: d.senha, tipo: t.id });
      }
      try { localStorage.setItem("labutar.empresa", empresa); } catch { /* sem storage */ }
      renderizar();
    } catch (err) {
      if (err.detalhes?.precisaCodigo) document.getElementById("campo-codigo").hidden = false;
      falhar(err.message);
      botao.disabled = false;
    }
  });
  (form.nome ?? form.email).focus();
}

// ------------------------------------------------------------------ moldura do portal

function moldura(conteudo) {
  const t = TIPOS[sessao.tipo];
  const u = sessao.usuario;
  esconderTelaCheia();
  telaCheia().hidden = true;
  const portal = document.getElementById("portal");
  portal.hidden = false;
  portal.innerHTML = `
    <header class="portal-topo">
      <div class="seletor-marca">${MARCA}<span><strong>Labutar</strong><small>${esc(sessao.empresa ?? "")}</small></span></div>
      <span class="etiqueta sem-ponto e-marca portal-tipo">${icone(t.icone)}${esc(t.titulo)}</span>
      <div class="seletor-usuario">
        <button class="usuario usuario-botao" type="button" data-minha-conta>${avatar(u?.nome, "avatar-sm")}<span class="usuario-texto"><strong>${esc(u?.nome)}</strong><small>${esc(u?.email)}</small></span></button>
        <button class="botao botao-secundario botao-sm" type="button" data-sair>${icone("sair")}Sair</button>
      </div>
    </header>
    <main class="portal-conteudo">${conteudo}</main>`;
}

const saudacao = () => {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
};
const primeiroNome = () => String(sessao.usuario?.nome ?? "").split(" ")[0];

// ------------------------------------------------------------------ candidato

const cacheCandidato = { vagas: [], candidaturas: [], candidato: null };

async function areaCandidato() {
  const empresa = sessao.empresa;
  const [minhas, vagas, eu] = await Promise.all([
    api("/portal/candidato/candidaturas"),
    fetch(`/api/publico/vagas?tenant=${encodeURIComponent(empresa)}`).then((r) => r.json()).then((j) => j.dados?.itens ?? []),
    api("/portal/candidato/eu"),
  ]);
  cacheCandidato.candidaturas = minhas.itens;
  cacheCandidato.vagas = vagas;
  cacheCandidato.candidato = eu.candidato;
  const jaCandidatou = new Set(minhas.itens.map((c) => c.vaga?.slug));
  const disponiveis = vagas.filter((v) => !jaCandidatou.has(v.slug));

  return `
    <section class="portal-hero">
      <div><h1>${saudacao()}, ${esc(primeiroNome())}.</h1><p>${esc(TIPOS.CANDIDATO.chamada)}</p></div>
      <button class="botao botao-secundario" data-curriculo>${icone("admissao")}Meu currículo</button>
    </section>

    <section class="portal-secao">
      <h2>Minhas candidaturas <small>${minhas.itens.length}</small></h2>
      ${minhas.itens.length ? `<div class="grade-candidaturas">${minhas.itens.map((c) => `
        <article class="cartao candidatura-portal">
          <header>
            <div><h3>${esc(c.vaga?.titulo ?? "Vaga")}</h3>
              <p class="meta">${c.vaga?.local?.cidade ? `<span>${icone("local")}${esc(c.vaga.local.cidade)}${c.vaga.local.uf ? `, ${esc(c.vaga.local.uf)}` : ""}</span>` : ""}<span>${icone("relogio")}Recebida em ${esc(dataHora(c.recebidaEm))}</span></p></div>
            <span class="etiqueta ${c.status === "EM_ANDAMENTO" ? "e-azul" : c.status === "APROVADO" ? "e-verde" : "e-cinza"}">${esc(c.rotuloStatus)}</span>
          </header>
          <ol class="trilha">${c.etapas.map((e, i) => `<li class="${i < c.indiceEtapa ? "feito" : i === c.indiceEtapa ? "atual" : ""}"><i></i><span>${esc(e)}</span></li>`).join("")}</ol>
          ${c.etapaAtual ? `<p class="dica">Etapa atual: <b>${esc(c.etapaAtual)}</b>. Você será avisado a cada mudança.</p>` : ""}
          ${c.podeDesistir ? `<footer><button class="botao botao-fantasma botao-sm" data-desistir="${esc(c.id)}">Desistir desta vaga</button></footer>` : ""}
        </article>`).join("")}</div>` : `<div class="cartao vazio">Você ainda não se candidatou. Veja as vagas abertas abaixo.</div>`}
    </section>

    <section class="portal-secao">
      <h2>Vagas abertas <small>${disponiveis.length}</small></h2>
      <div class="grade-vagas-portal">${disponiveis.map((v) => `
        <article class="cartao vaga-portal">
          <div class="vaga-area">${esc(v.area ?? "Geral")}${v.nivel ? ` · ${esc(v.nivel)}` : ""}</div>
          <h3>${esc(v.titulo)}</h3>
          ${v.resumo ? `<p class="vaga-resumo">${esc(v.resumo)}</p>` : ""}
          <div class="meta">
            <span>${icone("local")}${esc(v.local?.modelo === "REMOTO" ? "Remoto" : [v.local?.cidade, v.local?.uf].filter(Boolean).join(", ") || "A definir")}</span>
            ${v.salario ? `<span>${icone("dinheiro")}${esc(faixa(v.salario))}</span>` : ""}
          </div>
          <button class="botao botao-primario botao-sm" data-candidatar="${esc(v.slug)}">Quero me candidatar</button>
        </article>`).join("") || '<div class="cartao vazio">Nenhuma vaga nova no momento.</div>'}</div>
    </section>`;
}

const reais = (c) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const faixa = (s) => (s.min && s.max && s.min !== s.max ? `${reais(s.min)} – ${reais(s.max)}` : reais(s.max || s.min));

function campoPergunta(p) {
  const nome = `resp.${p.id}`;
  if (p.tipo === "SIM_NAO") return `<div class="campo"><label>${esc(p.pergunta)}</label><select name="${nome}" ${p.obrigatoria ? "required" : ""}><option value="">Selecione</option><option value="SIM">Sim</option><option value="NAO">Não</option></select></div>`;
  if (p.tipo === "MULTIPLA" && Array.isArray(p.opcoes)) return `<div class="campo"><label>${esc(p.pergunta)}</label><select name="${nome}" ${p.obrigatoria ? "required" : ""}><option value="">Selecione</option>${p.opcoes.map((o) => `<option>${esc(o)}</option>`).join("")}</select></div>`;
  if (p.tipo === "NUMERICA") return `<div class="campo"><label>${esc(p.pergunta)}</label><input type="number" name="${nome}" ${p.obrigatoria ? "required" : ""}></div>`;
  if (p.tipo === "DATA") return `<div class="campo"><label>${esc(p.pergunta)}</label><input type="date" name="${nome}" ${p.obrigatoria ? "required" : ""}></div>`;
  return `<div class="campo"><label>${esc(p.pergunta)}</label><textarea name="${nome}" ${p.obrigatoria ? "required" : ""}></textarea></div>`;
}

function painelCandidatar(slug) {
  const v = cacheCandidato.vagas.find((x) => x.slug === slug);
  if (!v) return;
  abrirPainel(`
    <header class="painel-cabecalho">
      <span class="indicador-icone" style="color:var(--marca-500);background:var(--marca-100)">${icone("vagas")}</span>
      <div class="texto"><h2>${esc(v.titulo)}</h2><p>${esc(v.resumo ?? "")}</p></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <form class="painel-corpo formulario" id="form-candidatar" data-slug="${esc(v.slug)}">
      ${v.descricao ? `<div class="secao"><h4>Sobre a vaga</h4><p style="white-space:pre-line">${esc(v.descricao)}</p></div>` : ""}
      ${v.requisitos?.length ? `<div class="secao"><h4>Requisitos</h4><ul class="lista-simples">${v.requisitos.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>` : ""}
      ${v.beneficios?.length ? `<div class="secao"><h4>Benefícios</h4><div class="chips">${v.beneficios.map((b) => `<span class="chip">${esc(b)}</span>`).join("")}</div></div>` : ""}
      ${v.perguntas?.length ? `<div class="secao"><h4>Algumas perguntas</h4>${v.perguntas.map(campoPergunta).join("")}</div>` : ""}
      <p class="dica">Sua candidatura usa o currículo da sua conta. Ela passa por triagem automática e por revisão de uma pessoa da equipe.</p>
    </form>
    <footer class="painel-rodape">
      <button class="botao botao-secundario" data-fechar type="button">Cancelar</button>
      <button class="botao botao-primario" type="submit" form="form-candidatar">${icone("ok")}Enviar candidatura</button>
    </footer>`);
}

function painelCurriculo() {
  const c = cacheCandidato.candidato ?? {};
  const competencias = (c.competencias ?? []).map((x) => x.nome).join(", ");
  abrirPainel(`
    <header class="painel-cabecalho">
      ${avatar(c.dados?.nome, "avatar-lg")}
      <div class="texto"><h2>Meu currículo</h2><p>${esc(c.contato?.email ?? "")}</p></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <form class="painel-corpo formulario" id="form-curriculo">
      <div class="duas">
        <div class="campo"><label>Celular</label><input name="telefone" value="${esc(c.contato?.telefone ?? "")}"></div>
        <div class="campo"><label>Cidade</label><input name="cidade" value="${esc(c.contato?.cidade ?? "")}"></div>
      </div>
      <div class="campo"><label>UF</label><input name="uf" maxlength="2" value="${esc(c.contato?.uf ?? "")}" style="text-transform:uppercase"></div>
      <div class="campo"><label>Resumo profissional</label><textarea name="curriculoTexto" rows="5" placeholder="Conte sua experiência em poucas linhas">${esc(c.curriculoTexto ?? "")}</textarea></div>
      <div class="campo"><label>Competências e cursos</label><input name="competencias" value="${esc(competencias)}" placeholder="Ex.: NR-11, Empilhadeira, Excel">
        <p class="dica">Separe por vírgula. Elas ajudam a encontrar as vagas certas para você.</p></div>
      <div class="campo"><label>Pretensão salarial (R$)</label><input name="pretensao" type="number" min="0" step="1" value="${c.pretensaoSalarial ? c.pretensaoSalarial / 100 : ""}"></div>
    </form>
    <footer class="painel-rodape">
      <button class="botao botao-secundario" data-fechar type="button">Cancelar</button>
      <button class="botao botao-primario" type="submit" form="form-curriculo">Salvar currículo</button>
    </footer>`);
}

// ------------------------------------------------------------------ colaborador

const SERVICOS_COLABORADOR = [
  ["holerites", "Holerites", "folha", "Veja e baixe seus contracheques do mês e dos meses anteriores."],
  ["ponto", "Registrar ponto", "ponto", "Bata o ponto pelo celular, com localização, mesmo sem internet."],
  ["ferias", "Férias", "inicio", "Consulte seu período aquisitivo e peça férias."],
  ["documentos", "Meus documentos", "admissao", "Contrato, ASO, fichas de EPI e comprovantes."],
  ["informe", "Informe de rendimentos", "contabil", "Para a sua declaração do Imposto de Renda."],
  ["treinamentos", "Treinamentos", "treinamentos", "Cursos obrigatórios e certificados com validade."],
];

async function areaColaborador() {
  const d = await api("/portal/colaborador/inicio");
  return `
    <section class="portal-hero">
      <div><h1>${saudacao()}, ${esc(primeiroNome())}.</h1><p>${esc(TIPOS.COLABORADOR.chamada)}</p></div>
    </section>
    <section class="portal-secao">
      <div class="grade-servicos">${SERVICOS_COLABORADOR.map(([id, nome, ic, desc]) => `
        <article class="cartao servico">
          <span class="modulo-icone">${icone(ic)}</span>
          <div><h3>${esc(nome)}</h3><p>${esc(desc)}</p></div>
          <span class="etiqueta sem-ponto e-cinza">Em breve</span>
        </article>`).join("")}</div>
    </section>
    <section class="portal-secao">
      <h2>Meus dados</h2>
      <div class="cartao dados-pessoais">
        ${avatar(d.pessoa?.nome ?? d.nome, "avatar-lg")}
        <div><strong>${esc(d.pessoa?.nome ?? d.nome)}</strong>
          <p class="dica">${esc(sessao.usuario?.email ?? "")}${d.pessoa?.cidade ? ` · ${esc(d.pessoa.cidade)}/${esc(d.pessoa.uf ?? "")}` : ""}</p>
          <p class="dica">Para corrigir algum dado, fale com o RH. Em breve a alteração poderá ser pedida por aqui.</p></div>
      </div>
    </section>`;
}

// ------------------------------------------------------------------ tomador

const SERVICOS_TOMADOR = [
  ["verAlocados", "Trabalhadores no meu contrato", "candidatos", "Quem está alocado em cada posto, hoje."],
  ["verPresenca", "Presença de hoje", "ponto", "Quem já chegou, faltas e coberturas em andamento."],
  ["aprovarPonto", "Aprovar ponto", "ok", "Confira e aprove o espelho de ponto antes do fechamento."],
  ["aprovarMedicao", "Aprovar medição", "contabil", "Horas e postos do mês, que viram a fatura."],
  ["verMedicao", "Medições", "contabil", "Medições mensais aprovadas e pendentes."],
  ["verFaturas", "Faturas e notas fiscais", "financeiro", "Faturas, NFS-e e boletos do contrato."],
  ["verDocumentos", "Documentos de comprovação", "sst", "Folha, guias de FGTS e INSS, certidões, ASO e EPI dos seus trabalhadores."],
  ["solicitarPosto", "Solicitar posto ou reposição", "mais", "Peça novos postos ou reposição de faltas."],
];

async function areaTomador() {
  const d = await api("/portal/tomador/inicio");
  return `
    <section class="portal-hero">
      <div><h1>${saudacao()}, ${esc(primeiroNome())}.</h1>
        <p>${esc(d.tomador?.nome ?? "")} · ${d.papel ? `seu papel: <b>${esc(d.papel.nome)}</b>` : ""}</p></div>
    </section>
    <section class="portal-secao">
      <div class="grade-servicos">${SERVICOS_TOMADOR.filter(([id]) => d.acoes.includes(id)).map(([id, nome, ic, desc]) => `
        <article class="cartao servico">
          <span class="modulo-icone">${icone(ic)}</span>
          <div><h3>${esc(nome)}</h3><p>${esc(desc)}</p></div>
          <span class="etiqueta sem-ponto e-cinza">Em breve</span>
        </article>`).join("")}</div>
      <p class="dica" style="margin-top:14px">${esc(d.papel?.descricao ?? "")}. Para mudar seu acesso, fale com a empresa contratada.</p>
    </section>`;
}

// ------------------------------------------------------------------ roteamento

async function renderizar() {
  fecharPainel();
  if (!sessao.ativa) return telaEntrada();
  if (sessao.tipo === "INTERNO") {
    // Equipe da empresa não usa o portal externo.
    location.href = "../app/index.html";
    return undefined;
  }
  if (sessao.usuario?.trocarSenha) {
    document.getElementById("portal").hidden = true;
    return telaTrocarSenhaObrigatoria({ aoConcluir: renderizar });
  }
  moldura('<div class="carregando"><span class="spinner"></span>Carregando…</div>');
  try {
    const telas = { CANDIDATO: areaCandidato, COLABORADOR: areaColaborador, TOMADOR: areaTomador };
    moldura(await telas[sessao.tipo]());
  } catch (erro) {
    if (!sessao.ativa) return undefined;
    moldura(`<div class="cartao vazio"><strong>Não foi possível carregar.</strong><p class="dica">${esc(erro.message)}</p></div>`);
  }
  return undefined;
}

// ------------------------------------------------------------------ eventos

document.addEventListener("click", async (e) => {
  if (e.target.closest("[data-fechar]")) return fecharPainel();
  if (e.target.closest("[data-curriculo]")) return painelCurriculo();
  const candidatar = e.target.closest("[data-candidatar]");
  if (candidatar) return painelCandidatar(candidatar.dataset.candidatar);
  const desistir = e.target.closest("[data-desistir]");
  if (desistir) {
    if (!confirm("Tem certeza de que quer desistir desta vaga?")) return undefined;
    try {
      await api(`/portal/candidato/candidaturas/${desistir.dataset.desistir}/desistir`, { metodo: "POST", corpo: {} });
      aviso("Tudo certo. Registramos sua desistência.");
      renderizar();
    } catch (err) {
      aviso(err.message, "erro");
    }
  }
  return undefined;
});

document.addEventListener("submit", async (e) => {
  const form = e.target;
  if (form.id === "form-candidatar") {
    e.preventDefault();
    const respostas = [...new FormData(form)].filter(([k, v]) => k.startsWith("resp.") && v !== "")
      .map(([k, v]) => ({ perguntaId: k.slice(5), valor: v }));
    try {
      await api("/portal/candidato/candidaturas", { metodo: "POST", corpo: { vagaSlug: form.dataset.slug, respostas } });
      fecharPainel();
      aviso("Candidatura enviada! Acompanhe por aqui.");
      renderizar();
    } catch (err) {
      aviso(err.message, "erro");
    }
  }
  if (form.id === "form-curriculo") {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    const competencias = String(d.competencias ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50)
      .map((nome) => (cacheCandidato.candidato?.competencias ?? []).find((c) => c.nome === nome) ?? { nome, nivel: 3 });
    try {
      await api("/portal/candidato/perfil", {
        metodo: "PATCH",
        corpo: {
          curriculoTexto: d.curriculoTexto, competencias,
          pretensaoSalarial: d.pretensao ? Math.round(Number(d.pretensao) * 100) : null,
          contato: { telefone: d.telefone || null, cidade: d.cidade || null, uf: (d.uf || "").toUpperCase() || null },
        },
      });
      fecharPainel();
      aviso("Currículo atualizado.");
      renderizar();
    } catch (err) {
      aviso(err.message, "erro");
    }
  }
});

document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharPainel(); });

ligarEventosAcesso({ aoAlterar: renderizar });
sessao.aoSair((motivo) => telaEntrada({ motivo }));
renderizar();
