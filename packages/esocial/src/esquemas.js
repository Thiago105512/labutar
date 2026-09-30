/**
 * Esquemas XSD do eSocial por data de vigência. O eSocial muda o leiaute em etapas (a NT
 * S-1.3 nº 07/2026 tem implantações em 29/09, 26/10, 23/11 e 14/12/2026 e 18/01/2027):
 * um evento é validado contra o esquema vigente **na data do envio**, não contra o mais novo.
 */
export const ESQUEMAS_ESOCIAL = Object.freeze([
  Object.freeze({ versao: "S-1.3", vigenteDesde: "2026-11-23", pasta: "S-1.3-2026-11-23", origem: "NT S-1.3 nº 07/2026 (rev. 24/09/2026)" }),
  Object.freeze({ versao: "S-1.3", vigenteDesde: "2026-12-14", pasta: "S-1.3-2026-12-14", origem: "NT S-1.3 nº 07/2026 (rev. 24/09/2026)" }),
]);

/** Esquema vigente na data (AAAA-MM-DD). Data anterior ao primeiro pacote guardado é recusada. */
export function esquemaVigente(data, esquemas = ESQUEMAS_ESOCIAL) {
  const vigentes = esquemas.filter((e) => e.vigenteDesde <= data).sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde));
  if (!vigentes.length) {
    throw new Error(`nenhum esquema do eSocial guardado para ${data}: o primeiro pacote vale desde ${esquemas[0].vigenteDesde}; baixe o pacote vigente nessa data`);
  }
  return vigentes[0];
}
