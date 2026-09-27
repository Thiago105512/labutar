import { arredondar } from "../../core/src/dinheiro.js";
import { ESCALA_CONCORDANCIA, ORDEM_FATORES_DISC } from "./constantes.js";

function contarZerado() {
  return { D: 0, I: 0, S: 0, C: 0 };
}

function declaracoesDe(instrumento) {
  const declaracoes = instrumento?.escala?.declaracoes;
  if (!Array.isArray(declaracoes) || declaracoes.length === 0) {
    throw new Error(
      "instrumento sem escala de concordância: use criarInstrumentoDISC() ou informe 'escala.declaracoes'"
    );
  }
  return declaracoes;
}

function limitesDe(instrumento) {
  const minima = Number(instrumento?.escala?.minima ?? ESCALA_CONCORDANCIA.minima);
  const maxima = Number(instrumento?.escala?.maxima ?? ESCALA_CONCORDANCIA.maxima);
  if (!Number.isFinite(minima) || !Number.isFinite(maxima) || maxima <= minima) {
    throw new Error(`escala inválida: mínima (${minima}) precisa ser menor que a máxima (${maxima})`);
  }
  return { minima, maxima };
}

/**
 * Confere as respostas da escala sem calcular nada, no mesmo espírito de
 * `responderDISC`: separa pendente de malformada. Valor fora da escala é
 * rejeitado em vez de ser cortado para o limite — cortar silenciosamente
 * transformaria dado corrompido em perfil legítimo.
 */
export function responderEscalaDISC(instrumento, respostas = []) {
  const declaracoes = declaracoesDe(instrumento);
  const { minima, maxima } = limitesDe(instrumento);
  if (!Array.isArray(respostas)) {
    throw new Error("'respostas' da escala deve ser uma lista de { declaracaoId, valor }");
  }

  const porId = new Map(declaracoes.map((d) => [d.id, d]));
  const invalidas = [];
  const validas = new Map();

  for (const resposta of respostas) {
    const declaracaoId = String(resposta?.declaracaoId ?? "").trim();
    const declaracao = porId.get(declaracaoId);
    if (!declaracao) {
      invalidas.push({ declaracaoId: declaracaoId || null, motivo: "declaração não encontrada no instrumento" });
      continue;
    }

    const valor = Number(resposta?.valor);
    if (!Number.isFinite(valor)) {
      invalidas.push({ declaracaoId, motivo: "'valor' ausente ou não numérico" });
      continue;
    }
    if (!Number.isInteger(valor) || valor < minima || valor > maxima) {
      invalidas.push({
        declaracaoId,
        motivo: `valor ${resposta?.valor} fora da escala ${minima}–${maxima}`,
      });
      continue;
    }

    validas.set(declaracaoId, { declaracaoId, valor, fator: declaracao.fator, reversa: Boolean(declaracao.reversa) });
  }

  const pendentes = declaracoes.filter((d) => !validas.has(d.id)).map((d) => d.id);

  return {
    completo: pendentes.length === 0 && invalidas.length === 0,
    totalDeclaracoes: declaracoes.length,
    respondidas: validas.size,
    pendentes,
    invalidas,
    validas: [...validas.values()],
  };
}

/**
 * Pontuação normativa por fator (0–100), com itens reversos já invertidos.
 *
 * Não é percentil: percentil exige amostra normativa brasileira calibrada, que
 * ainda não temos. Devolver 0–100 chamando de "percentil" seria falso — e é
 * exatamente esse tipo de exagero que derruba um laudo em auditoria.
 */
export function calcularEscalaDISC(instrumento, respostas = []) {
  const checagem = responderEscalaDISC(instrumento, respostas);
  const { minima, maxima } = limitesDe(instrumento);
  const amplitude = maxima - minima;

  const somas = contarZerado();
  const contagens = contarZerado();
  let extremos = 0;

  for (const resposta of checagem.validas) {
    const normalizada = ((resposta.valor - minima) / amplitude) * 100;
    const valor = resposta.reversa ? 100 - normalizada : normalizada;
    somas[resposta.fator] += valor;
    contagens[resposta.fator] += 1;
    if (resposta.valor === minima || resposta.valor === maxima) extremos += 1;
  }

  const porFator = contarZerado();
  for (const fator of ORDEM_FATORES_DISC) {
    porFator[fator] = contagens[fator] > 0 ? arredondar(somas[fator] / contagens[fator], 1) : null;
  }

  const respondidas = checagem.respondidas;
  const extremidade = respondidas > 0 ? arredondar((extremos / respondidas) * 100, 1) : null;
  const respondidasPorFator = { ...contagens };

  return {
    porFator,
    respondidasPorFator,
    respondidas,
    totalDeclaracoes: checagem.totalDeclaracoes,
    completo: checagem.completo,
    pendentes: checagem.pendentes,
    invalidas: checagem.invalidas,
    respostas: checagem.validas,
    extremidade,
    escala: { minima, maxima },
  };
}

/**
 * Divergência entre a escolha forçada (ipsativa) e a escala (normativa) para o
 * mesmo fator. As duas partes medem a mesma coisa por métodos diferentes: quando
 * discordam muito, ou a pessoa respondeu sem atenção, ou respondeu de olho na
 * vaga. Nenhuma das duas hipóteses permite entregar o perfil como conclusão.
 */
export function compararEscalaComForcada(escala, percentuaisLiquidos, limite = 30) {
  if (!escala || !percentuaisLiquidos) return null;
  const divergencias = [];
  for (const fator of ORDEM_FATORES_DISC) {
    const normativo = escala.porFator?.[fator];
    if (normativo === null || normativo === undefined) continue;
    const diferenca = arredondar(Math.abs(normativo - (percentuaisLiquidos[fator] ?? 50)), 1);
    if (diferenca > limite) divergencias.push({ fator, escolhaForcada: percentuaisLiquidos[fator], escala: normativo, diferenca });
  }
  return { divergencias, limite, haDivergencia: divergencias.length > 0 };
}
