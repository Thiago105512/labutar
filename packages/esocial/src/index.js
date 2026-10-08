/**
 * @labutar/esocial — geração e assinatura de eventos no leiaute S-1.3, validados contra os XSD
 * oficiais guardados em ../xsd. A **transmissão** continua pendente: precisa do certificado A1
 * da empresa, da habilitação em produção restrita e do WSDL de produção (ver ../README.md e
 * docs/05-compliance.md). As funções pendentes lançam PendenciaError de propósito: um stub
 * silencioso permitiria marcar evento como transmitido sem ter sido.
 */

export const EVENTOS = Object.freeze({
  S1200: "S-1200",
  S2200: "S-2200",
  S2220: "S-2220",
  S2240: "S-2240",
  S2299: "S-2299",
});

export const AMBIENTES = Object.freeze({
  PRODUCAO_RESTRITA: "producaoRestrita",
  PRODUCAO: "producao",
});

export class PendenciaError extends Error {
  constructor(funcao, bloqueio) {
    super(
      `@labutar/esocial: ${funcao} não está implementado. ` +
        `Bloqueio: ${bloqueio}. Leia packages/esocial/README.md antes de implementar.`
    );
    this.name = "PendenciaError";
    this.funcao = funcao;
    this.bloqueio = bloqueio;
  }
}

const PENDENCIAS = {
  criarTransmissor: "certificado A1 válido e habilitação no ambiente de produção restrita",
  gerarS2200: "dados de admissão completos no cadastro (endereço, nascimento, CBO, horário contratual) — a admissão digital já coleta parte",
  gerarS2240: "leiaute inexistente no código herdado; depende do PGR da empresa",
  transmitir: "WSDL real dos serviços RecepcaoLoteEventos/ConsultarLoteEventos e certificado A1",
  consultarLote: "WSDL real dos serviços RecepcaoLoteEventos/ConsultarLoteEventos e certificado A1",
};

function pendente(funcao) {
  throw new PendenciaError(funcao, PENDENCIAS[funcao] ?? "não especificado");
}

export function criarTransmissor() {
  return pendente("criarTransmissor");
}

export function gerarS2200() {
  return pendente("gerarS2200");
}

export function gerarS2240() {
  return pendente("gerarS2240");
}

export function transmitir() {
  return pendente("transmitir");
}

export function consultarLote() {
  return pendente("consultarLote");
}

/** O que a integração faz hoje: gera e assina; não transmite (o server não expõe envio). */
export function statusIntegracao() {
  return {
    habilitado: false,
    motivo: "Transmissão pendente: certificado A1 da empresa e habilitação em produção restrita",
    eventosGerados: [EVENTOS.S1200, EVENTOS.S2220, EVENTOS.S2299],
    eventosSuportados: [],
    pendencias: { ...PENDENCIAS },
  };
}

export { ESQUEMAS_ESOCIAL, esquemaVigente } from "./esquemas.js";
export { el, serializar, valorESocial } from "./xml.js";
export { assinarEvento, verificarAssinatura, DSIG } from "./assinatura.js";
export { gerarS1200, gerarS2299, gerarS2220, CATEGORIA, TABELA_RUBRICAS, VERSAO_PROCESSO } from "./eventos.js";
