import { somarMeses } from "../../core/src/datas.js";
import { mesmaTomadora } from "./temporario.js";
import {
  CAPITAL_MINIMO_TEMPORARIO,
  CAPITAL_MINIMO_TERCEIRIZACAO,
  PARAMETROS_LEGAIS,
} from "./constantes.js";

/**
 * Art. 5-D da Lei 6.019/1974: o empregado demitido pela tomadora não pode
 * prestar serviços a ela como empregado de prestadora antes de 18 meses da
 * demissão. `empregosAnteriores`: [{ cnpj, desligamento }] da pessoa.
 */
export function verificarQuarentenaExEmpregado(
  empregosAnteriores = [],
  { tomadorCnpj, inicio, parametros = PARAMETROS_LEGAIS } = {}
) {
  const bloqueios = empregosAnteriores
    .filter((e) => e.desligamento && mesmaTomadora(e.cnpj, tomadorCnpj))
    .map((e) => ({ ...e, liberadoEm: somarMeses(e.desligamento, parametros.terceirizacaoQuarentenaMeses) }))
    .filter((e) => inicio < e.liberadoEm)
    .sort((a, b) => b.liberadoEm.localeCompare(a.liberadoEm));

  if (!bloqueios.length) return { ok: true, erros: [], liberadoEm: null };
  const b = bloqueios[0];
  return {
    ok: false,
    liberadoEm: b.liberadoEm,
    erros: [
      `ex-empregado desta tomadora (desligado em ${b.desligamento}) só pode ser alocado como terceirizado ` +
        `a partir de ${b.liberadoEm} (art. 5-D)`,
    ],
  };
}

/**
 * Capital social mínimo exigido da própria empresa para operar cada modelo.
 * Temporário: art. 6º, III. Prestação de serviços: art. 4-B, III.
 * Devolve o maior exigido entre os modelos que a empresa pratica.
 */
export function capitalSocialMinimo({ praticaTemporario = false, praticaTerceirizacao = false, empregados = 0 } = {}) {
  const exigencias = [];
  if (praticaTemporario) exigencias.push({ modelo: "TEMPORARIO", centavos: CAPITAL_MINIMO_TEMPORARIO, base: "Lei 6.019/1974, art. 6º, III" });
  if (praticaTerceirizacao) {
    const faixa = CAPITAL_MINIMO_TERCEIRIZACAO.find((f) => empregados <= f.ateEmpregados);
    exigencias.push({ modelo: "TERCEIRIZACAO", centavos: faixa.centavos, base: "Lei 6.019/1974, art. 4-B, III" });
  }
  const exigido = Math.max(0, ...exigencias.map((e) => e.centavos));
  return { exigidoCentavos: exigido, exigencias };
}
