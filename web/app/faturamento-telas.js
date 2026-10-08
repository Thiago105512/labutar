/**
 * Financeiro › Medição e faturamento: o que cada contrato fatura no mês (calculado do centro de
 * custos e do ponto aprovado), as retenções do tomador e o fluxo enviar → aprovar (portal do
 * tomador) → faturar (RPS). A receita faturada passa a ser a do resultado por contrato.
 */
import { icone } from "./icones.js";
import { api, sessao } from "./sessao.js";
import { esc, moeda, matricula, data, etiqueta, aviso, abrirPainel, fecharPainel } from "./ui.js";

const STATUS = {
  RASCUNHO: ["Rascunho", "e-cinza"], ENVIADA: ["Com o tomador", "e-ambar"], APROVADA: ["Aprovada", "e-azul"],
  CONTESTADA: ["Contestada", "e-vermelho"], FATURADA: ["Faturada", "e-verde"], SEM_PRECO: ["Sem preço", "e-vermelho"],
};
const MODALIDADE = { POR_COLABORADOR: "Por colaborador", TAXA_SOBRE_CUSTO: "Custo + taxa", VALOR_FIXO: "Valor fixo" };
const cache = { competencia: "2026-08", dados: {}, aoAlterar: null };
const competenciaTela = (c) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;

export function limparFaturamento() {
  cache.dados = {};
}

export async function paginaMedicoes() {
  cache.dados[cache.competencia] ??= await api(`/faturamento/${cache.competencia}`);
  const d = cache.dados[cache.competencia];
  const t = d.totais;
  return `
    <div class="barra-filtros">
      <select class="filtro-texto" data-fat-competencia aria-label="Competência">
        ${["2026-08", "2026-09", "2026-10"].map((c) => `<option value="${c}" ${c === cache.competencia ? "selected" : ""}>Competência ${competenciaTela(c)}</option>`).join("")}
      </select>
      <span class="dica">Bruto ${moeda(t.bruto)} · retido pelos tomadores ${moeda(t.retido)} · líquido ${moeda(t.liquido)} · ${t.faturadas} faturada(s)</span>
    </div>
    <div class="cartao tabela-cartao">
      <table class="tabela">
        <thead><tr><th>Tomador e contrato</th><th class="col-opcional">Modalidade</th><th class="num">Bruto</th><th class="num col-opcional">Retenções</th><th class="num">Líquido</th><th>Situação</th></tr></thead>
        <tbody>
          ${d.medicoes.map((m) => `
            <tr class="linha-clicavel" data-fat-medicao="${esc(m.contratoId)}">
              <td><strong>${esc(m.tomador ?? "")}</strong><small class="dica" style="display:block">${esc(m.contratoId)}${m.colaboradores ? ` · ${m.colaboradores} colaborador(es), ${m.pontoAprovado ?? 0} com ponto aprovado` : ""}</small></td>
              <td class="col-opcional">${esc(MODALIDADE[m.modalidade] ?? "—")}</td>
              <td class="num">${moeda(m.valorBruto)}</td>
              <td class="num col-opcional">${moeda(m.retencoes?.totalRetido ?? 0)}</td>
              <td class="num"><strong>${moeda(m.retencoes?.liquido ?? 0)}</strong></td>
              <td>${etiqueta(STATUS, m.status)}${m.rps ? `<small class="dica" style="display:block">RPS ${m.rps.numero} · vence ${data(m.rps.vencimento)}</small>` : ""}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function painelMedicao(contratoId) {
  const m = cache.dados[cache.competencia]?.medicoes.find((x) => x.contratoId === contratoId);
  if (!m) return;
  const r = m.retencoes;
  const acao = m.status === "RASCUNHO" || m.status === "CONTESTADA"
    ? sessao.pode("financeiro", "editar") && m.valorBruto ? `<button class="botao botao-primario" data-fat-enviar="${esc(m.contratoId)}">${icone("tomadores")}Enviar ao tomador</button>` : ""
    : m.status === "APROVADA" && sessao.pode("financeiro", "criar") ? `<button class="botao botao-primario" data-fat-faturar="${esc(m.contratoId)}">${icone("ok")}Faturar (emitir RPS)</button>` : "";
  abrirPainel(`
    <header class="painel-cabecalho">
      <span class="modulo-icone">${icone("financeiro")}</span>
      <div class="texto"><h2>${esc(m.tomador ?? "")}</h2><p>${esc(m.contratoId)} · medição de ${competenciaTela(m.competencia)} · ${esc(MODALIDADE[m.modalidade] ?? "")}</p>
        <div class="meta" style="margin-top:8px">${etiqueta(STATUS, m.status)}</div></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <div class="painel-corpo">
      ${m.contestacao && m.status === "CONTESTADA" ? `<div class="secao alerta-folha">${icone("cadeado")}<div><strong>Contestada por ${esc(m.contestacao.por)}</strong><p>${esc(m.contestacao.motivo)}</p></div></div>` : ""}
      <div class="secao"><table class="tabela tabela-compacta">
        <thead><tr><th>Item</th><th class="dica">Cálculo</th><th class="num">Valor</th></tr></thead>
        <tbody>${(m.itens ?? []).map((i) => `<tr><td>${esc(i.nome ?? i.descricao)}${i.matricula ? ` <small class="dica">${esc(matricula(i.matricula))}</small>` : ""}</td><td class="dica">${i.detalhe?.custo != null ? `${moeda(i.detalhe.custo)} + ${esc(i.detalhe.taxaPercentual)}% (${moeda(i.detalhe.taxa)})` : esc(i.detalhe?.texto ?? i.descricao)}</td><td class="num">${moeda(i.valor)}</td></tr>`).join("")}
          <tr class="total destaque"><td>Valor bruto</td><td></td><td class="num">${moeda(m.valorBruto)}</td></tr></tbody>
      </table></div>
      ${r ? `<div class="secao"><h4>Retenções do tomador</h4><div class="bases">
        <div><small>INSS (${r.aliquotas.inss}%)</small><strong>${moeda(r.inss)}</strong></div>
        <div><small>IRRF (${r.aliquotas.irrf}%)</small><strong>${moeda(r.irrf)}</strong></div>
        <div><small>PIS/COFINS/CSLL</small><strong>${moeda(r.pis + r.cofins + r.csll)}</strong></div>
        <div><small>ISS (${r.aliquotas.iss}%)</small><strong>${moeda(r.iss)}</strong></div>
        <div><small>Líquido a receber</small><strong>${moeda(r.liquido)}</strong></div>
      </div>${r.avisos.map((a) => `<p class="dica">${esc(a)}</p>`).join("")}</div>` : ""}
      ${m.rps ? `<div class="secao"><h4>RPS ${m.rps.numero}</h4><p class="dica">Emitido em ${data(m.rps.emissao)} · vence em ${data(m.rps.vencimento)} · ${esc(m.rps.situacao)}</p><pre class="texto-contrato">${esc(m.rps.discriminacao)}</pre></div>` : ""}
    </div>
    <footer class="painel-rodape"><button class="botao botao-secundario" data-fechar type="button">Fechar</button>${acao}</footer>`);
}

export function ligarEventosFaturamento({ aoAlterar }) {
  cache.aoAlterar = aoAlterar;
  const recarregar = async () => { cache.dados = {}; fecharPainel(); await aoAlterar?.(); };
  document.addEventListener("change", async (e) => {
    if (!e.target.matches("[data-fat-competencia]")) return;
    cache.competencia = e.target.value;
    await aoAlterar?.();
  });
  document.addEventListener("click", async (e) => {
    const linha = e.target.closest("[data-fat-medicao]");
    if (linha) { painelMedicao(linha.dataset.fatMedicao); return; }
    try {
      const enviar = e.target.closest("[data-fat-enviar]");
      if (enviar) {
        await api(`/faturamento/${cache.competencia}/${encodeURIComponent(enviar.dataset.fatEnviar)}/enviar`, { metodo: "POST" });
        aviso("Medição enviada ao tomador para aprovação no portal.");
        await recarregar();
        return;
      }
      const faturar = e.target.closest("[data-fat-faturar]");
      if (faturar) {
        const r = await api(`/faturamento/${cache.competencia}/${encodeURIComponent(faturar.dataset.fatFaturar)}/faturar`, { metodo: "POST" });
        aviso(`RPS ${r.rps.numero} emitido; vence em ${data(r.rps.vencimento)}.`);
        await recarregar();
      }
    } catch (erro) { aviso(erro.message, "erro"); }
  });
}
