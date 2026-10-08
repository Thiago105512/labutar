/**
 * Saúde e segurança: colaboradores com as pendências de EPI do posto (PGR), ficha de EPI e PPP;
 * catálogo de EPI com CA; riscos por posto; CAT.
 */
import { icone } from "./icones.js";
import { api, sessao } from "./sessao.js";
import { esc, moeda, cpf, matricula, data, dataHora, avatar, etiqueta, aviso, abrirPainel, fecharPainel } from "./ui.js";

const cache = { painel: null, aberto: null, aoAlterar: null };

export function limparSST() {
  cache.painel = null;
}

async function painel() {
  cache.painel ??= await api("/sst/painel");
  return cache.painel;
}

const situacaoCA = (s) => (s.valido ? `<span class="etiqueta e-verde">válido${s.venceEmDias < 60 ? ` · vence em ${s.venceEmDias} dias` : ""}</span>` : `<span class="etiqueta e-vermelho">${esc(s.motivo)}</span>`);

export async function paginaSSTColaboradores() {
  const p = await painel();
  const comPendencia = p.colaboradores.filter((c) => c.pendencias.length).length;
  return `
    <div class="barra-filtros"><span class="dica">${p.colaboradores.length} colaboradores alocados · ${comPendencia} com EPI pendente pelo PGR do posto</span></div>
    <div class="cartao tabela-cartao">
      <table class="tabela">
        <thead><tr><th>Colaborador</th><th class="col-opcional">Posto</th><th>Riscos</th><th>EPI</th></tr></thead>
        <tbody>
          ${p.colaboradores.map((c) => `
            <tr class="linha-clicavel" data-sst-colaborador="${esc(c.matricula)}">
              <td><div class="pessoa">${avatar(c.nome, "avatar-sm")}<div><strong>${esc(c.nome)}</strong><small>${esc(matricula(c.matricula))} · ${esc(c.cargo ?? "")}</small></div></div></td>
              <td class="col-opcional">${esc(c.tomador ?? "Próprio")}</td>
              <td>${c.riscos.length ? c.riscos.map((r) => `<span class="etiqueta e-cinza">${esc(p.tiposRisco[r.tipo] ?? r.tipo)}: ${esc(r.agente)}</span>`).join(" ") : '<span class="dica">sem risco no PGR</span>'}</td>
              <td>${c.pendencias.length ? c.pendencias.map((x) => `<span class="etiqueta e-vermelho">${esc(x.nome)}: ${esc(x.motivo)}</span>`).join(" ") : c.exigidos.length ? '<span class="etiqueta e-verde">em dia</span>' : '<span class="dica">—</span>'}</td>
            </tr>`).join("") || '<tr><td colspan="4" class="vazio">Nenhum colaborador alocado.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

async function painelColaborador(mat) {
  const [c, p] = await Promise.all([api(`/sst/colaboradores/${encodeURIComponent(mat)}`), painel()]);
  cache.aberto = mat;
  const ppp = c.ppp;
  abrirPainel(`
    <header class="painel-cabecalho">
      ${avatar(c.nome, "avatar-lg")}
      <div class="texto"><h2>${esc(c.nome)}</h2><p>${esc(matricula(c.matricula))} · ${esc(c.cargo ?? "")} · ${esc(c.tomador ?? "Próprio")}</p></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <div class="painel-corpo">
      ${c.pendencias.length ? `<div class="secao alerta-folha">${icone("cadeado")}<div><strong>EPI pendente</strong>${c.pendencias.map((x) => `<p>${esc(x.nome)}: ${esc(x.motivo)}</p>`).join("")}</div></div>` : ""}
      ${sessao.pode("sst", "criar") ? `
      <form class="secao formulario" id="form-entrega-epi">
        <h4>Entregar EPI</h4>
        <div class="duas">
          <div class="campo"><label for="ep-item">EPI</label><select id="ep-item" name="itemId">${p.epis.map((e) => `<option value="${esc(e.id)}">${esc(e.nome)}${e.ca ? ` · CA ${esc(e.ca.numero)}` : " · sem CA"}${e.situacaoCA.valido ? "" : " (CA vencido)"}</option>`).join("")}</select></div>
          <div class="campo"><label for="ep-qtd">Quantidade</label><input id="ep-qtd" name="quantidade" type="number" min="1" max="100" value="1"></div>
        </div>
        <button class="botao botao-primario" type="submit">${icone("ok")}Registrar entrega</button>
        <p class="dica">Só com CA válido (NR-6). O custo vai para o contrato e o colaborador confirma o recebimento no portal.</p>
      </form>` : ""}
      <div class="secao"><h4>Ficha de EPI</h4>
        ${c.entregas.map((e) => `<p>${data(e.data)} · ${esc(e.nome)} × ${e.quantidade} · CA ${esc(e.ca?.numero ?? "—")} ${e.confirmadaEm ? `<span class="etiqueta e-verde">recebido em ${dataHora(e.confirmadaEm)}</span>` : '<span class="etiqueta e-ambar">aguarda confirmação</span>'}</p>`).join("") || '<p class="dica">Nenhuma entrega.</p>'}
      </div>
      <div class="secao" id="sst-ppp">
        <div class="documento">
          <h3>${esc(ppp.titulo)}</h3>
          <div class="bases">
            <div><small>Empregador</small><strong>${esc(ppp.empregador.razaoSocial ?? "")}</strong><span class="dica">CNPJ ${esc(ppp.empregador.cnpj ?? "")}</span></div>
            <div><small>Colaborador</small><strong>${esc(ppp.colaborador.nome ?? "")}</strong><span class="dica">${ppp.colaborador.cpf ? `CPF ${esc(cpf(ppp.colaborador.cpf))}` : "CPF pendente"}</span></div>
          </div>
          ${ppp.lotacao.map((l) => `<p><strong>Desde ${data(l.desde)}${l.ate ? ` até ${data(l.ate)}` : ""}:</strong> ${esc(l.cargo ?? "")}${l.cbo ? ` (CBO ${esc(l.cbo)})` : ""} — ${esc(l.local)}</p>`).join("")}
          <p><strong>Exposição:</strong> ${ppp.exposicao.map((x) => `${esc(x.tipo)} — ${esc(x.agente)}${x.intensidade ? ` (${esc(x.intensidade)})` : ""}${x.medidas ? `; ${esc(x.medidas)}` : ""}`).join(" · ") || "sem agentes no PGR do posto"}</p>
          <p><strong>EPI:</strong> ${ppp.epis.map((x) => `${esc(x.nome)} (CA ${esc(x.ca ?? "—")}, ${data(x.data)})`).join(" · ") || "nenhum"}</p>
          <p><strong>Exames:</strong> ${ppp.exames.map((x) => `${esc(x.tipo.toLowerCase())} ${data(x.data)} (${x.resultado === "APTO" ? "apto" : "inapto"})`).join(" · ") || "nenhum registrado"}</p>
          <p><strong>CAT:</strong> ${ppp.cats.map((x) => `${data(x.data)} ${esc(x.tipo)}`).join(" · ") || "nenhuma"}</p>
          <p class="dica">${esc(ppp.observacao)}</p>
        </div>
      </div>
    </div>
    <footer class="painel-rodape">
      <button class="botao botao-secundario" data-fechar type="button">Fechar</button>
      <button class="botao botao-secundario" data-sst-imprimir type="button">${icone("folha")}Imprimir PPP</button>
    </footer>`);
}

export async function paginaSSTCatalogo() {
  const p = await painel();
  const editar = sessao.pode("sst", "editar");
  return `
    <div class="cartao tabela-cartao">
      <div class="cartao-cabecalho"><div><h3>EPI e Certificado de Aprovação</h3><p class="dica">EPI só é entregue com CA válido na data (NR-6). A vida útil define a troca.</p></div></div>
      <table class="tabela">
        <thead><tr><th>EPI</th><th>CA</th><th>Situação</th><th class="col-opcional">Troca</th><th class="num col-opcional">Custo</th>${editar ? "<th></th>" : ""}</tr></thead>
        <tbody>
          ${p.epis.map((e) => `
            <tr>
              <td><strong>${esc(e.nome)}</strong></td>
              <td>${e.ca ? `${esc(e.ca.numero)} <small class="dica">até ${data(e.ca.validade)}</small>` : "—"}</td>
              <td>${situacaoCA(e.situacaoCA)}</td>
              <td class="col-opcional">${e.vidaUtilMeses ? `${e.vidaUtilMeses} mês(es)` : "—"}</td>
              <td class="num col-opcional">${moeda(e.custoUnitario)}</td>
              ${editar ? `<td><button class="botao botao-secundario botao-sm" data-sst-ca="${esc(e.id)}" data-numero="${esc(e.ca?.numero ?? "")}" data-validade="${esc(e.ca?.validade ?? "")}">Atualizar CA</button></td>` : ""}
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <div class="cartao tabela-cartao" style="margin-top:16px">
      <div class="cartao-cabecalho"><div><h3>Riscos por posto (PGR)</h3><p class="dica">Os EPIs exigidos geram pendência para quem está alocado no posto.</p></div></div>
      <table class="tabela">
        <thead><tr><th>Posto</th><th>Riscos</th><th>EPI exigido</th></tr></thead>
        <tbody>
          ${p.postos.map((x) => `
            <tr>
              <td><strong>${esc(x.funcao)}</strong><small class="dica" style="display:block">${esc(x.tomador ?? "")}${x.insalubridadeGrau ? ` · insalubridade ${x.insalubridadeGrau}%` : ""}</small></td>
              <td>${x.riscos.map((r) => `<span class="etiqueta e-cinza">${esc(p.tiposRisco[r.tipo] ?? r.tipo)}: ${esc(r.agente)}${r.intensidade ? ` (${esc(r.intensidade)})` : ""}</span>`).join(" ") || '<span class="dica">nenhum</span>'}</td>
              <td>${x.episExigidos.map((id) => esc(p.epis.find((e) => e.id === id)?.nome ?? id)).join(", ") || "—"}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

export async function paginaSSTCat() {
  const p = await painel();
  return `
    ${sessao.pode("sst", "criar") ? `
    <form class="cartao formulario" id="form-cat" style="padding:18px">
      <h3>Registrar CAT</h3>
      <p class="dica">Comunicação até o 1º dia útil seguinte ao acidente; em caso de morte, de imediato (Lei 8.213/1991, art. 22).</p>
      <div class="duas">
        <div class="campo"><label for="cat-mat">Colaborador</label><select id="cat-mat" name="matricula">${p.colaboradores.map((c) => `<option value="${esc(c.matricula)}">${esc(c.nome)} · ${esc(matricula(c.matricula))}</option>`).join("")}</select></div>
        <div class="campo"><label for="cat-tipo">Tipo</label><select id="cat-tipo" name="tipo">${Object.entries(p.tiposCAT).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></div>
      </div>
      <div class="duas"><div class="campo"><label for="cat-data">Data</label><input id="cat-data" name="data" type="date" required></div><div class="campo"><label for="cat-hora">Hora</label><input id="cat-hora" name="hora" type="time"></div></div>
      <div class="campo"><label for="cat-desc">O que aconteceu</label><input id="cat-desc" name="descricao" required minlength="10"></div>
      <div class="duas"><div class="campo"><label for="cat-parte">Parte do corpo atingida</label><input id="cat-parte" name="parteAtingida" required></div>
        <div class="campo"><label for="cat-dias">Dias de afastamento (0 se não houve)</label><input id="cat-dias" name="diasAfastamento" type="number" min="0" value="0"></div></div>
      <button class="botao botao-primario" type="submit">Registrar CAT</button>
    </form>` : ""}
    <div class="cartao tabela-cartao" style="margin-top:16px">
      <table class="tabela">
        <thead><tr><th>Colaborador</th><th>Acidente</th><th>Prazo da CAT</th><th class="col-opcional">Afastamento</th></tr></thead>
        <tbody>
          ${p.cats.map((c) => `
            <tr><td><strong>${esc(c.nome)}</strong><small class="dica" style="display:block">${esc(matricula(c.matricula))}</small></td>
              <td>${data(c.data)}${c.hora ? ` ${esc(c.hora)}` : ""} · ${esc(p.tiposCAT[c.tipo])}<small class="dica" style="display:block">${esc(c.descricao)} · ${esc(c.parteAtingida)}</small></td>
              <td>${data(c.prazo)} ${c.foraDoPrazo ? '<span class="etiqueta e-vermelho">registrada fora do prazo</span>' : '<span class="etiqueta e-verde">no prazo</span>'}</td>
              <td class="col-opcional">${c.afastamento ? `${c.diasAfastamento} dias · retorno ${data(c.retornoPrevisto)}${c.retornoComASO ? " com ASO de retorno" : ""}` : "sem afastamento"}</td></tr>`).join("") || '<tr><td colspan="4" class="vazio">Nenhuma CAT registrada.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

export function ligarEventosSST({ aoAlterar }) {
  cache.aoAlterar = aoAlterar;
  document.addEventListener("click", async (e) => {
    const linha = e.target.closest("[data-sst-colaborador]");
    if (linha) { painelColaborador(linha.dataset.sstColaborador).catch((err) => aviso(err.message, "erro")); return; }
    if (e.target.closest("[data-sst-imprimir]")) {
      const doc = document.querySelector("#sst-ppp .documento");
      document.body.classList.add("imprimindo-documento"); doc.classList.add("documento-impressao");
      window.print();
      doc.classList.remove("documento-impressao"); document.body.classList.remove("imprimindo-documento");
      return;
    }
    const ca = e.target.closest("[data-sst-ca]");
    if (ca) {
      const numero = prompt("Número do CA:", ca.dataset.numero);
      if (!numero) return;
      const validade = prompt("Validade do CA (AAAA-MM-DD):", ca.dataset.validade);
      if (!validade) return;
      try {
        await api(`/sst/epis/${encodeURIComponent(ca.dataset.sstCa)}`, { metodo: "PATCH", corpo: { ca: { numero, validade } } });
        aviso("CA atualizado.");
        cache.painel = null;
        await aoAlterar?.();
      } catch (err) { aviso(err.message, "erro"); }
    }
  });
  document.addEventListener("submit", async (e) => {
    const f = e.target;
    if (f.id !== "form-entrega-epi" && f.id !== "form-cat") return;
    e.preventDefault();
    try {
      if (f.id === "form-entrega-epi") {
        await api("/sst/entregas", { metodo: "POST", corpo: { matricula: cache.aberto, itemId: f.itemId.value, quantidade: Number(f.quantidade.value) } });
        aviso("Entrega registrada na ficha; custo lançado no contrato.");
        cache.painel = null;
        await aoAlterar?.();
        await painelColaborador(cache.aberto);
      } else {
        const dias = Number(f.diasAfastamento.value || 0);
        const r = await api("/sst/cats", { metodo: "POST", corpo: { matricula: f.matricula.value, tipo: f.tipo.value, data: f.data.value, hora: f.hora.value || undefined, descricao: f.descricao.value, parteAtingida: f.parteAtingida.value, afastamento: dias > 0, diasAfastamento: dias || undefined } });
        aviso(`CAT registrada${r.foraDoPrazo ? " fora do prazo" : ""}; prazo era ${data(r.prazo)}.`, r.foraDoPrazo ? "erro" : "ok");
        cache.painel = null;
        fecharPainel();
        await aoAlterar?.();
      }
    } catch (err) { aviso(err.message, "erro"); }
  });
}
