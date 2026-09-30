/**
 * Telas de acesso: login, troca de senha, escolha de módulo e o módulo
 * "Administração do sistema" (usuários, perfis e auditoria).
 */
import { icone } from "./icones.js";
import { api, entrar, recarregarSessao, sair, sessao } from "./sessao.js";
import { esc, avatar, aviso, abrirPainel, fecharPainel, dataHora } from "./ui.js";
import { MODULOS, NIVEIS, NIVEL, PAPEIS_TOMADOR, validarSenha } from "/packages/acesso/src/index.js";

export const ICONE_MODULO = Object.freeze({
  recrutamento: "candidatos", colaboradores: "cracha", admissao: "admissao", tomadores: "tomadores",
  ponto: "ponto", folha: "folha", sst: "sst", treinamentos: "treinamentos", comercial: "comercial",
  financeiro: "financeiro", contabil: "contabil", juridico: "juridico", estoque: "estoque", administracao: "cadeado",
});

const COR_NIVEL = { 0: "e-cinza", 1: "e-azul", 2: "e-verde", 3: "e-ambar", 4: "e-marca" };
const chipNivel = (valor) => {
  const n = NIVEIS.find((x) => x.valor === valor) ?? NIVEIS[0];
  return `<span class="etiqueta sem-ponto ${COR_NIVEL[n.valor]}">${esc(n.nome)}</span>`;
};

const telaCheia = () => document.getElementById("tela-cheia");
function mostrarTelaCheia(html) {
  document.body.classList.add("modo-tela-cheia");
  telaCheia().innerHTML = html;
  telaCheia().hidden = false;
}
export function esconderTelaCheia() {
  document.body.classList.remove("modo-tela-cheia");
  telaCheia().hidden = true;
  telaCheia().innerHTML = "";
}

const MARCA = `
  <span class="marca-logo" aria-hidden="true"><svg viewBox="0 0 32 32"><defs><linearGradient id="lgx" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a3d"/><stop offset="1" stop-color="#ffb547"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#lgx)"/><path d="M10 8v16h12" fill="none" stroke="#1b1446" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="21" cy="11" r="3" fill="#1b1446"/></svg></span>`;

const PALAVRAS = ["Sol", "Rio", "Mar", "Luz", "Pedra", "Folha", "Vento", "Serra", "Lago", "Ponte", "Campo", "Trigo", "Cedro", "Ilha", "Brisa", "Aurora", "Farol", "Jardim"];
export function gerarSenha() {
  const n = new Uint32Array(4);
  crypto.getRandomValues(n);
  const p = [0, 1, 2].map((i) => PALAVRAS[n[i] % PALAVRAS.length]);
  return `${p.join("-")}-${10 + (n[3] % 90)}`;
}

// ------------------------------------------------------------------ login

export function telaLogin({ motivo = null, aoEntrar } = {}) {
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  mostrarTelaCheia(`
    <div class="login">
      <section class="login-marca">
        <div class="login-marca-topo">${MARCA}<span><strong>Labutar</strong><small>Pessoas &amp; Mão de Obra</small></span></div>
        <div class="login-marca-texto">
          <h1>Toda a sua operação de mão de obra em um só lugar.</h1>
          <p>Recrutamento, admissão, ponto, folha, tomadores e faturamento — com cada pessoa vendo só o que precisa.</p>
          <ul>
            <li>${icone("ok")}Temporários, terceirizados e próprios no mesmo cadastro</li>
            <li>${icone("ok")}Custo de cada dia direto na fatura do tomador certo</li>
            <li>${icone("ok")}Acesso por módulo e por perfil, com auditoria</li>
          </ul>
        </div>
        <small class="login-rodape">Seus dados protegidos: senha com hash forte, sessão com validade e registro de acessos.</small>
      </section>
      <section class="login-form-area">
        <form class="login-form" id="form-login" autocomplete="on">
          <h2>Entrar</h2>
          <p class="dica">Use o e-mail e a senha que o administrador da sua empresa cadastrou.</p>
          ${motivo ? `<div class="alerta">${icone("relogio")}<span>${esc(motivo)}</span></div>` : ""}
          <div class="alerta erro" id="login-erro" hidden></div>
          <div class="campo"><label for="l-empresa">Empresa</label>
            <input id="l-empresa" name="empresa" required autocomplete="organization" value="${esc(localStorage.getItem("labutar.empresa") ?? (local ? "demo-industrial" : ""))}" placeholder="identificador da empresa"></div>
          <div class="campo"><label for="l-email">E-mail</label>
            <input id="l-email" name="email" type="email" required autocomplete="username" placeholder="voce@empresa.com.br"></div>
          <div class="campo"><label for="l-senha">Senha</label>
            <div class="campo-senha"><input id="l-senha" name="senha" type="password" required autocomplete="current-password">
            <button type="button" class="botao-fantasma botao-sm" data-mostrar-senha="l-senha">Mostrar</button></div></div>
          <button class="botao botao-primario botao-largo" type="submit" id="botao-entrar">Entrar</button>
          ${local ? `<details class="contas-demo"><summary>Contas de demonstração</summary>
            <p>Senha de todas: <code>Acesso Demo 2026!</code></p>
            <div class="contas-demo-lista">
              ${[["admin@demo.com.br", "Administrador geral"], ["rh@demo.com.br", "Gerente de RH"], ["recrutadora@demo.com.br", "Recrutadora"], ["dp@demo.com.br", "Analista de DP"], ["supervisor@demo.com.br", "Supervisora"], ["comercial@demo.com.br", "Comercial"], ["financeiro@demo.com.br", "Financeiro"]]
                .map(([e, n]) => `<button type="button" class="chip" data-conta-demo="${e}">${n}</button>`).join("")}
            </div></details>` : ""}
        </form>
      </section>
    </div>`);

  const form = document.getElementById("form-login");
  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const dados = Object.fromEntries(new FormData(form));
    const botao = document.getElementById("botao-entrar");
    const erro = document.getElementById("login-erro");
    botao.disabled = true;
    botao.textContent = "Entrando…";
    erro.hidden = true;
    try {
      await entrar({ empresa: dados.empresa.trim().toLowerCase(), email: dados.email, senha: dados.senha });
      try { localStorage.setItem("labutar.empresa", dados.empresa.trim().toLowerCase()); } catch { /* sem storage */ }
      aoEntrar?.();
    } catch (e) {
      erro.innerHTML = `${icone("fechar")}<span>${esc(e.message)}</span>`;
      erro.hidden = false;
      botao.disabled = false;
      botao.textContent = "Entrar";
      document.getElementById("l-senha").select();
    }
  });
  form.addEventListener("click", (evento) => {
    const demo = evento.target.closest("[data-conta-demo]");
    if (demo) {
      form.email.value = demo.dataset.contaDemo;
      form.senha.value = "Acesso Demo 2026!";
      form.requestSubmit();
    }
  });
  (form.email.value ? form.senha : form.empresa.value ? form.email : form.empresa).focus();
}

// ------------------------------------------------------------------ troca de senha

function formularioSenha({ exigirAtual = true, id = "form-senha" } = {}) {
  return `
    <form class="formulario" id="${id}">
      ${exigirAtual ? `<div class="campo"><label for="s-atual">Senha atual</label><input id="s-atual" name="senhaAtual" type="password" required autocomplete="current-password"></div>` : ""}
      <div class="campo"><label for="s-nova">Nova senha</label><input id="s-nova" name="novaSenha" type="password" required minlength="10" autocomplete="new-password"></div>
      <div class="campo"><label for="s-confirma">Repita a nova senha</label><input id="s-confirma" name="confirma" type="password" required autocomplete="new-password"></div>
      <p class="dica">Mínimo de 10 caracteres. Frases funcionam bem, como "Café forte às 7 da manhã". Não use seu nome ou e-mail.</p>
      <div class="alerta erro" id="${id}-erro" hidden></div>
    </form>`;
}

async function enviarTrocaSenha(form) {
  const dados = Object.fromEntries(new FormData(form));
  const erro = document.getElementById(`${form.id}-erro`);
  const falhar = (msg) => { erro.innerHTML = `${icone("fechar")}<span>${esc(msg)}</span>`; erro.hidden = false; };
  if (dados.novaSenha !== dados.confirma) return falhar("as duas senhas novas não são iguais"), false;
  const politica = validarSenha(dados.novaSenha, { email: sessao.usuario?.email, nome: sessao.usuario?.nome, empresa: sessao.empresa });
  if (!politica.ok) return falhar(politica.erros[0]), false;
  try {
    await api("/auth/senha", { metodo: "POST", corpo: { senhaAtual: dados.senhaAtual, novaSenha: dados.novaSenha } });
    await recarregarSessao();
    return true;
  } catch (e) {
    falhar(e.message);
    return false;
  }
}

export function telaTrocarSenhaObrigatoria({ aoConcluir } = {}) {
  mostrarTelaCheia(`
    <div class="centro-tela">
      <div class="cartao cartao-foco">
        <div class="cartao-foco-topo">${MARCA}<div><h2>Crie sua senha</h2><p class="dica">Olá, ${esc(sessao.usuario?.nome ?? "")}. Por segurança, troque a senha provisória antes de continuar.</p></div></div>
        ${formularioSenha({ id: "form-senha-inicial" })}
        <div class="acoes-direita">
          <button class="botao botao-secundario" type="button" data-sair>Sair</button>
          <button class="botao botao-primario" type="submit" form="form-senha-inicial">${icone("cadeado")}Salvar e continuar</button>
        </div>
      </div>
    </div>`);
  document.getElementById("form-senha-inicial").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (await enviarTrocaSenha(evento.target)) {
      aviso("Senha criada. Bem-vindo(a)!");
      aoConcluir?.();
    }
  });
}

export function painelMinhaConta() {
  const u = sessao.usuario;
  abrirPainel(`
    <header class="painel-cabecalho">
      ${avatar(u?.nome, "avatar-lg")}
      <div class="texto"><h2>${esc(u?.nome)}</h2><p>${esc(u?.email)}</p>
        <div class="meta" style="margin-top:8px"><span>${icone("cadeado")}${esc(sessao.perfil?.nome ?? "")}</span></div></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <div class="painel-corpo">
      <div class="secao"><h4>Trocar minha senha</h4>${formularioSenha({ id: "form-minha-senha" })}</div>
    </div>
    <footer class="painel-rodape">
      <button class="botao botao-secundario" data-fechar type="button">Cancelar</button>
      <button class="botao botao-primario" type="submit" form="form-minha-senha">Salvar nova senha</button>
    </footer>`);
  document.getElementById("form-minha-senha").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (await enviarTrocaSenha(evento.target)) {
      fecharPainel();
      aviso("Senha alterada.");
    }
  });
}

// ------------------------------------------------------------------ escolha de módulo

export function telaModulos() {
  const u = sessao.usuario;
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const grupos = [...new Set(MODULOS.map((m) => m.grupo))];
  const liberados = sessao.modulos.filter((m) => m.liberado).length;

  mostrarTelaCheia(`
    <div class="seletor-modulos">
      <header class="seletor-topo">
        <div class="seletor-marca">${MARCA}<span><strong>Labutar</strong><small>${esc(sessao.empresa ?? "")}</small></span></div>
        <div class="seletor-usuario">
          <button class="usuario usuario-botao" type="button" data-minha-conta>
            ${avatar(u?.nome, "avatar-sm")}
            <span class="usuario-texto"><strong>${esc(u?.nome)}</strong><small>${esc(sessao.perfil?.nome ?? "")}</small></span>
          </button>
          <button class="botao botao-secundario botao-sm" type="button" data-sair>${icone("sair")}Sair</button>
        </div>
      </header>
      <section class="seletor-hero">
        <h1>${saudacao}, ${esc(String(u?.nome ?? "").split(" ")[0])}.</h1>
        <p>Escolha o módulo que você quer acessar. ${sessao.perfil?.acessoTotal
          ? "Seu perfil tem <b>acesso total e irrestrito</b> a todos os módulos."
          : `Seu perfil, <b>${esc(sessao.perfil?.nome ?? "")}</b>, libera ${liberados} de ${MODULOS.length} módulos.`}</p>
      </section>
      ${grupos.map((g) => `
        <section class="seletor-grupo">
          <h2>${esc(g)}</h2>
          <div class="grade-modulos">
            ${sessao.modulos.filter((m) => m.grupo === g).map((m) => m.liberado ? `
              <a class="cartao modulo-cartao" href="#/${m.id}">
                <span class="modulo-icone">${icone(ICONE_MODULO[m.id] ?? "vagas")}</span>
                <span class="modulo-texto"><strong>${esc(m.nome)}</strong><small>${esc(m.descricao)}</small></span>
                ${chipNivel(m.nivel)}
              </a>` : `
              <div class="cartao modulo-cartao bloqueado" title="Sem acesso. Solicite ao administrador da sua empresa.">
                <span class="modulo-icone">${icone("cadeado")}</span>
                <span class="modulo-texto"><strong>${esc(m.nome)}</strong><small>Sem acesso — solicite ao administrador</small></span>
              </div>`).join("")}
          </div>
        </section>`).join("")}
    </div>`);
}

// ------------------------------------------------------------------ administração

const NOME_EVENTO = {
  LOGIN_OK: ["Entrou no sistema", "e-verde"],
  LOGIN_FALHA: ["Tentativa de login recusada", "e-vermelho"],
  LOGIN_BLOQUEADO: ["Login bloqueado por tentativas", "e-vermelho"],
  LOGIN_INATIVO: ["Login de usuário desativado", "e-ambar"],
  LOGOUT: ["Saiu do sistema", "e-cinza"],
  SENHA_ALTERADA: ["Trocou a própria senha", "e-azul"],
  SENHA_REDEFINIDA: ["Redefiniu a senha de um usuário", "e-ambar"],
  USUARIO_CRIADO: ["Criou usuário", "e-marca"],
  USUARIO_ALTERADO: ["Alterou usuário", "e-marca"],
  PERFIL_CRIADO: ["Criou perfil de acesso", "e-marca"],
  PERFIL_ALTERADO: ["Alterou perfil de acesso", "e-marca"],
  CONTA_EXTERNA_CRIADA: ["Liberou acesso externo", "e-destaque"],
  CONTA_EXTERNA_ALTERADA: ["Alterou acesso externo", "e-destaque"],
};

const cacheAdmin = { usuarios: [], perfis: [] };
const nomePerfil = (id) => cacheAdmin.perfis.find((p) => p.id === id)?.nome ?? id;

export async function paginaUsuarios() {
  const [{ itens: usuarios }, { itens: perfis }] = await Promise.all([api("/usuarios"), api("/perfis")]);
  cacheAdmin.usuarios = usuarios;
  cacheAdmin.perfis = perfis;
  const podeCriar = sessao.pode("administracao", "criar");
  const podeEditar = sessao.pode("administracao", "editar");
  const ativos = usuarios.filter((u) => u.ativo).length;

  return `
    <div class="barra-filtros">
      <span class="direita" style="margin-left:0">${usuarios.length} usuários · ${ativos} ativos</span>
      ${podeCriar ? `<button class="botao botao-primario" style="margin-left:auto" data-adm="novo-usuario">${icone("mais")}Novo usuário</button>` : ""}
    </div>
    <div class="cartao tabela-cartao">
      <table class="tabela">
        <thead><tr><th>Pessoa</th><th>Perfil de acesso</th><th>Situação</th><th>Último acesso</th><th></th></tr></thead>
        <tbody>
          ${usuarios.map((u) => `
            <tr>
              <td><div class="pessoa">${avatar(u.nome, "avatar-sm")}<div><strong>${esc(u.nome)}</strong><small>${esc(u.email)}</small></div></div></td>
              <td>${u.perfilId === "ADMINISTRADOR_GERAL" ? `<span class="etiqueta sem-ponto e-destaque">${icone("estrela")}${esc(nomePerfil(u.perfilId))}</span>` : `<span class="etiqueta sem-ponto e-marca">${esc(nomePerfil(u.perfilId))}</span>`}
                ${Object.keys(u.ajustes ?? {}).length ? '<small class="dica"> + ajustes</small>' : ""}</td>
              <td>${u.ativo ? '<span class="etiqueta e-verde">Ativo</span>' : '<span class="etiqueta e-cinza">Inativo</span>'}
                ${u.bloqueadoAte && u.bloqueadoAte > new Date().toISOString() ? '<span class="etiqueta e-vermelho">Bloqueado</span>' : ""}
                ${u.trocarSenha ? '<span class="etiqueta e-ambar">Senha provisória</span>' : ""}</td>
              <td>${u.ultimoAcesso ? dataHora(u.ultimoAcesso) : '<span class="dica">nunca entrou</span>'}</td>
              <td class="acoes-linha">${podeEditar ? `
                <button class="botao botao-secundario botao-sm" data-adm="editar-usuario" data-id="${esc(u.id)}">Editar</button>
                <button class="botao botao-fantasma botao-sm" data-adm="senha-usuario" data-id="${esc(u.id)}">Redefinir senha</button>` : ""}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

export async function paginaPerfis() {
  const { itens: perfis } = await api("/perfis");
  cacheAdmin.perfis = perfis;
  const podeConfigurar = sessao.pode("administracao", "configurar");
  return `
    <div class="barra-filtros">
      <span class="direita" style="margin-left:0">Cada perfil define um nível por módulo. Perfis padrão não mudam; duplique para personalizar.</span>
      ${podeConfigurar ? `<button class="botao botao-primario" style="margin-left:auto" data-adm="novo-perfil">${icone("mais")}Novo perfil</button>` : ""}
    </div>
    <div class="legenda-niveis">${NIVEIS.map((n) => `<span>${chipNivel(n.valor)}<small>${esc(n.descricao)}</small></span>`).join("")}</div>
    <div class="grade-perfis">
      ${perfis.map((p) => `
        <article class="cartao perfil-acesso ${p.acessoTotal ? "total" : ""}">
          <header>
            <div><h3>${p.acessoTotal ? icone("estrela") : ""}${esc(p.nome)}</h3><p>${esc(p.descricao ?? "")}</p></div>
            ${p.sistema ? '<span class="etiqueta sem-ponto e-cinza">Padrão</span>' : '<span class="etiqueta sem-ponto e-marca">Personalizado</span>'}
          </header>
          ${p.acessoTotal
            ? `<div class="acesso-total">${icone("cadeado")}<div><b>Acesso total e irrestrito</b><small>Todos os módulos, todas as ações, incluindo usuários e perfis.</small></div></div>`
            : `<ul class="matriz">${MODULOS.map((m) => `<li class="${(p.niveis?.[m.id] ?? 0) === 0 ? "vazio" : ""}"><span>${esc(m.nome)}</span>${chipNivel(p.niveis?.[m.id] ?? 0)}</li>`).join("")}</ul>`}
          ${podeConfigurar && !p.acessoTotal ? `<footer>
            <button class="botao botao-secundario botao-sm" data-adm="duplicar-perfil" data-id="${esc(p.id)}">Duplicar</button>
            ${!p.sistema ? `<button class="botao botao-fantasma botao-sm" data-adm="editar-perfil" data-id="${esc(p.id)}">Editar</button>` : ""}
          </footer>` : ""}
        </article>`).join("")}
    </div>`;
}

export async function paginaAuditoria() {
  const [{ itens }, { itens: usuarios }] = await Promise.all([api("/auditoria"), api("/usuarios")]);
  const nome = (id) => usuarios.find((u) => u.id === id)?.nome ?? (id === "SEED" || id === "SISTEMA" ? "Sistema" : id ?? "—");
  return `
    <div class="barra-filtros"><span class="direita" style="margin-left:0">Últimos ${itens.length} eventos de acesso e de alteração de permissões.</span></div>
    <div class="cartao tabela-cartao">
      <table class="tabela">
        <thead><tr><th>Quando</th><th>Evento</th><th>Quem</th><th>Sobre</th><th>IP</th></tr></thead>
        <tbody>
          ${itens.map((e) => {
            const [rotulo, cor] = NOME_EVENTO[e.evento] ?? [e.evento, "e-cinza"];
            return `<tr>
              <td>${dataHora(e.em)}</td>
              <td><span class="etiqueta ${cor}">${esc(rotulo)}</span></td>
              <td>${esc(e.usuarioId ? nome(e.usuarioId) : e.email ?? "—")}</td>
              <td>${e.alvoId ? esc(nome(e.alvoId)) : ""}</td>
              <td><code>${esc(e.ip ?? "")}</code></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
}

// ------------------------------------------------------------------ acessos externos

const ABAS_EXTERNAS = [
  { tipo: "COLABORADOR", nome: "Colaboradores", modulo: "colaboradores", icone: "cracha" },
  { tipo: "TOMADOR", nome: "Tomadores", modulo: "tomadores", icone: "tomadores" },
  { tipo: "CANDIDATO", nome: "Candidatos", modulo: "recrutamento", icone: "candidatos" },
];
const cacheExternas = { tipo: null, contas: [], pessoas: [] };

export async function paginaContasExternas() {
  const abas = ABAS_EXTERNAS.filter((a) => sessao.pode(a.modulo, "ver"));
  if (!abas.length) return '<div class="cartao vazio">Seu perfil não gerencia acessos externos.</div>';
  const aba = abas.find((a) => a.tipo === cacheExternas.tipo) ?? abas[0];
  cacheExternas.tipo = aba.tipo;
  const [{ itens }, pessoas] = await Promise.all([
    api(`/contas-externas?tipo=${aba.tipo}`),
    sessao.pode("recrutamento", "ver") ? api("/candidatos?limite=200").then((d) => d.itens).catch(() => []) : Promise.resolve([]),
  ]);
  cacheExternas.contas = itens;
  cacheExternas.pessoas = pessoas;
  const nomePessoa = (id) => pessoas.find((p) => p.id === id)?.dados?.nome ?? "—";
  const vinculo = (c) => aba.tipo === "TOMADOR"
    ? `<b>${esc(c.escopo?.tomadorNome ?? c.escopo?.tomadorId)}</b><small class="dica"> · ${esc(PAPEIS_TOMADOR.find((p) => p.id === c.escopo?.papel)?.nome ?? "")}</small>`
    : esc(nomePessoa(c.escopo?.pessoaId ?? c.escopo?.candidatoId));
  const podeCriar = aba.tipo !== "CANDIDATO" && sessao.pode(aba.modulo, "criar");
  const podeEditar = sessao.pode(aba.modulo, "editar");

  return `
    <div class="barra-filtros">
      ${abas.map((a) => `<button class="filtro ${a.tipo === aba.tipo ? "ativo" : ""}" data-aba-externa="${a.tipo}">${esc(a.nome)}</button>`).join("")}
      ${podeCriar ? `<button class="botao botao-primario" style="margin-left:auto" data-adm="nova-externa">${icone("mais")}Liberar acesso</button>` : ""}
    </div>
    <p class="dica" style="margin:-6px 0 14px">${aba.tipo === "CANDIDATO"
      ? "Candidatos criam a própria conta no portal. Aqui você pode desativá-la ou redefinir a senha."
      : aba.tipo === "COLABORADOR"
        ? "O colaborador entra no portal com e-mail e senha para ver holerites, ponto, férias e documentos — só os dele."
        : "Usuários do tomador veem só o próprio contrato: colaboradores alocados, ponto, medição, faturas e documentos."}
      Link do portal: <code>${esc(location.origin)}/web/portal/index.html?empresa=${esc(sessao.empresa ?? "")}&amp;perfil=${aba.tipo.toLowerCase()}</code></p>
    <div class="cartao tabela-cartao">
      <table class="tabela">
        <thead><tr><th>Pessoa</th><th>${aba.tipo === "TOMADOR" ? "Tomador e papel" : "Cadastro vinculado"}</th><th>Situação</th><th>Último acesso</th><th></th></tr></thead>
        <tbody>
          ${itens.map((c) => `
            <tr>
              <td><div class="pessoa">${avatar(c.nome, "avatar-sm")}<div><strong>${esc(c.nome)}</strong><small>${esc(c.email)}</small></div></div></td>
              <td>${vinculo(c)}</td>
              <td>${c.ativo ? '<span class="etiqueta e-verde">Ativo</span>' : '<span class="etiqueta e-cinza">Inativo</span>'}${c.trocarSenha ? ' <span class="etiqueta e-ambar">Senha provisória</span>' : ""}</td>
              <td>${c.ultimoAcesso ? dataHora(c.ultimoAcesso) : '<span class="dica">nunca entrou</span>'}</td>
              <td class="acoes-linha">${podeEditar ? `
                <button class="botao botao-secundario botao-sm" data-adm="alternar-externa" data-id="${esc(c.id)}">${c.ativo ? "Desativar" : "Reativar"}</button>
                <button class="botao botao-fantasma botao-sm" data-adm="senha-externa" data-id="${esc(c.id)}">Redefinir senha</button>` : ""}</td>
            </tr>`).join("") || `<tr><td colspan="5" class="vazio">Nenhum acesso de ${esc(aba.nome.toLowerCase())} ainda.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function painelNovaExterna() {
  const tipo = cacheExternas.tipo;
  const colaborador = tipo === "COLABORADOR";
  abrirPainel(`
    <header class="painel-cabecalho">
      <span class="indicador-icone" style="color:var(--marca-500);background:var(--marca-100)">${icone(colaborador ? "cracha" : "tomadores")}</span>
      <div class="texto"><h2>${colaborador ? "Acesso de colaborador" : "Acesso de tomador"}</h2>
        <p>A pessoa recebe uma senha provisória e troca no primeiro acesso ao portal.</p></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <form class="painel-corpo formulario" id="form-externa" data-tipo="${tipo}">
      ${colaborador ? `
        <div class="campo"><label for="x-pessoa">Colaborador (cadastro único)</label>
          <select id="x-pessoa" name="pessoaId" required><option value="">Selecione</option>
            ${cacheExternas.pessoas.map((p) => `<option value="${esc(p.id)}" data-email="${esc(p.contato?.email ?? "")}" data-nome="${esc(p.dados?.nome ?? "")}">${esc(p.dados?.nome)}</option>`).join("")}
          </select><p class="dica">A pessoa vem do cadastro único (o mesmo do banco de talentos e da admissão).</p></div>` : `
        <div class="duas">
          <div class="campo"><label for="x-tomador">Tomador</label><input id="x-tomador" name="tomadorNome" required placeholder="Razão social do tomador"></div>
          <div class="campo"><label for="x-papel">Papel no portal</label><select id="x-papel" name="papel">${PAPEIS_TOMADOR.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join("")}</select></div>
        </div>
        <p class="dica" id="x-papel-desc"></p>`}
      <div class="campo"><label for="x-nome">Nome de quem vai acessar</label><input id="x-nome" name="nome" required minlength="3"></div>
      <div class="campo"><label for="x-email">E-mail (login)</label><input id="x-email" name="email" type="email" required></div>
      <div class="campo"><label for="x-senha">Senha provisória</label>
        <div class="campo-senha"><input id="x-senha" name="senha" required minlength="10" value="${esc(gerarSenha())}">
        <button type="button" class="botao-fantasma botao-sm" data-gerar-senha="x-senha">Gerar outra</button></div></div>
    </form>
    <footer class="painel-rodape">
      <button class="botao botao-secundario" data-fechar type="button">Cancelar</button>
      <button class="botao botao-primario" type="submit" form="form-externa">${icone("ok")}Liberar acesso</button>
    </footer>`);
  const pessoa = document.getElementById("x-pessoa");
  pessoa?.addEventListener("change", () => {
    const op = pessoa.selectedOptions[0];
    document.getElementById("x-nome").value = op?.dataset.nome ?? "";
    document.getElementById("x-email").value = op?.dataset.email ?? "";
  });
  const papel = document.getElementById("x-papel");
  const descrever = () => { if (papel) document.getElementById("x-papel-desc").textContent = PAPEIS_TOMADOR.find((p) => p.id === papel.value)?.descricao ?? ""; };
  papel?.addEventListener("change", descrever);
  descrever();
}

const slugTomador = (nome) => "TOM_" + String(nome).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

// ------------------------------------------------------------------ painéis de administração

function opcoesPerfil(selecionado) {
  const padrao = cacheAdmin.perfis.filter((p) => p.sistema);
  const proprios = cacheAdmin.perfis.filter((p) => !p.sistema);
  const op = (p) => `<option value="${esc(p.id)}" ${p.id === selecionado ? "selected" : ""}>${esc(p.nome)}</option>`;
  return `<optgroup label="Perfis padrão">${padrao.map(op).join("")}</optgroup>${proprios.length ? `<optgroup label="Perfis da empresa">${proprios.map(op).join("")}</optgroup>` : ""}`;
}

const seletorNivel = (nome, valor, { herdar = false } = {}) => `
  <select name="${nome}">
    ${herdar ? `<option value="" ${valor === undefined ? "selected" : ""}>Igual ao perfil</option>` : ""}
    ${NIVEIS.map((n) => `<option value="${n.valor}" ${valor === n.valor ? "selected" : ""}>${esc(n.nome)}</option>`).join("")}
  </select>`;

function painelUsuario(usuario = null) {
  const editando = Boolean(usuario);
  abrirPainel(`
    <header class="painel-cabecalho">
      ${editando ? avatar(usuario.nome, "avatar-lg") : `<span class="indicador-icone" style="color:var(--marca-500);background:var(--marca-100)">${icone("pessoas")}</span>`}
      <div class="texto"><h2>${editando ? esc(usuario.nome) : "Novo usuário"}</h2>
        <p>${editando ? esc(usuario.email) : "A pessoa recebe uma senha provisória e troca no primeiro acesso."}</p></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <form class="painel-corpo formulario" id="form-usuario" data-id="${esc(usuario?.id ?? "")}">
      <div class="campo"><label for="u-nome">Nome completo</label><input id="u-nome" name="nome" required minlength="3" value="${esc(usuario?.nome ?? "")}"></div>
      ${editando ? "" : `<div class="campo"><label for="u-email">E-mail (login)</label><input id="u-email" name="email" type="email" required></div>`}
      <div class="campo"><label for="u-perfil">Perfil de acesso</label><select id="u-perfil" name="perfilId" required>${opcoesPerfil(usuario?.perfilId ?? "RECRUTADOR")}</select>
        <p class="dica" id="u-perfil-desc"></p></div>
      ${editando ? `<label class="interruptor"><input type="checkbox" name="ativo" ${usuario.ativo ? "checked" : ""}><span></span>Usuário ativo (pode entrar no sistema)</label>` : `
        <div class="campo"><label for="u-senha">Senha provisória</label>
          <div class="campo-senha"><input id="u-senha" name="senha" required minlength="10" value="${esc(gerarSenha())}">
          <button type="button" class="botao-fantasma botao-sm" data-gerar-senha="u-senha">Gerar outra</button></div>
          <p class="dica">Entregue à pessoa por um canal seguro. Ela será obrigada a trocar no primeiro acesso.</p></div>`}
      <details class="ajustes">
        <summary>Ajustes individuais por módulo <small>(opcional — sobrepõe o perfil só para esta pessoa)</small></summary>
        <div class="grade-ajustes">
          ${MODULOS.map((m) => `<div class="campo"><label>${esc(m.nome)}</label>${seletorNivel(`ajuste.${m.id}`, usuario?.ajustes?.[m.id], { herdar: true })}</div>`).join("")}
        </div>
      </details>
    </form>
    <footer class="painel-rodape">
      <button class="botao botao-secundario" data-fechar type="button">Cancelar</button>
      <button class="botao botao-primario" type="submit" form="form-usuario">${icone("ok")}${editando ? "Salvar alterações" : "Criar usuário"}</button>
    </footer>`);

  const select = document.getElementById("u-perfil");
  const descrever = () => {
    const p = cacheAdmin.perfis.find((x) => x.id === select.value);
    document.getElementById("u-perfil-desc").textContent = p?.descricao ?? "";
  };
  select.addEventListener("change", descrever);
  descrever();
}

function painelSenhaUsuario(usuario) {
  abrirPainel(`
    <header class="painel-cabecalho">
      ${avatar(usuario.nome, "avatar-lg")}
      <div class="texto"><h2>Redefinir senha</h2><p>${esc(usuario.nome)} · ${esc(usuario.email)}</p></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <form class="painel-corpo formulario" id="form-redefinir" data-id="${esc(usuario.id)}">
      <div class="campo"><label for="r-senha">Nova senha provisória</label>
        <div class="campo-senha"><input id="r-senha" name="novaSenha" required minlength="10" value="${esc(gerarSenha())}">
        <button type="button" class="botao-fantasma botao-sm" data-gerar-senha="r-senha">Gerar outra</button></div></div>
      <div class="alerta">${icone("cadeado")}<span>As sessões abertas dessa pessoa serão encerradas e ela terá de criar uma senha nova ao entrar.</span></div>
    </form>
    <footer class="painel-rodape">
      <button class="botao botao-secundario" data-fechar type="button">Cancelar</button>
      <button class="botao botao-primario" type="submit" form="form-redefinir">Redefinir senha</button>
    </footer>`);
}

function painelPerfil(base = null, { editar = false } = {}) {
  abrirPainel(`
    <header class="painel-cabecalho">
      <span class="indicador-icone" style="color:var(--marca-500);background:var(--marca-100)">${icone("cadeado")}</span>
      <div class="texto"><h2>${editar ? "Editar perfil" : "Novo perfil de acesso"}</h2>
        <p>${editar ? "Quem usa este perfil precisará entrar de novo para receber as permissões novas." : base ? `Baseado em “${esc(base.nome)}”.` : "Defina o nível em cada módulo."}</p></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <form class="painel-corpo formulario" id="form-perfil" data-id="${editar ? esc(base.id) : ""}">
      <div class="campo"><label for="p-nome">Nome do perfil</label><input id="p-nome" name="nome" required minlength="3" maxlength="60" value="${esc(editar ? base.nome : base ? `${base.nome} (cópia)` : "")}"></div>
      <div class="campo"><label for="p-desc">Descrição</label><input id="p-desc" name="descricao" maxlength="200" value="${esc(base?.descricao ?? "")}"></div>
      <div class="grade-ajustes">
        ${MODULOS.map((m) => `<div class="campo"><label>${esc(m.nome)}</label>${seletorNivel(`nivel.${m.id}`, base?.niveis?.[m.id] ?? NIVEL.SEM_ACESSO)}</div>`).join("")}
      </div>
      <p class="dica">Você só consegue conceder níveis até o seu próprio. Acesso total é exclusivo do Administrador geral.</p>
    </form>
    <footer class="painel-rodape">
      <button class="botao botao-secundario" data-fechar type="button">Cancelar</button>
      <button class="botao botao-primario" type="submit" form="form-perfil">${icone("ok")}Salvar perfil</button>
    </footer>`);
}

function lerNiveis(form, prefixo) {
  const niveis = {};
  for (const [chave, valor] of new FormData(form)) {
    if (chave.startsWith(prefixo) && valor !== "") niveis[chave.slice(prefixo.length)] = Number(valor);
  }
  return niveis;
}

// ------------------------------------------------------------------ eventos

export function ligarEventosAcesso({ aoAlterar, aoSair }) {
  document.addEventListener("click", async (evento) => {
    const alvo = evento.target;
    if (alvo.closest("[data-sair]")) {
      await sair();
      aoSair?.();
      return;
    }
    if (alvo.closest("[data-minha-conta]")) return painelMinhaConta();

    const mostrar = alvo.closest("[data-mostrar-senha]");
    if (mostrar) {
      const campo = document.getElementById(mostrar.dataset.mostrarSenha);
      campo.type = campo.type === "password" ? "text" : "password";
      mostrar.textContent = campo.type === "password" ? "Mostrar" : "Ocultar";
      return;
    }
    const gerar = alvo.closest("[data-gerar-senha]");
    if (gerar) {
      document.getElementById(gerar.dataset.gerarSenha).value = gerarSenha();
      return;
    }

    const abaExterna = alvo.closest("[data-aba-externa]");
    if (abaExterna) {
      cacheExternas.tipo = abaExterna.dataset.abaExterna;
      aoAlterar?.();
      return;
    }

    const acao = alvo.closest("[data-adm]");
    if (!acao) return;
    const id = acao.dataset.id;
    if (acao.dataset.adm === "nova-externa") return painelNovaExterna();
    if (acao.dataset.adm === "alternar-externa") {
      const conta = cacheExternas.contas.find((c) => c.id === id);
      try {
        await api(`/contas-externas/${id}`, { metodo: "PATCH", corpo: { ativo: !conta.ativo } });
        aviso(conta.ativo ? "Acesso desativado. A sessão da pessoa foi encerrada." : "Acesso reativado.");
        aoAlterar?.();
      } catch (e) { aviso(e.message, "erro"); }
      return;
    }
    if (acao.dataset.adm === "senha-externa") {
      const nova = gerarSenha();
      const conta = cacheExternas.contas.find((c) => c.id === id);
      if (!confirm(`Redefinir a senha de ${conta?.nome}? A nova senha provisória será: ${nova}`)) return;
      try {
        await api(`/contas-externas/${id}`, { metodo: "PATCH", corpo: { novaSenha: nova } });
        aviso(`Senha redefinida. Provisória: ${nova}`);
        aoAlterar?.();
      } catch (e) { aviso(e.message, "erro"); }
      return;
    }
    if (acao.dataset.adm === "novo-usuario") painelUsuario();
    if (acao.dataset.adm === "editar-usuario") painelUsuario(cacheAdmin.usuarios.find((u) => u.id === id));
    if (acao.dataset.adm === "senha-usuario") painelSenhaUsuario(cacheAdmin.usuarios.find((u) => u.id === id));
    if (acao.dataset.adm === "novo-perfil") painelPerfil();
    if (acao.dataset.adm === "duplicar-perfil") painelPerfil(cacheAdmin.perfis.find((p) => p.id === id));
    if (acao.dataset.adm === "editar-perfil") painelPerfil(cacheAdmin.perfis.find((p) => p.id === id), { editar: true });
  });

  document.addEventListener("submit", async (evento) => {
    const form = evento.target;
    if (!["form-usuario", "form-redefinir", "form-perfil", "form-externa"].includes(form.id)) return;
    evento.preventDefault();
    const dados = Object.fromEntries(new FormData(form));
    try {
      if (form.id === "form-usuario") {
        const ajustes = lerNiveis(form, "ajuste.");
        if (form.dataset.id) {
          await api(`/usuarios/${form.dataset.id}`, { metodo: "PATCH", corpo: { nome: dados.nome, perfilId: dados.perfilId, ativo: form.ativo.checked, ajustes } });
          aviso("Usuário atualizado. Se o acesso mudou, a pessoa precisará entrar de novo.");
        } else {
          await api("/usuarios", { metodo: "POST", corpo: { nome: dados.nome, email: dados.email, perfilId: dados.perfilId, senha: dados.senha, ajustes } });
          aviso(`Usuário criado. Senha provisória: ${dados.senha}`);
        }
      }
      if (form.id === "form-externa") {
        const tipo = form.dataset.tipo;
        const escopo = tipo === "COLABORADOR"
          ? { pessoaId: dados.pessoaId }
          : { tomadorId: slugTomador(dados.tomadorNome), tomadorNome: dados.tomadorNome.trim(), papel: dados.papel };
        await api("/contas-externas", { metodo: "POST", corpo: { tipo, nome: dados.nome, email: dados.email, senha: dados.senha, escopo } });
        aviso(`Acesso liberado. Senha provisória: ${dados.senha}`);
      }
      if (form.id === "form-redefinir") {
        await api(`/usuarios/${form.dataset.id}/senha`, { metodo: "POST", corpo: { novaSenha: dados.novaSenha } });
        aviso(`Senha redefinida. Provisória: ${dados.novaSenha}`);
      }
      if (form.id === "form-perfil") {
        const corpo = { nome: dados.nome, descricao: dados.descricao, niveis: lerNiveis(form, "nivel.") };
        if (form.dataset.id) await api(`/perfis/${form.dataset.id}`, { metodo: "PATCH", corpo });
        else await api("/perfis", { metodo: "POST", corpo });
        aviso("Perfil salvo.");
      }
      fecharPainel();
      aoAlterar?.();
    } catch (e) {
      aviso(e.message, "erro");
    }
  });
}
