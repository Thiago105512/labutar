/**
 * Assinatura XMLDSig do evento, como o eSocial exige: enveloped, RSA-SHA256, digest SHA-256,
 * canonicalização C14N 1.0, referência ao Id do evento e o certificado (X509Certificate) no
 * KeyInfo. Feita com node:crypto, sem biblioteca externa: o XML é montado em forma canônica
 * (./xml.js), então o texto assinado é exatamente o que o receptor canoniza.
 *
 * Certificado: o A1 da empresa (arquivo .pfx) convertido uma vez para PEM
 * (`openssl pkcs12 -in empresa.pfx -nodes -out empresa.pem`). Sem certificado — no demo e nos
 * testes —, a chave pública vai no KeyInfo como RSAKeyValue: a assinatura confere, mas não tem
 * valor jurídico e o eSocial recusa.
 */
import { createHash, createSign, createVerify, createPublicKey, X509Certificate } from "node:crypto";
import { el, serializar } from "./xml.js";

export const DSIG = "http://www.w3.org/2000/09/xmldsig#";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";

const derDoPem = (pem) => String(pem).replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g, "");
const b64url = (s) => Buffer.from(s, "base64url").toString("base64");

function signedInfo(id, digest) {
  return el("SignedInfo", { xmlns: DSIG },
    el("CanonicalizationMethod", { Algorithm: C14N }),
    el("SignatureMethod", { Algorithm: RSA_SHA256 }),
    el("Reference", { URI: `#${id}` },
      el("Transforms", {}, el("Transform", { Algorithm: ENVELOPED }), el("Transform", { Algorithm: C14N })),
      el("DigestMethod", { Algorithm: SHA256 }),
      el("DigestValue", {}, digest)));
}

function keyInfo({ certificado, chavePrivada }) {
  if (certificado) return el("KeyInfo", {}, el("X509Data", {}, el("X509Certificate", {}, derDoPem(certificado))));
  const jwk = createPublicKey(chavePrivada).export({ format: "jwk" });
  return el("KeyInfo", {}, el("KeyValue", {}, el("RSAKeyValue", {}, el("Modulus", {}, b64url(jwk.n)), el("Exponent", {}, b64url(jwk.e)))));
}

/**
 * Monta o documento assinado.
 * @param evento { namespace, evento: no do evtXXX (com atributo Id) }
 * @param credencial { chavePrivada (PEM ou KeyObject), certificado? (PEM) }
 * @returns XML (string) com declaração UTF-8
 */
export function assinarEvento({ namespace, evento }, credencial) {
  const id = evento.atributos.Id;
  if (!id) throw new Error("evento sem Id");
  // Na canonicalização do subconjunto, o evento herda o namespace padrão do elemento eSocial.
  const canonico = serializar({ ...evento, atributos: { xmlns: namespace, ...evento.atributos } });
  const digest = createHash("sha256").update(canonico, "utf8").digest("base64");
  const info = signedInfo(id, digest);
  const assinatura = createSign("RSA-SHA256").update(serializar(info), "utf8").sign(credencial.chavePrivada, "base64");
  const { xmlns: _ns, ...semNs } = info.atributos;
  const signature = el("Signature", { xmlns: DSIG }, { ...info, atributos: semNs }, el("SignatureValue", {}, assinatura), keyInfo(credencial));
  return `<?xml version="1.0" encoding="UTF-8"?>${serializar(el("eSocial", { xmlns: namespace }, evento, signature))}`;
}

const pegar = (xml, tag) => new RegExp(`<${tag}[ >][\\s\\S]*?</${tag}>`).exec(xml)?.[0] ?? null;
const valor = (xml, tag) => new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml)?.[1] ?? null;

/**
 * Confere a assinatura de um documento gerado por assinarEvento (mesma forma canônica): o digest
 * do evento e a assinatura do SignedInfo com a chave do KeyInfo.
 * @returns { valida, motivo?, certificado?: { titular, validoAte } }
 */
export function verificarAssinatura(xml) {
  const ns = /<eSocial xmlns="([^"]+)">/.exec(xml)?.[1];
  const id = /<Reference URI="#([^"]+)">/.exec(xml)?.[1];
  if (!ns || !id) return { valida: false, motivo: "documento sem eSocial ou sem Reference" };
  const nomeEvento = new RegExp(`<(evt\\w+) Id="${id}">`).exec(xml)?.[1];
  const evento = nomeEvento && pegar(xml, nomeEvento);
  if (!evento) return { valida: false, motivo: "evento referenciado não encontrado" };
  const canonico = evento.replace(`<${nomeEvento} Id=`, `<${nomeEvento} xmlns="${ns}" Id=`);
  if (createHash("sha256").update(canonico, "utf8").digest("base64") !== valor(xml, "DigestValue")) return { valida: false, motivo: "o conteúdo do evento foi alterado depois da assinatura" };
  const info = pegar(xml, "SignedInfo").replace("<SignedInfo>", `<SignedInfo xmlns="${DSIG}">`);
  const cert = valor(xml, "X509Certificate");
  let chave;
  let certificado = null;
  if (cert) {
    const x509 = new X509Certificate(Buffer.from(cert, "base64"));
    chave = x509.publicKey;
    certificado = { titular: x509.subject, validoAte: x509.validTo };
  } else {
    const n = valor(xml, "Modulus"), e = valor(xml, "Exponent");
    if (!n || !e) return { valida: false, motivo: "KeyInfo sem certificado nem chave" };
    chave = createPublicKey({ key: { kty: "RSA", n: Buffer.from(n, "base64").toString("base64url"), e: Buffer.from(e, "base64").toString("base64url") }, format: "jwk" });
  }
  const ok = createVerify("RSA-SHA256").update(info, "utf8").verify(chave, valor(xml, "SignatureValue"), "base64");
  return ok ? { valida: true, certificado } : { valida: false, motivo: "assinatura não confere com a chave do KeyInfo" };
}
