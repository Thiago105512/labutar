import { somarDias } from "../../core/src/datas.js";
import { alocacaoNoDia, centroDeCusto } from "./alocacoes.js";

/**
 * Rateio do custo de um vínculo entre centros de custo numa competência.
 *
 * A folha é uma só; o que muda é para quem cada real é cobrado. O rateio
 * olha a alocação de CADA DIA em que o vínculo esteve ativo — um
 * terceirizado que trocou de tomador no dia 16 divide o custo do mês entre
 * os dois contratos, e a cobertura de um folguista vai para o posto coberto.
 */

/** Dias civis de uma competência "AAAA-MM". */
export function diasDaCompetencia(competencia) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(competencia))) throw new Error(`competência inválida: ${competencia}`);
  const dias = [];
  let dia = `${competencia}-01`;
  while (dia.startsWith(competencia)) {
    dias.push(dia);
    dia = somarDias(dia, 1);
  }
  return dias;
}

/**
 * Quantos dias o vínculo passou em cada centro de custo na competência.
 * Ignora dias antes da admissão e depois do desligamento. Com `contratos`,
 * dias após o fim do contrato do posto viram SEM_ALOCACAO.
 * Devolve [{ centroDeCusto, dias, fracao }] em ordem decrescente de dias.
 */
export function ratearCompetencia({ vinculo, alocacoes = [], postos = [], contratos = [], competencia } = {}) {
  const postosPorId = Object.fromEntries(postos.map((p) => [p.id, p]));
  const fimDoContrato = Object.fromEntries(contratos.map((c) => [c.id, c.fim ?? null]));
  // Dia depois do fim do contrato não é faturável, mesmo que a alocação
  // tenha ficado aberta: vira pendência (SEM_ALOCACAO), não custo do cliente.
  const alocacaoValidaNoDia = (dia) => {
    const alocacao = alocacaoNoDia(alocacoes, vinculo.id, dia);
    const posto = alocacao?.postoId ? postosPorId[alocacao.postoId] : null;
    const fim = posto ? fimDoContrato[posto.contratoId] : null;
    return fim && dia > fim ? null : alocacao;
  };
  const contagem = new Map();
  let totalDias = 0;

  for (const dia of diasDaCompetencia(competencia)) {
    if (vinculo.admissao && dia < vinculo.admissao) continue;
    if (vinculo.desligamento && dia > vinculo.desligamento) continue;
    const cc = centroDeCusto(alocacaoValidaNoDia(dia), postosPorId);
    contagem.set(cc, (contagem.get(cc) ?? 0) + 1);
    totalDias += 1;
  }

  const linhas = [...contagem.entries()]
    .map(([centro, dias]) => ({ centroDeCusto: centro, dias, fracao: totalDias ? dias / totalDias : 0 }))
    .sort((a, b) => b.dias - a.dias || a.centroDeCusto.localeCompare(b.centroDeCusto));
  return { competencia, totalDias, linhas };
}

/**
 * Divide um valor inteiro em centavos proporcionalmente aos pesos, sem
 * perder nem criar centavo (método do maior resto). Aceita valor negativo
 * (desconto) e pesos em qualquer escala (dias, horas).
 */
export function distribuirCentavos(totalCentavos, pesos) {
  if (!Number.isInteger(totalCentavos)) throw new Error("totalCentavos deve ser inteiro");
  const somaPesos = pesos.reduce((s, p) => s + p, 0);
  if (!pesos.length || somaPesos <= 0) throw new Error("pesos devem somar mais que zero");

  const sinal = totalCentavos < 0 ? -1 : 1;
  const absoluto = Math.abs(totalCentavos);
  const brutos = pesos.map((p) => (absoluto * p) / somaPesos);
  const partes = brutos.map(Math.floor);
  let sobra = absoluto - partes.reduce((s, v) => s + v, 0);

  const ordem = brutos
    .map((v, i) => ({ i, resto: v - Math.floor(v) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of ordem) {
    if (sobra === 0) break;
    partes[i] += 1;
    sobra -= 1;
  }
  return partes.map((v) => v * sinal);
}

/** Aplica um rateio (saída de ratearCompetencia) a um valor da folha. */
export function ratearValor(totalCentavos, rateio) {
  const linhas = rateio.linhas ?? rateio;
  const valores = distribuirCentavos(totalCentavos, linhas.map((l) => l.dias ?? l.peso));
  return linhas.map((l, i) => ({ centroDeCusto: l.centroDeCusto, centavos: valores[i] }));
}
