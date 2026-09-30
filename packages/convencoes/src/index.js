/**
 * @labutar/convencoes — convenções (CCT) e acordos coletivos (ACT) aplicados à folha.
 */
export * from "./aplicacao.js";
import { CCT_AM000038_2026 } from "./instrumentos/am000038-2026.js";
export { CCT_AM000038_2026 };

/** Instrumentos já cadastrados no produto (registro no MTE → dados). */
export const INSTRUMENTOS = Object.freeze([CCT_AM000038_2026]);
