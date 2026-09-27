import { arredondar } from "../../core/src/dinheiro.js";
import { ORDEM_FATORES_DISC, VALENCIA_ITEM } from "./constantes.js";

function contarZerado() {
  return { D: 0, I: 0, S: 0, C: 0 };
}

/**
 * Separa a resposta nas duas séries do instrumento, no desenho do PPA:
 * série clara (palavras desejáveis) → como a pessoa se apresenta;
 * série escura (palavras indesejáveis) → o que emerge quando ela admite o
 * próprio lado difícil.
 *
 * São essas duas séries que sustentam os três gráficos clássicos: Graph II
 * (autoimagem), Graph I (sob pressão) e Graph III (líquido). Sem valência
 * declarada no bloco a separação é impossível e devolvemos `disponivel: false`
 * — inventar a divisão por posição no questionário produziria gráfico bonito e
 * sem significado.
 */
export function perfisPorSerie(instrumento, checagem) {
  if (!instrumento || !Array.isArray(instrumento.questoes)) {
    throw new Error("perfisPorSerie exige o instrumento com 'questoes'");
  }

  const questoes = new Map(instrumento.questoes.map((q) => [q.id, q]));
  const semValencia = instrumento.questoes.filter((q) => !q.valencia).length;
  if (semValencia > 0) {
    return {
      disponivel: false,
      motivo: `${semValencia} bloco(s) sem valência declarada; as séries clara e escura não podem ser separadas`,
    };
  }

  const claro = contarZerado();
  const escuro = contarZerado();
  let blocosClaro = 0;
  let blocosEscuro = 0;

  for (const resposta of checagem?.validas ?? []) {
    const questao = questoes.get(resposta.questaoId);
    if (!questao) continue;
    const alternativa = questao.alternativas.find((a) => a.id === resposta.mais);
    if (!alternativa) continue;

    if (questao.valencia === VALENCIA_ITEM.POSITIVA) {
      claro[alternativa.fator] += 1;
      blocosClaro += 1;
    } else {
      escuro[alternativa.fator] += 1;
      blocosEscuro += 1;
    }
  }

  const percentuaisClaro = contarZerado();
  const percentuaisEscuro = contarZerado();
  for (const fator of ORDEM_FATORES_DISC) {
    percentuaisClaro[fator] = blocosClaro > 0 ? arredondar((claro[fator] / blocosClaro) * 100, 1) : 0;
    percentuaisEscuro[fator] = blocosEscuro > 0 ? arredondar((escuro[fator] / blocosEscuro) * 100, 1) : 0;
  }

  const divergencias = ORDEM_FATORES_DISC.map((fator) => ({
    fator,
    claro: percentuaisClaro[fator],
    escuro: percentuaisEscuro[fator],
    diferenca: arredondar(percentuaisClaro[fator] - percentuaisEscuro[fator], 1),
  }));

  const divergencia =
    blocosClaro > 0 && blocosEscuro > 0
      ? arredondar(divergencias.reduce((soma, d) => soma + Math.abs(d.diferenca), 0) / ORDEM_FATORES_DISC.length, 1)
      : null;

  return {
    disponivel: true,
    blocosClaro,
    blocosEscuro,
    claro: { contagens: { ...claro }, percentuais: percentuaisClaro },
    escuro: { contagens: { ...escuro }, percentuais: percentuaisEscuro },
    divergencias,
    divergencia,
  };
}
