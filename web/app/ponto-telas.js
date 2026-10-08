/**
 * Ponto eletrônico: espelhos do mês por colaborador (apurados no servidor a partir do AFD), o
 * tratamento do DP com motivo, o envio ao tomador, a aprovação e o lançamento na folha; e a
 * importação do AFD dos relógios.
 */
import { icone } from "./icones.js";
import { api, sessao } from "./sessao.js";
import { esc, matricula, data, dataHora, duracao, avatar, etiqueta, aviso, abrirPainel, fecharPainel } from "./ui.js";

const COMPETENCIAS = ["2026-09", "2026-10", "2026-08"];
const STATUS = {
  ABERTO: ["Aberto", "e-cinza"], ENVIADO: ["Com o tomador", "e-ambar"], APROVADO: ["Aprovado", "e-azul"],
  CONTESTADO: ["Contestado", "e-vermelho"], LANCADO: ["Na folha", "e-verde"],
};
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const cache = { competencia: COMPETENCIAS[0], mes: {}, busca: "", importacoes: null, ultimaImportacao: null, aberto: null, aoAlterar: null };
const competenciaTela = (c) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;
const diaSemana = (iso) => SEMANA[new Date(`${iso}T12:00:00Z`).getUTCDay()];

export function limparPonto() {
  cache.mes = {};
  cache.importacoes = null;
}

async function mes() {
  cache.mes[cache.competencia] ??= await api(`/ponto/${cache.competencia}`);
  return cache.mes[cache.competencia];
}

export async function paginaEspelhos() {
  const m = await mes();
  const r = m.resumo;
  const termo = cache.busca.trim().toLowerCase();
  const itens = m.itens.filter((i) => !termo || `${i.nome} ${i.matricula} ${i.tomador ?? ""}`.toLowerCase().includes(termo));
  const editar = sessao.pode("ponto", "editar");
  const indicadores = [
    { rotulo: "Colaboradores", valor: r.colaboradores, icone: "pessoas", cor: "var(--marca-500)", fundo: "var(--marca-100)", nota: `${r.inconsistencias} com marcação a tratar` },
    { rotulo: "Abertos", valor: r.abertos + r.contestados, icone: "relogio", cor: "var(--ambar)", fundo: "var(--ambar-bg)", nota: r.contestados ? `${r.contestados} contestado(s) pelo tomador` : "com o DP" },
    { rotulo: "Com o tomador", valor: r.enviados, icone: "tomadores", cor: "var(--azul)", fundo: "var(--azul-bg)", nota: `${r.aprovados} aprovado(s)` },
    { rotulo: "Na folha", valor: r.lancados, icone: "ok", cor: "var(--verde)", fundo: "var(--verde-bg)", nota: "lançados" },
  ];
  return `
    <div class="barra-filtros">
      <select class="filtro-texto" data-ponto-competencia aria-label="Competência">
        ${COMPETENCIAS.map((c) => `<option value="${c}" ${c === cache.competencia ? "selected" : ""}>Competência ${competenciaTela(c)}</option>`).join("")}
      </select>
      <input class="filtro-texto" type="search" placeholder="Buscar por nome, matrícula ou tomador" value="${esc(cache.busca)}" data-ponto-busca>
      ${editar ? `<button class="botao botao-secundario botao-sm" data-ponto-enviar>${icone("tomadores")}Enviar abertos ao tomador</button>` : ""}
      ${editar && sessao.pode("folha", "editar") && r.aprovados ? `<button class="botao botao-primario botao-sm" data-ponto-lancar>${icone("ok")}Lançar ${r.aprovados} aprovado(s) na folha</button>` : ""}
    </div>
    <section class="indicadores">
      ${indicadores.map((i) => `
        <div class="cartao indicador">
          <span class="indicador-icone" style="color:${i.cor};background:${i.fundo}">${icone(i.icone)}</span>
          <div><small>${i.rotulo}</small><strong>${i.valor}</strong><span class="dica">${esc(i.nota)}</span></div>
        </div>`).join("")}
    </section>
    <div class="cartao tabela-cartao">
      <table class="tabela">
        <thead><tr><th>Colaborador</th><th class="col-opcional">Tomador</th><th class="num">Trabalhado</th><th class="num">Extras</th><th class="num col-opcional">Faltas</th><th class="num col-opcional">Banco de horas</th><th>Situação</th></tr></thead>
        <tbody>
          ${itens.map((i) => `
            <tr class="linha-clicavel" data-ponto-espelho="${esc(i.matricula)}">
              <td><div class="pessoa">${avatar(i.nome, "avatar-sm")}<div><strong>${esc(i.nome)}</strong><small>${esc(matricula(i.matricula))} · ${esc(i.escala)}</small>
                ${i.pendencias.map((p) => `<small class="dica" style="display:block">${esc(p)}</small>`).join("")}
                ${i.totais.inconsistencias ? `<span class="etiqueta e-vermelho">${i.totais.inconsistencias} dia(s) a tratar</span>` : ""}</div></div></td>
              <td class="col-opcional">${esc(i.tomador ?? "Próprio")}</td>
              <td class="num">${duracao(i.totais.trabalhado)}</td>
              <td class="num">${duracao(i.totais.extras + i.totais.extras100)}</td>
              <td class="num col-opcional">${i.semMarcacoes ? "—" : i.totais.faltasDias || "—"}</td>
              <td class="num col-opcional">${i.bancoHorasAdesao ? duracao(i.saldoBanco) || "0h" : '<span class="dica">sem adesão</span>'}</td>
              <td>${etiqueta(STATUS, i.status)}</td>
            </tr>`).join("") || '<tr><td colspan="7" class="vazio">Nenhum colaborador.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

async function painelEspelho(mat) {
  const e = await api(`/ponto/${cache.competencia}/${encodeURIComponent(mat)}`);
  cache.aberto = mat;
  const editavel = (e.status === "ABERTO" || e.status === "CONTESTADO") && sessao.pode("ponto", "editar");
  const t = e.totais;
  const obs = (d) => [
    d.foraDoContrato ? "fora do contrato ou férias" : "",
    d.falta ? "falta" : "", d.abonado ? "abonado" : "", d.descanso && d.trabalhado ? "descanso trabalhado (100%)" : "",
    d.intervaloSuprimido ? `intervalo ${duracao(d.intervaloSuprimido)} a menos` : "",
    ...d.inconsistencias, d.ajuste ? `ajustado: ${d.ajuste.motivo}` : "",
  ].filter(Boolean).join(" · ");
  abrirPainel(`
    <header class="painel-cabecalho">
      ${avatar(e.nome, "avatar-lg")}
      <div class="texto"><h2>${esc(e.nome)}</h2>
        <p>${esc(matricula(e.matricula))} · ${esc(e.tomador ?? "Próprio")} · ${esc(e.escala)} · espelho de ${competenciaTela(cache.competencia)}</p>
        <div class="meta" style="margin-top:8px">${etiqueta(STATUS, e.status)}${e.instrumento ? `<span>${icone("juridico")}${esc(e.instrumento)}</span>` : ""}</div></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <div class="painel-corpo">
      ${e.contestacao && e.status === "CONTESTADO" ? `<div class="secao alerta-folha">${icone("cadeado")}<div><strong>Contestado por ${esc(e.contestacao.nome)}</strong><p>${esc(e.contestacao.motivo)}</p></div></div>` : ""}
      <div class="secao"><div class="bases">
        <div><small>Previsto</small><strong>${duracao(t.previsto)}</strong></div>
        <div><small>Trabalhado</small><strong>${duracao(t.trabalhado)}</strong></div>
        <div><small>Extras (50% / 100%)</small><strong>${duracao(t.extras)} / ${duracao(t.extras100)}</strong></div>
        <div><small>Atrasos e saídas</small><strong>${duracao(t.debito)}</strong></div>
        <div><small>Faltas</small><strong>${t.faltasDias || "—"}</strong><span class="dica">${t.dsrPerdidos ? `${t.dsrPerdidos} DSR perdido(s)` : ""}</span></div>
        <div><small>Adicional noturno</small><strong>${t.noturnoHoras ? `${t.noturnoHoras} h` : "—"}</strong></div>
      </div></div>
      <div class="secao"><h4>Banco de horas</h4>
        <p class="dica">${e.bancoHorasAdesao
          ? `${duracao(e.banco.pagas50 - e.banco.vencido)} pagas no mês (até 20 h, cláusula 19ª) · ${duracao(e.banco.creditado)} para o banco · ${duracao(e.banco.compensado)} compensadas · ${duracao(e.banco.vencido)} vencidas e pagas · saldo ${duracao(e.banco.saldo) || "0h"}`
          : "Sem adesão escrita ao banco de horas: extras pagas e atrasos descontados no mês."}</p>
        <p class="dica">Vai para a folha: ${Object.entries(e.lancamentos).map(([k, v]) => `${esc(NOME_CAMPO[k] ?? k)} ${v}`).join(" · ") || "nada"}</p>
      </div>
      <div class="secao">
        <table class="tabela tabela-compacta">
          <thead><tr><th>Dia</th><th>Marcações</th><th class="num">Trab.</th><th class="num">Saldo</th><th>Observação</th>${editavel ? "<th></th>" : ""}</tr></thead>
          <tbody>
            ${e.dias.map((d) => `
              <tr class="${d.foraDoContrato ? "linha-apagada" : ""}">
                <td>${d.data.slice(8)} <small class="dica">${diaSemana(d.data)}</small></td>
                <td><code>${esc(d.marcacoes.join(" ")) || "—"}</code></td>
                <td class="num">${duracao(d.trabalhado)}</td>
                <td class="num">${d.extra || d.extra100 ? `+${duracao(d.extra + d.extra100)}` : d.debito ? `-${duracao(d.debito)}` : "—"}</td>
                <td class="dica">${esc(obs(d))}</td>
                ${editavel && !d.foraDoContrato ? `<td><button class="botao botao-fantasma botao-sm" data-ponto-ajustar="${d.data}" data-horas="${esc(d.marcacoes.join(" "))}">Ajustar</button></td>` : editavel ? "<td></td>" : ""}
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <form class="secao formulario" id="form-ponto-ajuste" hidden>
        <h4>Ajuste do dia <span data-ajuste-dia></span></h4>
        <p class="dica">A marcação original do relógio fica guardada; o espelho mostra o ajuste e o motivo.</p>
        <input type="hidden" name="data">
        <div class="campo"><label for="pa-horas">Marcações (HH:MM separadas por espaço)</label><input id="pa-horas" name="horas" placeholder="08:00 12:00 13:00 17:48"></div>
        <label class="opcao-marcar"><input type="checkbox" name="abonado"> Abonar o dia (atestado, declaração)</label>
        <div class="campo"><label for="pa-motivo">Motivo</label><input id="pa-motivo" name="motivo" required minlength="5"></div>
        <div class="acoes-linha"><button class="botao botao-primario" type="submit">Salvar ajuste</button><button class="botao botao-secundario" type="button" data-ponto-ajuste-cancelar>Cancelar</button></div>
      </form>
      ${e.historico.length ? `<div class="secao"><h4>Histórico</h4>${e.historico.map((h) => `<p class="dica">${esc(STATUS[h.para]?.[0] ?? h.para)} · ${dataHora(h.em)}${h.por ? ` · ${esc(h.por)}` : ""}${h.motivo ? ` · "${esc(h.motivo)}"` : ""}</p>`).join("")}</div>` : ""}
    </div>
    <footer class="painel-rodape">
      <button class="botao botao-secundario" data-fechar type="button">Fechar</button>
      ${e.status === "ENVIADO" && sessao.pode("ponto", "aprovar") ? `<button class="botao botao-primario" data-ponto-aprovar="${esc(e.matricula)}" ${e.tomadorId ? "data-motivo" : ""}>${e.tomadorId ? "Aprovar no lugar do tomador" : "Aprovar"}</button>` : ""}
    </footer>`);
}

const NOME_CAMPO = {
  horasExtras50: "horas extras 50%", horasExtras100: "horas extras 100%", horasNoturnas: "horas noturnas", faltasDias: "faltas (dias)",
  dsrPerdidos: "DSR perdidos", atrasosHoras: "atrasos (h)", intervaloSuprimidoHoras: "intervalo suprimido (h)",
};

// ---------------------------------------------------------------- importação do AFD

export async function paginaImportarAFD() {
  cache.importacoes ??= await api("/ponto/importacoes");
  const u = cache.ultimaImportacao;
  return `
    <div class="cartao">
      <div class="cartao-cabecalho"><div><h3>Importar AFD</h3><p class="dica">Arquivo Fonte de Dados do relógio (Portaria MTP 671/2021 ou leiaute anterior). Marcação já importada não se repete.</p></div></div>
      <div class="cartao-corpo formulario">
        ${sessao.pode("ponto", "criar") ? `<label class="botao botao-primario" style="align-self:flex-start">${icone("ponto")}Escolher arquivo AFD<input type="file" hidden data-ponto-afd accept=".txt,.afd,text/plain"></label>` : '<p class="dica">Seu perfil não permite importar.</p>'}
        ${u ? `<div class="bases">
          <div><small>Lidas</small><strong>${u.lidas}</strong></div>
          <div><small>Novas</small><strong>${u.novas}</strong></div>
          <div><small>Já importadas</small><strong>${u.duplicadas}</strong></div>
          <div><small>CPF fora do cadastro</small><strong>${u.naoIdentificadas}</strong></div>
        </div>${u.erros.length ? `<p class="dica">${u.erros.length} linha(s) ignorada(s): ${esc(u.erros.slice(0, 3).map((x) => `linha ${x.linha} (${x.motivo})`).join("; "))}</p>` : ""}` : ""}
      </div>
    </div>
    <div class="cartao tabela-cartao" style="margin-top:16px">
      <table class="tabela">
        <thead><tr><th>Arquivo</th><th class="col-opcional">Importado em</th><th class="num">Novas</th><th class="num col-opcional">Repetidas</th><th>Meses</th></tr></thead>
        <tbody>
          ${cache.importacoes.map((x) => `
            <tr><td><strong>${esc(x.nome)}</strong><small class="dica" style="display:block">Leiaute ${esc(x.formato ?? "—")}</small></td>
              <td class="col-opcional">${dataHora(x.em)}</td><td class="num">${x.novas}</td><td class="num col-opcional">${x.duplicadas}</td>
              <td>${x.competencias.map(competenciaTela).join(", ")}</td></tr>`).join("") || '<tr><td colspan="5" class="vazio">Nenhum arquivo importado.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

// ---------------------------------------------------------------- eventos

async function recarregar() {
  cache.mes = {};
  await cache.aoAlterar?.();
}

export function ligarEventosPonto({ aoAlterar }) {
  cache.aoAlterar = aoAlterar;
  document.addEventListener("click", async (evento) => {
    const linha = evento.target.closest("[data-ponto-espelho]");
    if (linha) { painelEspelho(linha.dataset.pontoEspelho).catch((e) => aviso(e.message, "erro")); return; }
    const ajustar = evento.target.closest("[data-ponto-ajustar]");
    if (ajustar) {
      const form = document.getElementById("form-ponto-ajuste");
      form.hidden = false;
      form.data.value = ajustar.dataset.pontoAjustar;
      form.horas.value = ajustar.dataset.horas;
      form.querySelector("[data-ajuste-dia]").textContent = data(ajustar.dataset.pontoAjustar);
      form.scrollIntoView({ behavior: "smooth", block: "center" });
      form.motivo.focus();
      return;
    }
    if (evento.target.closest("[data-ponto-ajuste-cancelar]")) { document.getElementById("form-ponto-ajuste").hidden = true; return; }
    try {
      if (evento.target.closest("[data-ponto-enviar]")) {
        const r = await api(`/ponto/${cache.competencia}/enviar`, { metodo: "POST", corpo: {} });
        aviso(`${r.enviados} espelho(s) enviados ao tomador.${r.bloqueados.length ? ` ${r.bloqueados.length} com pendência: ${r.bloqueados.slice(0, 2).map((b) => `${b.nome} (${b.motivo})`).join("; ")}.` : ""}`, r.bloqueados.length ? "erro" : "ok");
        await recarregar();
        return;
      }
      if (evento.target.closest("[data-ponto-lancar]")) {
        const r = await api(`/ponto/${cache.competencia}/lancar`, { metodo: "POST" });
        aviso(`${r.lancados} espelho(s) lançados na folha de ${competenciaTela(cache.competencia)}.`);
        await recarregar();
        return;
      }
      const aprovar = evento.target.closest("[data-ponto-aprovar]");
      if (aprovar) {
        const corpo = {};
        if (aprovar.hasAttribute("data-motivo")) {
          const motivo = prompt("Por que aprovar no lugar do tomador? (pelo menos 10 caracteres)");
          if (!motivo) return;
          corpo.motivo = motivo;
        }
        await api(`/ponto/${cache.competencia}/${encodeURIComponent(aprovar.dataset.pontoAprovar)}/aprovar`, { metodo: "POST", corpo });
        aviso("Espelho aprovado.");
        fecharPainel();
        await recarregar();
      }
    } catch (erro) { aviso(erro.message, "erro"); }
  });
  document.addEventListener("submit", async (evento) => {
    if (evento.target.id !== "form-ponto-ajuste") return;
    evento.preventDefault();
    const f = evento.target;
    const horas = f.horas.value.trim() ? f.horas.value.trim().split(/\s+/) : null;
    try {
      await api(`/ponto/${cache.competencia}/${encodeURIComponent(cache.aberto)}/ajustes/${f.data.value}`, { metodo: "PUT", corpo: { horas, abonado: f.abonado.checked, motivo: f.motivo.value } });
      aviso("Ajuste salvo.");
      cache.mes = {};
      // A página é redesenhada (fecha o painel); depois o espelho abre de novo, já ajustado.
      await cache.aoAlterar?.();
      await painelEspelho(cache.aberto);
    } catch (erro) { aviso(erro.message, "erro"); }
  });
  document.addEventListener("change", async (evento) => {
    const alvo = evento.target;
    if (alvo.matches("[data-ponto-competencia]")) { cache.competencia = alvo.value; await aoAlterar?.(); return; }
    if (alvo.matches("[data-ponto-afd]") && alvo.files?.[0]) {
      try {
        const arquivo = alvo.files[0];
        cache.ultimaImportacao = await api("/ponto/afd", { metodo: "POST", corpo: { nome: arquivo.name, conteudo: await arquivo.text() } });
        aviso(`${cache.ultimaImportacao.novas} marcação(ões) nova(s).`);
        cache.importacoes = null;
        cache.mes = {};
        await aoAlterar?.();
      } catch (erro) { aviso(erro.message, "erro"); }
    }
  });
  document.addEventListener("input", (evento) => {
    if (!evento.target.matches("[data-ponto-busca]")) return;
    cache.busca = evento.target.value;
    clearTimeout(cache.timer);
    cache.timer = setTimeout(async () => {
      await aoAlterar?.();
      const campo = document.querySelector("[data-ponto-busca]");
      if (campo) { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length); }
    }, 250);
  });
}
