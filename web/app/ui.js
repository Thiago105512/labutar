/**
 * Peças de interface compartilhadas pelas telas do painel.
 * Todo texto de origem externa passa por `esc()` antes de virar HTML.
 */
import { icone } from "./icones.js";
import { FUSO_PADRAO, formatarBRL, formatarCNPJ, formatarCPF, formatarDataBR, formatarTelefone, paraCentavos } from "/packages/core/src/index.js";
import { formatarMatricula } from "/packages/mao-de-obra/src/matricula.js";

export const esc = (valor) =>
  String(valor ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const iniciais = (nome = "?") =>
  String(nome || "?").trim().split(/\s+/).filter((p) => p.length > 2 || p === p.toUpperCase()).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";

export function matiz(texto = "") {
  let h = 0;
  for (const c of String(texto)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export const avatar = (nome, classe = "") =>
  `<span class="avatar ${classe}" style="--h:${matiz(nome)}">${esc(iniciais(nome))}</span>`;

export const etiqueta = (mapa, chave) => {
  const [texto, cor] = mapa[chave] ?? [chave ?? "—", "e-cinza"];
  return `<span class="etiqueta ${cor}">${esc(texto)}</span>`;
};

export function diasDesde(iso) {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

export const quando = (iso) => {
  const d = diasDesde(iso);
  if (d === null) return "";
  if (d === 0) return "hoje";
  if (d === 1) return "há 1 dia";
  return `há ${d} dias`;
};

// Formatos únicos da interface (docs/15-padroes.md): toda tela usa estes, nunca um próprio.
/** Valor em centavos → "R$ 1.234,56". */
export const moeda = (centavos) => (centavos == null ? "—" : formatarBRL(centavos));
/** Valor digitado ("2.000,00", "2000") → centavos. */
export const lerMoeda = (texto) => paraCentavos(texto);

/** Valor para preencher um campo de dinheiro ("3.500,00"): o mesmo formato que lerMoeda() lê. */
export const moedaParaCampo = (centavos) => (centavos == null ? "" : formatarBRL(centavos).replace(/^R\$\s*/, ""));

export const telefone = (valor) => (valor ? formatarTelefone(valor) : "");
/** CNPJ só com os caracteres → "42.288.454/0001-50" (também alfanumérico). */
export const cnpj = (valor) => (valor ? formatarCNPJ(valor) : "—");
/** CPF só com dígitos → "529.982.247-25". */
export const cpf = (valor) => (valor ? formatarCPF(valor) : "—");
/** Matrícula "20048217" → "2-004821-7". */
export const matricula = (valor) => formatarMatricula(valor);
/** Data civil AAAA-MM-DD → "30/09/2026". */
export const data = (iso) => (iso ? formatarDataBR(iso) : "—");
/** Instante → "30/09/2026 14:05", no fuso da empresa (não no do navegador). */
export const dataHora = (iso) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: FUSO_PADRAO }) : "—";

export function aviso(texto, tipo = "ok") {
  const el = document.createElement("div");
  el.className = `aviso ${tipo === "erro" ? "erro" : ""}`;
  el.innerHTML = `${icone(tipo === "erro" ? "fechar" : "ok")}<span>${esc(texto)}</span>`;
  document.getElementById("avisos").appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

export function abrirPainel(html) {
  document.getElementById("painel").innerHTML = html;
  const el = document.getElementById("painel-lateral");
  el.classList.add("aberto");
  el.setAttribute("aria-hidden", "false");
}

export function fecharPainel() {
  const el = document.getElementById("painel-lateral");
  el.classList.remove("aberto");
  el.setAttribute("aria-hidden", "true");
}
