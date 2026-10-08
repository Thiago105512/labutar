/**
 * Folha › eSocial e guias: eventos da competência fechada (S-1200, S-2299, S-2220) com o XML
 * assinado e validado pelo XSD para baixar, e a conferência do FGTS Digital e da DCTFWeb. A
 * transmissão fica para quando houver o certificado A1 da empresa.
 */
import { icone } from "./icones.js";
import { api, sessao } from "./sessao.js";
import { esc, moeda, matricula, data, dataHora, avatar, etiqueta, aviso } from "./ui.js";

const SITUACAO = { PRONTO: ["Pronto", "e-verde"], PENDENTE: ["Pendente", "e-ambar"] };
const TIPO = { "S-1200": ["S-1200 remuneração", "e-azul"], "S-2299": ["S-2299 desligamento", "e-ambar"], "S-2220": ["S-2220 ASO", "e-marca"] };
const cache = { competencia: "2026-08", dados: {}, aoAlterar: null };
const competenciaTela = (c) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;

export function limparESocial() {
  cache.dados = {};
}

export async function paginaESocial() {
  let d;
  try {
    cache.dados[cache.competencia] ??= await api(`/esocial/${cache.competencia}`);
    d = cache.dados[cache.competencia];
  } catch (erro) {
    return `${barra()}<div class="cartao"><div class="cartao-corpo"><p class="dica">${esc(erro.message)}</p></div></div>`;
  }
  const g = d.guias;
  const baixar = sessao.pode("folha", "editar");
  const prontos = d.eventos.filter((e) => e.situacao === "PRONTO").length;
  return `
    ${barra()}
    <div class="cartao alerta-folha">${icone("cadeado")}<div><strong>Gerado e assinado; envio pendente</strong>
      <p>${esc(d.assinatura)}. ${esc(d.integracao.motivo)}.</p>${d.xsd.aviso ? `<p class="dica">${esc(d.xsd.aviso)}</p>` : ""}</div></div>
    <div class="grade-folha">
      <div class="cartao">
        <div class="cartao-cabecalho"><div><h3>FGTS Digital</h3><p class="dica">Guia emitida no FGTS Digital a partir do eSocial · vence em ${data(g.fgtsDigital.vencimento)}</p></div></div>
        <div class="cartao-corpo"><div class="bases">
          <div><small>FGTS mensal (8%)</small><strong>${moeda(g.fgtsDigital.mensal)}</strong></div>
          <div><small>Rescisório e multa</small><strong>${moeda(g.fgtsDigital.rescisorio)}</strong></div>
          <div><small>Total a conferir</small><strong>${moeda(g.fgtsDigital.total)}</strong></div>
        </div><p class="dica">${esc(g.fgtsDigital.observacao)}</p></div>
      </div>
      <div class="cartao">
        <div class="cartao-cabecalho"><div><h3>DCTFWeb</h3><p class="dica">Débitos vindos do eSocial (DARF) · vence em ${data(g.dctfWeb.vencimento)}</p></div></div>
        <div class="cartao-corpo"><div class="bases">
          <div><small>INSS dos colaboradores</small><strong>${moeda(g.dctfWeb.inssSegurados)}</strong></div>
          <div><small>INSS patronal</small><strong>${moeda(g.dctfWeb.patronal)}</strong></div>
          <div><small>RAT ajustado (FAP)</small><strong>${moeda(g.dctfWeb.rat)}</strong></div>
          <div><small>Terceiros</small><strong>${moeda(g.dctfWeb.terceiros)}</strong></div>
          <div><small>IRRF</small><strong>${moeda(g.dctfWeb.irrf)}</strong></div>
          <div><small>Total a conferir</small><strong>${moeda(g.dctfWeb.total)}</strong></div>
        </div></div>
      </div>
    </div>
    <div class="cartao tabela-cartao" style="margin-top:16px">
      <div class="cartao-cabecalho"><div><h3>Eventos</h3><p class="dica">${prontos} de ${d.eventos.length} prontos · folha fechada em ${dataHora(d.fechadaEm)}</p></div></div>
      <table class="tabela">
        <thead><tr><th>Colaborador</th><th>Evento</th><th class="col-opcional">Referência</th><th>Situação</th><th></th></tr></thead>
        <tbody>
          ${d.eventos.map((e) => `
            <tr>
              <td><div class="pessoa">${avatar(e.nome, "avatar-sm")}<div><strong>${esc(e.nome)}</strong><small>${esc(matricula(e.matricula))}</small></div></div></td>
              <td>${etiqueta(TIPO, e.tipo)}</td>
              <td class="col-opcional dica">${esc(e.referencia)}</td>
              <td>${etiqueta(SITUACAO, e.situacao)}${e.motivo ? `<small class="dica" style="display:block">${esc(e.motivo)}</small>` : ""}</td>
              <td>${baixar && e.situacao === "PRONTO" ? `<button class="botao botao-secundario botao-sm" data-esocial-xml="${esc(e.tipo)}|${esc(e.chave)}">${icone("folha")}XML</button>` : ""}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function barra() {
  return `
    <div class="barra-filtros">
      <select class="filtro-texto" data-esocial-competencia aria-label="Competência">
        ${["2026-08", "2026-09", "2026-10"].map((c) => `<option value="${c}" ${c === cache.competencia ? "selected" : ""}>Competência ${competenciaTela(c)}</option>`).join("")}
      </select>
      <span class="dica">O eSocial sai da folha fechada.</span>
    </div>`;
}

export function ligarEventosESocial({ aoAlterar }) {
  cache.aoAlterar = aoAlterar;
  document.addEventListener("change", async (evento) => {
    if (!evento.target.matches("[data-esocial-competencia]")) return;
    cache.competencia = evento.target.value;
    await aoAlterar?.();
  });
  document.addEventListener("click", async (evento) => {
    const b = evento.target.closest("[data-esocial-xml]");
    if (!b) return;
    const [tipo, chave] = b.dataset.esocialXml.split("|");
    try {
      const x = await api(`/esocial/${cache.competencia}/xml?tipo=${encodeURIComponent(tipo)}&chave=${encodeURIComponent(chave)}`);
      const url = URL.createObjectURL(new Blob([x.conteudo], { type: "application/xml" }));
      Object.assign(document.createElement("a"), { href: url, download: x.nomeArquivo }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const xsd = x.xsd.validado === true ? "válido pelo XSD" : x.xsd.validado === false ? `fora do XSD: ${x.xsd.erros.join("; ")}` : "XSD não conferido no servidor";
      aviso(`${x.nomeArquivo}: assinatura ${x.assinatura.valida ? "confere" : "NÃO confere"}, ${xsd}.`, x.xsd.validado === false || !x.assinatura.valida ? "erro" : "ok");
    } catch (erro) { aviso(erro.message, "erro"); }
  });
}
