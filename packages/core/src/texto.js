import { somenteDigitos } from "./validacao.js";

const ACENTOS = /[\u0300-\u036f]/g;

export function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(ACENTOS, "");
}

export function slug(texto) {
  return normalizar(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function capitalizar(texto) {
  return String(texto ?? "")
    .toLowerCase()
    .replace(/(^|\s|-|\/)([a-zà-ú])/g, (_, separador, letra) => separador + letra.toUpperCase());
}

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "del", "di", "van", "von"]);

export function nomeParaExibicao(nomeCompleto) {
  const partes = String(nomeCompleto ?? "").trim().split(/\s+/);
  if (partes.length <= 1) return capitalizar(partes[0] ?? "");
  return partes
    .map((parte, indice) =>
      indice > 0 && indice < partes.length - 1 && PARTICULAS.has(parte.toLowerCase())
        ? parte.toLowerCase()
        : capitalizar(parte)
    )
    .join(" ");
}

export function iniciais(nomeCompleto, maximo = 2) {
  const partes = String(nomeCompleto ?? "").trim().split(/\s+/).filter((p) => !PARTICULAS.has(p.toLowerCase()));
  return partes
    .slice(0, maximo)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** LGPD: exibição de dado pessoal em telas compartilhadas e logs. */
export function mascararCPF(valor) {
  const cpf = somenteDigitos(valor).padStart(11, "0").slice(0, 11);
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
}

export function mascararEmail(email) {
  const texto = String(email ?? "");
  const [local, dominio] = texto.split("@");
  if (!dominio) return "***";
  const visivel = local.slice(0, Math.min(2, local.length));
  return `${visivel}${"*".repeat(Math.max(1, local.length - visivel.length))}@${dominio}`;
}

export function mascararTelefone(valor) {
  const d = somenteDigitos(valor);
  if (d.length < 10) return "***";
  return `(**) ${d.length === 11 ? "*****" : "****"}-${d.slice(-4)}`;
}

export function mascararNome(nome) {
  const partes = String(nome ?? "").trim().split(/\s+/);
  if (partes.length <= 1) return `${partes[0]?.[0] ?? ""}***`;
  return `${partes[0]} ${partes.slice(1).map((p) => `${p[0]}.`).join(" ")}`;
}

export function truncar(texto, maximo, sufixo = "…") {
  const valor = String(texto ?? "");
  return valor.length <= maximo ? valor : valor.slice(0, maximo - sufixo.length) + sufixo;
}

export function semEspacos(texto) {
  return String(texto ?? "").replace(/\s+/g, " ").trim();
}

export function escapeXML(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
