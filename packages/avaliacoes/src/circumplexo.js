import { arredondar } from "../../core/src/dinheiro.js";
import { NOME_FATOR_DISC, ORDEM_FATORES_DISC, RODA_DISC_12, SEGMENTOS_DISC } from "./constantes.js";

const GRAUS_POR_RADIANO = 180 / Math.PI;

function distanciaAngular(a, b) {
  const bruta = Math.abs(((a - b) % 360) + 360) % 360;
  return bruta > 180 ? 360 - bruta : bruta;
}

function maisProximo(angulo, tabela) {
  return tabela.reduce(
    (melhor, item) => {
      const distancia = distanciaAngular(angulo, item.angulo);
      return distancia < melhor.distancia ? { item, distancia } : melhor;
    },
    { item: tabela[0], distancia: Infinity }
  ).item;
}

function valoresDe(perfil) {
  const valores = { D: 0, I: 0, S: 0, C: 0 };
  for (const fator of ORDEM_FATORES_DISC) {
    const bruto = Number(perfil?.[fator]);
    valores[fator] = Number.isFinite(bruto) ? bruto : 0;
  }
  return valores;
}

/**
 * Projeção do perfil no circumplexo, no layout canônico do Everything DiSC
 * (D no topo, i à direita, S embaixo, C à esquerda, sentido horário).
 *
 * Os eixos vêm das duas dimensões do modelo de Marston:
 *
 *   ritmo (y) = (D + I) − (S + C)   ativo e expansivo acima; reflexivo e contido abaixo
 *   foco  (x) = (I + S) − (D + C)   pessoas e aceitação à direita; tarefa e ceticismo à esquerda
 *
 * A rotação de −45° no final não é enfeite: sem ela, D puro cairia em 135° e i
 * em 45°, e o desenho ficaria girado em relação a todo o material de mercado
 * que o usuário do Labutar já conhece.
 *
 * `base` é o denominador de normalização (em geral o total de questões
 * respondidas). Perfis em diagonal podem ultrapassar raio 1; por isso
 * `intensidade` vem limitada e `saturado` avisa quando isso aconteceu.
 */
export function projetarCircumplexo(perfil, { base = null } = {}) {
  const valores = valoresDe(perfil);
  const somaAbsoluta = ORDEM_FATORES_DISC.reduce((soma, fator) => soma + Math.abs(valores[fator]), 0);

  // Perfil todo zerado não tem direção: atan2(0, 0) devolveria 0° e o laudo
  // mostraria um "iS" inventado para quem não respondeu nada. Melhor devolver
  // projeção indefinida e deixar a camada de cima tratar como ausente.
  if (somaAbsoluta === 0) {
    return {
      definido: false,
      motivo: "nenhum fator com pontuação diferente de zero",
      x: 0,
      y: 0,
      angulo: null,
      raio: 0,
      intensidade: 0,
      saturado: false,
      segmento: null,
      setor: null,
      valores: { ...valores },
      base: 0,
    };
  }

  const denominador = Number.isFinite(base) && base > 0 ? base : Math.max(1, somaAbsoluta / 2);

  const x = ((valores.I + valores.S) - (valores.D + valores.C)) / (2 * denominador);
  const y = ((valores.D + valores.I) - (valores.S + valores.C)) / (2 * denominador);

  const bruto = Math.atan2(y, x) * GRAUS_POR_RADIANO - 45;
  const angulo = arredondar(((bruto % 360) + 360) % 360, 1);
  const raio = arredondar(Math.hypot(x, y), 3);

  const segmento = maisProximo(angulo, SEGMENTOS_DISC);
  const setor = maisProximo(angulo, RODA_DISC_12);

  return {
    definido: true,
    motivo: null,
    x: arredondar(x, 4),
    y: arredondar(y, 4),
    angulo,
    raio,
    intensidade: Math.min(1, raio),
    saturado: raio > 1,
    segmento: { codigo: segmento.codigo, rotulo: segmento.rotulo, nome: segmento.nome, angulo: segmento.angulo },
    setor: { setor: setor.setor, rotulo: setor.rotulo, angulo: setor.angulo },
    valores: { ...valores },
    base: denominador,
  };
}

/** Converte um ângulo qualquer (0–360) no estilo primário correspondente. */
export function segmentoPorAngulo(angulo) {
  const normalizado = ((Number(angulo) % 360) + 360) % 360;
  const segmento = maisProximo(normalizado, SEGMENTOS_DISC);
  return { codigo: segmento.codigo, rotulo: segmento.rotulo, nome: segmento.nome, angulo: segmento.angulo };
}

/** Coordenadas cartesianas do ponto na roda, para desenhar em SVG/canvas. */
export function pontoNaRoda(projecao, raioPixels = 100) {
  if (!projecao?.definido || projecao.angulo === null) {
    return { x: 0, y: 0, raioPixels, indefinido: true };
  }
  const radiano = (projecao.angulo * Math.PI) / 180;
  const r = projecao.intensidade * raioPixels;
  return {
    x: arredondar(r * Math.cos(radiano), 2),
    y: arredondar(-r * Math.sin(radiano), 2), // y invertido: em tela, para baixo é positivo
    raioPixels,
    indefinido: false,
  };
}

/**
 * Diferenciação do perfil. Perfil plano (todos os fatores parecidos) não é
 * perfil: é ausência de preferência. Aparece tanto em quem respondeu sem ler
 * quanto em quem genuinamente transita entre estilos — e por isso vira nota no
 * laudo, nunca reprovação.
 */
export function diferenciacaoPerfil(percentuais, { cortePlano = 15, corteMarcado = 35 } = {}) {
  const valores = ORDEM_FATORES_DISC.map((fator) => Number(percentuais?.[fator] ?? 50));
  const amplitude = arredondar(Math.max(...valores) - Math.min(...valores), 1);
  const nivel = amplitude < cortePlano ? "PLANO" : amplitude <= corteMarcado ? "MODERADO" : "MARCADO";

  const leituras = {
    PLANO: "Perfil pouco diferenciado: as quatro dimensões ficaram próximas. Pouca base para afirmar preferência de estilo — vale conversa em entrevista antes de qualquer conclusão.",
    MODERADO: "Perfil com diferenciação moderada: há preferência visível, mas nenhum fator domina de forma absoluta.",
    MARCADO: "Perfil marcado: há preferência clara de estilo, com distância relevante entre o fator mais forte e o mais fraco.",
  };

  const ordenados = ORDEM_FATORES_DISC.slice().sort((a, b) => (percentuais?.[b] ?? 0) - (percentuais?.[a] ?? 0));

  return {
    amplitude,
    nivel,
    leitura: leituras[nivel],
    maisForte: ordenados[0],
    maisFraco: ordenados[ordenados.length - 1],
    ordem: ordenados.map((fator) => ({ fator, nome: NOME_FATOR_DISC[fator], valor: percentuais?.[fator] ?? 50 })),
  };
}
