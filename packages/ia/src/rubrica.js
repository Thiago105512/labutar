import { slug } from "../../core/src/texto.js";
import { arredondar } from "../../core/src/dinheiro.js";
import { REGRAS_TRIAGEM_PADRAO } from "../../ats/src/constantes.js";
import { DIVERGENCIA_PADRAO } from "./constantes.js";

const PESOS = REGRAS_TRIAGEM_PADRAO.pesos;

/**
 * Critérios derivados da vaga, com pesos alinhados aos da triagem determinística
 * para que os dois scores sejam comparáveis.
 *
 * **Localização fica de fora de propósito.** Ela é removida na desidentificação
 * (cidade + empresa + cargo reidentifica em mercado pequeno), então o modelo não
 * tem como julgá-la. Isso significa que a rubrica cobre no máximo 90 dos 100
 * pontos da triagem determinística — `scoreDeterministicoComparavel` compensa.
 */
export function criarRubrica(vaga) {
  if (!vaga) throw new Error("criarRubrica exige a vaga");

  const criterios = [];
  const competencias = vaga.competencias ?? [];

  if (competencias.length) {
    const somaPesos = competencias.reduce((s, c) => s + (c.peso ?? 1), 0) || 1;
    for (const c of competencias) {
      criterios.push({
        id: `comp-${slug(c.nome) || "competencia"}`,
        tipo: "competencia",
        descricao: `Demonstrar ${c.nome}${c.nivelMinimo ? ` em nível ${c.nivelMinimo} de 5` : ""}`,
        peso: arredondar(((c.peso ?? 1) / somaPesos) * PESOS.competencias, 3),
        nivelEsperado: c.nivelMinimo ?? null,
        obrigatorio: !!c.obrigatoria,
      });
    }
  }

  const anosMinimos = vaga.regrasTriagem?.experienciaAnosMinimos ?? 0;
  criterios.push({
    id: "experiencia",
    tipo: "experiencia",
    descricao: anosMinimos
      ? `Tempo e profundidade de experiência: ao menos ${anosMinimos} ano(s) em atividade relacionada`
      : "Tempo e profundidade de experiência na função",
    peso: PESOS.experiencia,
    obrigatorio: false,
  });

  if (vaga.formacaoMinima) {
    criterios.push({
      id: "formacao",
      tipo: "formacao",
      descricao: `Formação compatível com o nível ${vaga.formacaoMinima} da escala 1-7 (1 fundamental, 2 médio, 3 técnico, 4 superior, 5 pós, 6 mestrado, 7 doutorado)`,
      peso: PESOS.formacao,
      obrigatorio: false,
    });
  }

  const idiomas = vaga.idiomas ?? [];
  if (idiomas.length) {
    const porIdioma = arredondar(PESOS.idiomas / idiomas.length, 3);
    for (const i of idiomas) {
      criterios.push({
        id: `idioma-${slug(i.codigo ?? i.idioma ?? "idioma")}`,
        tipo: "idioma",
        descricao: `${i.codigo ?? i.idioma} em nível ${i.nivel ?? "?"}`,
        peso: porIdioma,
        obrigatorio: i.obrigatoria ?? true,
      });
    }
  }

  const totalPesos = arredondar(criterios.reduce((s, c) => s + c.peso, 0), 3);

  return {
    vagaId: vaga.id ?? null,
    titulo: vaga.titulo ?? null,
    criterios,
    totalPesos,
    cobreLocalizacao: false,
    nota: "Localização não é avaliável: é removida na desidentificação. Comparar com scoreDeterministicoComparavel(), não com score.total bruto.",
  };
}

/**
 * Recalcula o score determinístico na mesma base da rubrica (sem localização e
 * renormalizado), para que a divergência entre IA e regra seja comparável.
 * Comparar 0-100 com localizacao contra 0-90 sem ela produziria divergência
 * fantasma em toda vaga presencial fora da cidade do candidato.
 */
export function scoreDeterministicoComparavel(triagem) {
  const componentes = triagem?.score?.componentes;
  if (!componentes) return null;

  const pesos = { ...PESOS, ...(triagem.score.pesos ?? {}) };
  const base = pesos.competencias + pesos.experiencia + pesos.formacao + pesos.idiomas;
  if (base <= 0) return null;

  const bruto =
    (componentes.competencias?.score ?? 0) * pesos.competencias +
    (componentes.experiencia?.score ?? 0) * pesos.experiencia +
    (componentes.formacao?.score ?? 0) * pesos.formacao +
    (componentes.idiomas?.score ?? 0) * pesos.idiomas;

  return arredondar(bruto / base, 2);
}

/**
 * A divergência entre o modelo e a regra determinística é o sinal mais útil do
 * sistema inteiro: ou a rubrica está mal calibrada, ou o modelo alucinou. Nos
 * dois casos quem resolve é uma pessoa, nunca o sistema sozinho.
 */
export function compararComTriagem({ ia, deterministico, limite = DIVERGENCIA_PADRAO } = {}) {
  if (!ia) throw new Error("compararComTriagem exige o resultado da IA");
  if (!deterministico) throw new Error("compararComTriagem exige o resultado da triagem determinística");

  const baseComparavel = scoreDeterministicoComparavel(deterministico);
  const divergencia = ia.score != null && baseComparavel != null ? arredondar(Math.abs(ia.score - baseComparavel), 2) : null;

  const motivos = [];
  if (ia.ok === false) motivos.push(`interpretação da resposta falhou: ${ia.motivo ?? "motivo não informado"}`);
  const naoVerificados = (ia.componentes ?? []).filter((c) => c.naoVerificado).map((c) => c.id);
  if (naoVerificados.length) motivos.push(`evidência não confirmada no texto: ${naoVerificados.join(", ")}`);
  if (divergencia != null && divergencia > limite) {
    motivos.push(`divergência de ${divergencia} pontos acima do limite de ${limite}`);
  }
  if (ia.divergenciaScoreModelo != null && ia.divergenciaScoreModelo > limite) {
    motivos.push(`o score global informado pelo modelo diverge ${ia.divergenciaScoreModelo} pontos do recalculado a partir das notas`);
  }

  return {
    scoreIA: ia.score ?? null,
    scoreDeterministico: deterministico.score?.total ?? null,
    baseComparavel,
    divergencia,
    limite,
    exigirRevisaoHumana: motivos.length > 0,
    motivos,
    componentes: (ia.componentes ?? []).map((c) => ({
      id: c.id,
      notaIA: c.nota,
      peso: c.peso,
      evidenciaVerificada: c.evidenciaVerificada,
    })),
    decisaoDeterministica: deterministico.decisao ?? null,
  };
}
