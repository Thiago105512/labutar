/**
 * Montagem de XML já na forma canônica (C14N 1.0, http://www.w3.org/TR/2001/REC-xml-c14n-20010315):
 * sem declaração, sem espaço entre elementos, atributos em ordem (declarações de namespace
 * primeiro), elementos vazios com abertura e fechamento, escapes da norma. Assim o texto gerado é
 * o mesmo que o eSocial canoniza para conferir a assinatura.
 */

/** Elemento: el("nome", { atributo: valor }, ...filhos). Filho null/undefined/false é omitido. */
export function el(nome, atributos = {}, ...filhos) {
  return { nome, atributos: atributos ?? {}, filhos: filhos.flat(Infinity).filter((f) => f !== null && f !== undefined && f !== false) };
}

const textoC14N = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
const atributoC14N = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/\t/g, "&#x9;").replace(/\n/g, "&#xA;").replace(/\r/g, "&#xD;");

function ordenarAtributos(atributos) {
  const pares = Object.entries(atributos).filter(([, v]) => v !== null && v !== undefined);
  const ns = pares.filter(([k]) => k === "xmlns" || k.startsWith("xmlns:")).sort(([a], [b]) => (a === "xmlns" ? -1 : b === "xmlns" ? 1 : a.localeCompare(b)));
  const outros = pares.filter(([k]) => !(k === "xmlns" || k.startsWith("xmlns:"))).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return [...ns, ...outros];
}

export function serializar(no) {
  if (typeof no !== "object") return textoC14N(no);
  const attrs = ordenarAtributos(no.atributos).map(([k, v]) => ` ${k}="${atributoC14N(v)}"`).join("");
  return `<${no.nome}${attrs}>${no.filhos.map(serializar).join("")}</${no.nome}>`;
}

/** Valor monetário do eSocial a partir de centavos: 123456 → "1234.56". */
export const valorESocial = (centavos) => (centavos / 100).toFixed(2);
