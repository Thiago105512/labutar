/**
 * Admissão digital (DP) e agenda de exames da clínica do grupo. O DP acompanha as etapas que o
 * colaborador completa no portal e conclui só com ASO apto; a clínica agenda e o médico emite o
 * ASO. O RH vê do exame só a conclusão.
 */
import { icone } from "./icones.js";
import { api, sessao } from "./sessao.js";
import { esc, matricula, cpf, data, dataHora, avatar, etiqueta, aviso, abrirPainel, fecharPainel } from "./ui.js";

const STATUS_ADMISSAO = {
  PENDENTE: ["Pendente", "e-ambar"], DOCUMENTOS_OK: ["Documentos ok", "e-azul"], ASO_OK: ["Pronta para concluir", "e-verde"],
  CONCLUIDA: ["Concluída", "e-cinza"], BLOQUEADA: ["Bloqueada (ASO inapto)", "e-vermelho"], ENVIADA: ["Enviada", "e-azul"],
};
const STATUS_EXAME = { A_AGENDAR: ["A agendar", "e-ambar"], AGENDADO: ["Agendado", "e-azul"], REALIZADO: ["ASO emitido", "e-verde"], CANCELADO: ["Cancelado", "e-cinza"] };
const NOME_EXAME = { ADMISSIONAL: "Admissional", PERIODICO: "Periódico", RETORNO: "Retorno ao trabalho", MUDANCA_RISCO: "Mudança de risco", MONITORACAO_PONTUAL: "Monitoração pontual", DEMISSIONAL: "Demissional" };
const cache = { admissoes: null, exames: null, colaboradores: null, aoAlterar: null };

export function limparAdmissao() {
  cache.admissoes = null;
  cache.exames = null;
}

const etapasHtml = (etapas) => `<div class="etapas-admissao">${etapas.map((e) => `<span class="etiqueta ${e.ok ? "e-verde" : "e-cinza"}" title="${esc(e.pendencia ?? "ok")}">${e.ok ? "✓ " : ""}${esc(e.nome)}</span>`).join("")}</div>`;

export async function paginaAdmissoes() {
  cache.admissoes ??= await api("/admissoes");
  const lista = cache.admissoes;
  return `
    <div class="cartao tabela-cartao">
      <div class="cartao-cabecalho"><div><h3>Admissões</h3><p class="dica">O colaborador completa os dados e aceita o contrato no portal; a clínica emite o ASO. Sem ASO apto, a admissão não é concluída.</p></div></div>
      <table class="tabela">
        <thead><tr><th>Colaborador</th><th class="col-opcional">Início</th><th>Etapas</th><th>Situação</th></tr></thead>
        <tbody>
          ${lista.map((a) => `
            <tr class="linha-clicavel" data-admissao="${esc(a.matricula)}">
              <td><div class="pessoa">${avatar(a.nome, "avatar-sm")}<div><strong>${esc(a.nome)}</strong><small>${esc(matricula(a.matricula))} · ${esc(a.cargo ?? "")}${a.tomador ? ` · ${esc(a.tomador)}` : ""}</small></div></div></td>
              <td class="col-opcional">${data(a.admissao)}</td>
              <td>${etapasHtml(a.etapas)}</td>
              <td>${etiqueta(STATUS_ADMISSAO, a.status)}</td>
            </tr>`).join("") || '<tr><td colspan="4" class="vazio">Nenhuma admissão em andamento.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

async function painelAdmissao(mat) {
  const a = await api(`/admissoes/${encodeURIComponent(mat)}`);
  const ex = a.exame;
  abrirPainel(`
    <header class="painel-cabecalho">
      ${avatar(a.nome, "avatar-lg")}
      <div class="texto"><h2>${esc(a.nome)}</h2>
        <p>${a.cpf ? `CPF ${esc(cpf(a.cpf))}` : "CPF pendente"} · ${esc(matricula(a.matricula))} · início em ${data(a.admissao)}</p>
        <div class="meta" style="margin-top:8px">${etiqueta(STATUS_ADMISSAO, a.status)}</div></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <div class="painel-corpo">
      <div class="secao"><h4>Etapas</h4>
        ${a.etapas.map((e) => `<p>${e.ok ? icone("ok") : icone("relogio")} <strong>${esc(e.nome)}</strong>${e.ok ? "" : ` <span class="dica">· ${esc(e.pendencia)}</span>`}</p>`).join("")}
      </div>
      <div class="secao"><h4>Exame admissional</h4>
        ${ex ? `<p>${etiqueta(STATUS_EXAME, ex.status)} ${ex.agendadoPara ? `${data(ex.agendadoPara)} às ${esc(ex.hora ?? "")} · ${esc(ex.local ?? "")}` : ""}</p>
          ${ex.status === "REALIZADO" ? `<p><strong>ASO: ${ex.resultado === "APTO" ? "apto" : "inapto"}</strong> em ${data(ex.asoEm)} · ${esc(ex.medico?.nome ?? "")} (CRM ${esc(ex.medico?.crm ?? "")})</p>${ex.restricoes ? `<p class="dica">Restrições: ${esc(ex.restricoes)}</p>` : ""}` : ""}
          <p class="dica">Só a conclusão do ASO é compartilhada com o RH; o prontuário fica na clínica.</p>` : '<p class="dica">Sem exame.</p>'}
      </div>
      <div class="secao"><h4>Contrato</h4>
        ${a.contrato.aceite ? `<p>${icone("ok")} Aceito no portal em ${dataHora(a.contrato.aceite.aceitoEm)} · código <code>${esc(a.contrato.aceite.hash.slice(0, 16))}…</code></p>` : '<p class="dica">Ainda não aceito pelo colaborador.</p>'}
        <details><summary class="dica">Ver o texto</summary><pre class="texto-contrato">${esc(a.contrato.texto)}</pre></details>
      </div>
    </div>
    <footer class="painel-rodape">
      <button class="botao botao-secundario" data-fechar type="button">Fechar</button>
      ${a.podeConcluir && sessao.pode("admissao", "editar") ? `<button class="botao botao-primario" data-admissao-concluir="${esc(a.matricula)}">${icone("ok")}Concluir admissão</button>` : ""}
    </footer>`);
}

// ---------------------------------------------------------------- clínica

export async function paginaAgendaExames() {
  cache.exames ??= await api("/clinica/exames");
  const podeEditar = sessao.pode("clinica", "editar");
  const podeASO = sessao.pode("clinica", "aprovar");
  if (sessao.pode("clinica", "criar")) cache.colaboradores ??= (await api("/colaboradores").catch(() => ({ itens: [] }))).itens.filter((v) => !v.desligamento);
  return `
    ${sessao.pode("clinica", "criar") && cache.colaboradores?.length ? `
    <form class="cartao barra-filtros" id="form-novo-exame" style="padding:14px 18px">
      <select class="filtro-texto" name="matricula" aria-label="Colaborador">${cache.colaboradores.map((v) => `<option value="${esc(v.matricula)}">${esc(v.pessoa?.nome ?? v.matricula)} · ${esc(matricula(v.matricula))}</option>`).join("")}</select>
      <select class="filtro-texto" name="tipo" aria-label="Tipo de exame">${["PERIODICO", "RETORNO", "MUDANCA_RISCO", "DEMISSIONAL"].map((t) => `<option value="${t}">${NOME_EXAME[t]}</option>`).join("")}</select>
      <button class="botao botao-secundario botao-sm" type="submit">${icone("mais")}Novo exame</button>
    </form>` : ""}
    <div class="cartao tabela-cartao" style="margin-top:12px">
      <table class="tabela">
        <thead><tr><th>Colaborador</th><th>Exame</th><th>Data</th><th>Situação</th><th></th></tr></thead>
        <tbody>
          ${cache.exames.map((e) => `
            <tr>
              <td><div class="pessoa">${avatar(e.nome, "avatar-sm")}<div><strong>${esc(e.nome)}</strong><small>${esc(matricula(e.matricula))}${e.cargo ? ` · ${esc(e.cargo)}` : ""}</small></div></div></td>
              <td>${esc(NOME_EXAME[e.tipo] ?? e.tipo)}<small class="dica" style="display:block">eSocial ${esc(e.codigoESocial)}${e.limite ? ` · até ${data(e.limite)}` : ""}</small></td>
              <td>${e.agendadoPara ? `${data(e.agendadoPara)} ${esc(e.hora ?? "")}` : "—"}</td>
              <td>${etiqueta(STATUS_EXAME, e.status)}${e.status === "REALIZADO" ? ` <span class="dica">${e.resultado === "APTO" ? "apto" : "inapto"}</span>` : ""}</td>
              <td><div class="acoes-linha">
                ${podeEditar && (e.status === "A_AGENDAR" || e.status === "AGENDADO") ? `<button class="botao botao-secundario botao-sm" data-exame-agendar="${esc(e.id)}" data-limite="${esc(e.limite ?? "")}">${e.status === "AGENDADO" ? "Reagendar" : "Agendar"}</button>` : ""}
                ${podeASO && e.status === "AGENDADO" ? `<button class="botao botao-primario botao-sm" data-exame-aso="${esc(e.id)}" data-nome="${esc(e.nome)}">Emitir ASO</button>` : ""}
              </div></td>
            </tr>`).join("") || '<tr><td colspan="5" class="vazio">Nenhum exame.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function painelAgendar(id, limite) {
  abrirPainel(`
    <header class="painel-cabecalho"><span class="modulo-icone">${icone("clinica")}</span><div class="texto"><h2>Agendar exame</h2>${limite ? `<p>Admissional: antes do início (${data(limite)}).</p>` : ""}</div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button></header>
    <form class="painel-corpo formulario" id="form-agendar" data-id="${esc(id)}">
      <div class="duas"><div class="campo"><label for="ag-data">Data</label><input id="ag-data" name="data" type="date" required></div>
        <div class="campo"><label for="ag-hora">Hora</label><input id="ag-hora" name="hora" type="time" required value="08:00"></div></div>
      <div class="campo"><label for="ag-local">Local</label><input id="ag-local" name="local" value="Clínica do grupo"></div>
      <button class="botao botao-primario" type="submit">Salvar</button>
    </form>`);
}

function painelASO(id, nome) {
  abrirPainel(`
    <header class="painel-cabecalho"><span class="modulo-icone">${icone("clinica")}</span><div class="texto"><h2>ASO de ${esc(nome)}</h2><p>Só a conclusão vai para o RH e para o eSocial (S-2220).</p></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button></header>
    <form class="painel-corpo formulario" id="form-aso" data-id="${esc(id)}">
      <div class="campo"><label for="aso-resultado">Conclusão</label><select id="aso-resultado" name="resultado"><option value="APTO">Apto</option><option value="INAPTO">Inapto</option></select></div>
      <div class="campo"><label for="aso-restricoes">Restrições (escritas no ASO)</label><input id="aso-restricoes" name="restricoes"></div>
      <div class="duas"><div class="campo"><label for="aso-medico">Médico(a)</label><input id="aso-medico" name="medico" required value="${esc(sessao.usuario?.nome ?? "")}"></div>
        <div class="campo"><label for="aso-crm">CRM</label><input id="aso-crm" name="crm" required placeholder="12345/AM"></div></div>
      <button class="botao botao-primario" type="submit">Emitir ASO</button>
    </form>`);
}

export function ligarEventosAdmissao({ aoAlterar }) {
  cache.aoAlterar = aoAlterar;
  const recarregar = async () => { limparAdmissao(); fecharPainel(); await aoAlterar?.(); };
  document.addEventListener("click", async (evento) => {
    const linha = evento.target.closest("[data-admissao]");
    if (linha) { painelAdmissao(linha.dataset.admissao).catch((e) => aviso(e.message, "erro")); return; }
    const ag = evento.target.closest("[data-exame-agendar]");
    if (ag) { painelAgendar(ag.dataset.exameAgendar, ag.dataset.limite); return; }
    const aso = evento.target.closest("[data-exame-aso]");
    if (aso) { painelASO(aso.dataset.exameAso, aso.dataset.nome); return; }
    const concluir = evento.target.closest("[data-admissao-concluir]");
    if (concluir) {
      try {
        await api(`/admissoes/${encodeURIComponent(concluir.dataset.admissaoConcluir)}/concluir`, { metodo: "POST" });
        aviso("Admissão concluída.");
        await recarregar();
      } catch (erro) { aviso(erro.message, "erro"); }
    }
  });
  document.addEventListener("submit", async (evento) => {
    const f = evento.target;
    if (!["form-agendar", "form-aso", "form-novo-exame"].includes(f.id)) return;
    evento.preventDefault();
    try {
      if (f.id === "form-agendar") {
        await api(`/clinica/exames/${f.dataset.id}/agendar`, { metodo: "POST", corpo: { data: f.data.value, hora: f.hora.value, local: f.local.value } });
        aviso("Exame agendado.");
      } else if (f.id === "form-aso") {
        await api(`/clinica/exames/${f.dataset.id}/resultado`, { metodo: "POST", corpo: { resultado: f.resultado.value, restricoes: f.restricoes.value, medico: { nome: f.medico.value, crm: f.crm.value } } });
        aviso("ASO emitido. O custo do exame foi para o contrato do colaborador.");
      } else {
        await api("/clinica/exames", { metodo: "POST", corpo: { matricula: f.matricula.value, tipo: f.tipo.value } });
        aviso("Exame criado: agende a data.");
      }
      await recarregar();
    } catch (erro) { aviso(erro.message, "erro"); }
  });
}
