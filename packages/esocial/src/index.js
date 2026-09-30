/**
 * ⏸ PACOTE ADIADO — ver ../README.md e docs/05-compliance.md.
 *
 * Cada função lança PendenciaError de propósito. Um stub silencioso permitiria
 * marcar uma admissão como transmitida sem ela ter sido, e evento mal formado
 * no eSocial gera multa.
 */

export const EVENTOS = Object.freeze({
  S2200: "S-2200",
  S2220: "S-2220",
  S2240: "S-2240",
});

export const AMBIENTES = Object.freeze({
  PRODUCAO_RESTRITA: "producaoRestrita",
  PRODUCAO: "producao",
});

export class PendenciaError extends Error {
  constructor(funcao, bloqueio) {
    super(
      `@labutar/esocial: ${funcao} não está implementado (Fase 4 adiada em 2026-09-27). ` +
        `Bloqueio: ${bloqueio}. Leia packages/esocial/README.md antes de implementar.`
    );
    this.name = "PendenciaError";
    this.funcao = funcao;
    this.bloqueio = bloqueio;
  }
}

const PENDENCIAS = {
  criarTransmissor: "certificado A1 válido e habilitação no ambiente de produção restrita",
  gerarS2200: "XSD do leiaute vigente não baixado; leiaute herdado diverge do oficial",
  gerarS2220: "XSD do leiaute vigente não baixado; leiaute herdado diverge do oficial",
  gerarS2240: "leiaute inexistente no código herdado; depende do PGR da empresa",
  validarContraXSD: "nenhum validador XSD instalado (libxmljs2 ou equivalente)",
  assinar: "xml-crypto@6 mudou a API — ver docs/05-compliance.md itens 1 a 3",
  transmitir: "WSDL real dos serviços RecepcaoLoteEventos/ConsultarLoteEventos",
  consultarLote: "WSDL real dos serviços RecepcaoLoteEventos/ConsultarLoteEventos",
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

export function gerarS2220() {
  return pendente("gerarS2220");
}

export function gerarS2240() {
  return pendente("gerarS2240");
}

export function validarContraXSD() {
  return pendente("validarContraXSD");
}

export function assinar() {
  return pendente("assinar");
}

export function transmitir() {
  return pendente("transmitir");
}

export function consultarLote() {
  return pendente("consultarLote");
}

/**
 * Portão de prontidão da Fase 4. O server consulta isto antes de expor
 * qualquer rota de admissão/eSocial, para que a UI nunca prometa o que
 * o backend não entrega.
 */
export function statusIntegracao() {
  return {
    habilitado: false,
    motivo: "Fase 4 adiada em 2026-09-27 por decisão do produto",
    eventosSuportados: [],
    pendencias: { ...PENDENCIAS },
  };
}
export { ESQUEMAS_ESOCIAL, esquemaVigente } from "./esquemas.js";
