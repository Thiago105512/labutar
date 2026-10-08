/**
 * Financeiro: pagamento da folha fechada e das rescisões e férias aprovadas. A tela mostra quem
 * recebe e como (crédito em conta, TED ou PIX), as pendências de cadastro, gera o arquivo CNAB 240
 * para o banco e registra o retorno. O arquivo é do servidor (packages/pagamento).
 */
import { icone } from "./icones.js";
import { api, sessao } from "./sessao.js";
import { esc, moeda, matricula, data, dataHora, avatar, etiqueta, aviso } from "./ui.js";

const NOME_FORMA = { CREDITO_CONTA: ["Crédito em conta", "e-verde"], TED: ["TED", "e-azul"], PIX: ["PIX", "e-marca"] };
const NOME_ORIGEM = { FOLHA: ["Folha", "e-cinza"], RESCISAO: ["Rescisão", "e-ambar"], FERIAS: ["Férias", "e-azul"], REGISTROS: ["Rescisões e férias", "e-ambar"] };
const NOME_STATUS = {
  GERADA: ["Gerada", "e-ambar"], PAGA: ["Paga", "e-verde"], COM_REJEICOES: ["Com rejeições", "e-vermelho"],
  ENVIADO: ["Enviado", "e-ambar"], PAGO: ["Pago", "e-verde"], REJEITADO: ["Rejeitado", "e-vermelho"],
};
const cache = { origem: "FOLHA", competencia: null, data: null, preferirPix: false, previa: null, remessas: null, aoAlterar: null };
const competenciaTela = (c) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;

export function limparPagamento() {
  cache.previa = null;
  cache.remessas = null;
}

function consulta() {
  const q = new URLSearchParams({ origem: cache.origem });
  if (cache.origem === "FOLHA" && cache.competencia) q.set("competencia", cache.competencia);
  if (cache.data) q.set("data", cache.data);
  if (cache.preferirPix) q.set("preferirPix", "1");
  return q.toString();
}

/** Sempre do servidor: rescisões e férias aprovadas em outra tela entram na hora. */
async function carregar() {
  cache.remessas = await api("/pagamentos/remessas");
  if (cache.origem === "FOLHA" && !cache.competencia) {
    // Sem competência escolhida: a fechada mais recente.
    const base = await api("/pagamentos/previa?origem=REGISTROS").catch(() => null);
    cache.competencia = base?.competenciasFechadas?.[0] ?? null;
    if (!cache.competencia) { cache.previa = { vazio: true, competenciasFechadas: [] }; return; }
  }
  cache.previa = await api(`/pagamentos/previa?${consulta()}`);
}

export async function paginaPagamentos() {
  await carregar();
  const p = cache.previa;
  const aba = (o, nome) => `<button class="botao ${cache.origem === o ? "botao-primario" : "botao-secundario"} botao-sm" data-pg-origem="${o}">${nome}</button>`;
  const podeGerar = sessao.pode("financeiro", "criar") && p.pagamentos?.length && !p.jaGerada;
  return `
    <div class="barra-filtros">
      ${aba("FOLHA", "Folha fechada")}${aba("REGISTROS", "Rescisões e férias")}
      ${cache.origem === "FOLHA" ? `<select class="filtro-texto" data-pg-competencia aria-label="Competência">
        ${(p.competenciasFechadas ?? []).map((c) => `<option value="${c}" ${c === cache.competencia ? "selected" : ""}>Competência ${competenciaTela(c)}</option>`).join("") || "<option>Nenhuma competência fechada</option>"}
      </select>` : ""}
      ${p.vazio ? "" : `<label class="dica" for="pg-data">Pagar em</label><input id="pg-data" class="filtro-texto" type="date" value="${esc(p.data ?? "")}" data-pg-data>
      <label class="opcao-marcar"><input type="checkbox" data-pg-pix ${cache.preferirPix ? "checked" : ""}> Preferir PIX quando houver chave</label>`}
    </div>
    ${p.vazio ? '<div class="cartao"><div class="cartao-corpo"><p class="dica">Nenhuma competência fechada. Feche a folha para gerar o pagamento.</p></div></div>' : previaHtml(p, podeGerar)}
    ${remessasHtml()}`;
}

function previaHtml(p, podeGerar) {
  const total = p.pagamentos.reduce((s, x) => s + x.valor, 0);
  const indicadores = [
    { rotulo: "A pagar", valor: moeda(total), icone: "dinheiro", cor: "var(--verde)", fundo: "var(--verde-bg)", nota: `${p.pagamentos.length} pagamento(s)${p.data ? ` em ${data(p.data)}` : ""}` },
    ...p.totais.map((t) => ({ rotulo: NOME_FORMA[t.forma][0], valor: moeda(t.total), icone: t.forma === "PIX" ? "raio" : "financeiro", cor: "var(--azul)", fundo: "var(--azul-bg)", nota: `${t.quantidade} pagamento(s)` })),
    { rotulo: "Pendências", valor: p.pendencias.length, icone: "cadeado", cor: p.pendencias.length ? "var(--vermelho)" : "var(--verde)", fundo: p.pendencias.length ? "var(--vermelho-bg)" : "var(--verde-bg)", nota: moeda(p.pendencias.reduce((s, x) => s + x.valor, 0)) + " fora do arquivo" },
  ];
  return `
    <section class="indicadores">
      ${indicadores.map((i) => `
        <div class="cartao indicador">
          <span class="indicador-icone" style="color:${i.cor};background:${i.fundo}">${icone(i.icone)}</span>
          <div><small>${esc(i.rotulo)}</small><strong>${i.valor}</strong><span class="dica">${esc(i.nota)}</span></div>
        </div>`).join("")}
    </section>
    ${p.jaGerada ? `<div class="cartao alerta-folha">${icone("ok")}<div><strong>Remessa já gerada para esta competência</strong><p>Arquivo ${p.jaGerada.nsa}, em ${dataHora(p.jaGerada.geradaEm)}. Não é gerado de novo para não pagar em dobro.</p></div></div>` : ""}
    ${p.pendencias.length ? `<div class="cartao alerta-folha">${icone("cadeado")}<div><strong>${p.pendencias.length} colaborador(es) fora do arquivo</strong>
      ${p.pendencias.map((x) => `<p>${esc(x.nome)} (${esc(matricula(x.matricula))}): ${esc(x.motivo)} · ${moeda(x.valor)}</p>`).join("")}
      <p class="dica">Complete o cadastro (CPF, conta ou chave PIX) e pague em separado.</p></div></div>` : ""}
    <div class="cartao tabela-cartao">
      <div class="cartao-cabecalho"><div><h3>Pagamentos</h3><p class="dica">Conta da empresa: banco ${esc(p.conta.banco.codigo)} · agência ${esc(p.conta.agencia)} · conta ${esc(p.conta.numero)}</p></div>
        ${podeGerar ? `<button class="botao botao-primario" data-pg-gerar>${icone("ok")}Gerar arquivo CNAB 240</button>` : ""}</div>
      <table class="tabela">
        <thead><tr><th>Colaborador</th><th>Origem</th><th>Forma</th><th class="col-opcional">Destino</th><th class="col-opcional">Data</th><th class="num">Valor</th></tr></thead>
        <tbody>
          ${p.pagamentos.map((x) => `
            <tr>
              <td><div class="pessoa">${avatar(x.nome, "avatar-sm")}<div><strong>${esc(x.nome)}</strong><small>${esc(matricula(x.matricula))}</small></div></div></td>
              <td>${etiqueta(NOME_ORIGEM, x.origem)}</td>
              <td>${etiqueta(NOME_FORMA, x.forma)}</td>
              <td class="col-opcional">${x.forma === "PIX" ? esc(x.chavePix) : `banco ${esc(x.banco)} · ag. ${esc(x.agencia)} · conta ${esc(x.conta)}`}</td>
              <td class="col-opcional">${data(x.data)}</td>
              <td class="num"><strong>${moeda(x.valor)}</strong></td>
            </tr>`).join("") || `<tr><td colspan="6" class="vazio">${cache.origem === "FOLHA" ? "Nenhum pagamento." : "Nenhuma rescisão ou férias aprovada a pagar."}</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function remessasHtml() {
  const lista = cache.remessas ?? [];
  const editar = sessao.pode("financeiro", "editar");
  return `
    <div class="cartao tabela-cartao" style="margin-top:16px">
      <div class="cartao-cabecalho"><div><h3>Arquivos gerados</h3><p class="dica">Envie o arquivo pelo internet banking da empresa e importe o retorno do banco para registrar o que foi pago.</p></div></div>
      <table class="tabela">
        <thead><tr><th>Arquivo</th><th>Origem</th><th class="col-opcional">Gerado em</th><th class="num">Pagamentos</th><th class="num">Total</th><th>Situação</th><th></th></tr></thead>
        <tbody>
          ${lista.map((r) => `
            <tr>
              <td><strong>${String(r.nsa).padStart(6, "0")}</strong><small class="dica" style="display:block">${esc(r.nomeArquivo)}</small></td>
              <td>${etiqueta(NOME_ORIGEM, r.origem)}${r.competencia ? ` <span class="dica">${competenciaTela(r.competencia)}</span>` : ""}</td>
              <td class="col-opcional">${dataHora(r.geradaEm)}</td>
              <td class="num">${r.quantidade}${r.pagos || r.rejeitados ? `<small class="dica" style="display:block">${r.pagos} pago(s)${r.rejeitados ? ` · ${r.rejeitados} rejeitado(s)` : ""}</small>` : ""}</td>
              <td class="num">${moeda(r.total)}</td>
              <td>${etiqueta(NOME_STATUS, r.status)}</td>
              <td><div class="acoes-linha">
                <button class="botao botao-secundario botao-sm" data-pg-baixar="${esc(r.id)}">Baixar</button>
                ${editar && r.status !== "PAGA" ? `<label class="botao botao-secundario botao-sm">Importar retorno<input type="file" hidden data-pg-retorno="${esc(r.id)}"></label>
                <button class="botao botao-fantasma botao-sm" data-pg-teste="${esc(r.id)}" title="Arquivo de retorno com todos os pagamentos efetivados, para testar">Retorno de teste</button>` : ""}
              </div></td>
            </tr>`).join("") || '<tr><td colspan="7" class="vazio">Nenhum arquivo gerado.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function baixar(nome, conteudo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/plain" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function atualizar() {
  cache.previa = null;
  cache.remessas = null;
  await cache.aoAlterar?.();
}

export function ligarEventosPagamento({ aoAlterar }) {
  cache.aoAlterar = aoAlterar;
  document.addEventListener("click", async (evento) => {
    const origem = evento.target.closest("[data-pg-origem]");
    if (origem) { cache.origem = origem.dataset.pgOrigem; cache.data = null; await atualizar(); return; }
    try {
      if (evento.target.closest("[data-pg-gerar]")) {
        const r = await api("/pagamentos/remessas", { metodo: "POST", corpo: { origem: cache.origem, competencia: cache.competencia, data: cache.data ?? cache.previa?.data, preferirPix: cache.preferirPix } });
        baixar(r.nomeArquivo, r.conteudo);
        aviso(`Arquivo ${r.nsa} gerado: ${r.quantidade} pagamento(s), ${moeda(r.total)}.`);
        await atualizar();
        return;
      }
      const b = evento.target.closest("[data-pg-baixar]");
      if (b) { const r = await api(`/pagamentos/remessas/${encodeURIComponent(b.dataset.pgBaixar)}`); baixar(r.nomeArquivo, r.conteudo); return; }
      const t = evento.target.closest("[data-pg-teste]");
      if (t) { const r = await api(`/pagamentos/remessas/${encodeURIComponent(t.dataset.pgTeste)}/retorno-teste`); baixar(r.nomeArquivo, r.conteudo); }
    } catch (erro) { aviso(erro.message, "erro"); }
  });
  document.addEventListener("change", async (evento) => {
    const alvo = evento.target;
    if (alvo.matches("[data-pg-competencia]")) { cache.competencia = alvo.value; cache.data = null; await atualizar(); return; }
    if (alvo.matches("[data-pg-data]")) { cache.data = alvo.value || null; await atualizar(); return; }
    if (alvo.matches("[data-pg-pix]")) { cache.preferirPix = alvo.checked; await atualizar(); return; }
    if (alvo.matches("[data-pg-retorno]") && alvo.files?.[0]) {
      try {
        const r = await api(`/pagamentos/remessas/${encodeURIComponent(alvo.dataset.pgRetorno)}/retorno`, { metodo: "POST", corpo: { conteudo: await alvo.files[0].text() } });
        aviso(`Retorno registrado: ${r.pagos} pago(s)${r.rejeitados ? `, ${r.rejeitados} rejeitado(s)` : ""}.`, r.rejeitados ? "erro" : "ok");
        await atualizar();
      } catch (erro) { aviso(erro.message, "erro"); }
    }
  });
}
