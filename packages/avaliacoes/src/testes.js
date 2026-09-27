import { novoId } from "../../core/src/ids.js";
import { arredondar } from "../../core/src/dinheiro.js";
import { normalizar } from "../../core/src/texto.js";
import { hoje } from "../../core/src/datas.js";
import { ESCALA_RUBRICA, TIPOS_AUTO_CORRIGIVEIS, TIPO_TESTE } from "./constantes.js";

const TIPOS_VALIDOS = Object.values(TIPO_TESTE);
const VERDADEIROS = new Set(["V", "VERDADEIRO", "TRUE", "SIM", "S", "1"]);
const FALSOS = new Set(["F", "FALSO", "FALSE", "NAO", "N", "0"]);

function texto(valor) {
  return valor === null || valor === undefined ? "" : String(valor).trim();
}

function chave(valor) {
  return normalizar(valor).toLowerCase().trim();
}

/** Aceita "3,5", "1.234,5" e "3.5" — o candidato brasileiro digita vírgula. */
export function parsearNumero(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : NaN;
  let bruto = texto(valor).replace(/\s|R\$/g, "");
  if (!bruto) return NaN;
  if (bruto.includes(",") && bruto.includes(".")) {
    bruto = bruto.replace(/\./g, "").replace(",", ".");
  } else if (bruto.includes(",")) {
    bruto = bruto.replace(",", ".");
  }
  const numero = Number(bruto);
  return Number.isFinite(numero) ? numero : NaN;
}

function interpretarBooleano(valor) {
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "number") return valor !== 0;
  const bruto = chave(valor).toUpperCase();
  if (VERDADEIROS.has(bruto)) return true;
  if (FALSOS.has(bruto)) return false;
  return null;
}

function exigirNumeroPositivo(valor, campo, contexto) {
  const numero = typeof valor === "number" ? valor : parsearNumero(valor);
  if (!Number.isFinite(numero) || numero <= 0) {
    throw new Error(`${contexto}: '${campo}' deve ser um número maior que zero`);
  }
  return numero;
}

function normalizarAlternativa(alternativa, contexto, idsVistos) {
  if (!alternativa || typeof alternativa !== "object" || Array.isArray(alternativa)) {
    throw new Error(`${contexto}: alternativa deve ser um objeto com id e texto`);
  }
  const id = texto(alternativa.id);
  if (!id) throw new Error(`${contexto}: alternativa sem 'id'`);
  if (idsVistos.has(id)) throw new Error(`${contexto}: id de alternativa duplicado "${id}"`);
  idsVistos.add(id);

  const descricao = texto(alternativa.texto);
  if (!descricao) throw new Error(`${contexto}, alternativa "${id}": 'texto' obrigatório`);
  return { id, texto: descricao };
}

function normalizarQuestao(questao, indice, tipoPadrao, idsVistos) {
  const contexto = `Questão ${indice + 1}`;
  if (!questao || typeof questao !== "object" || Array.isArray(questao)) {
    throw new Error(`${contexto}: deve ser um objeto com id, enunciado e tipo`);
  }

  const id = texto(questao.id);
  if (!id) throw new Error(`${contexto}: 'id' obrigatório`);
  if (idsVistos.has(id)) throw new Error(`Id de questão duplicado: "${id}"`);
  idsVistos.add(id);

  const enunciado = texto(questao.enunciado);
  if (!enunciado) throw new Error(`Questão "${id}": 'enunciado' obrigatório`);

  const tipo = texto(questao.tipo).toUpperCase() || tipoPadrao;
  if (!TIPOS_VALIDOS.includes(tipo)) {
    throw new Error(`Questão "${id}": tipo inválido "${questao.tipo}". Use ${TIPOS_VALIDOS.join(" | ")}`);
  }

  const pontos = questao.pontos === undefined ? 1 : exigirNumeroPositivo(questao.pontos, "pontos", `Questão "${id}"`);
  const base = { id, enunciado, tipo, pontos, autoCorrigivel: TIPOS_AUTO_CORRIGIVEIS.includes(tipo) };

  if (tipo === TIPO_TESTE.MULTIPLA_ESCOLHA) {
    if (!Array.isArray(questao.alternativas) || questao.alternativas.length < 2) {
      throw new Error(`Questão "${id}": múltipla escolha exige ao menos 2 alternativas`);
    }
    // Ids de alternativa são únicos dentro da questão: "a/b/c/d" se repetem
    // entre questões e o gabarito sempre é lido no escopo da própria questão.
    const idsAlternativas = new Set();
    const alternativas = questao.alternativas.map((alternativa, i) =>
      normalizarAlternativa(alternativa, `Questão "${id}", alternativa ${i + 1}`, idsAlternativas)
    );
    const brutas = Array.isArray(questao.corretas)
      ? questao.corretas
      : questao.correta !== undefined && questao.correta !== null
        ? [questao.correta]
        : [];
    const corretas = brutas.map((c) => texto(c)).filter(Boolean);
    if (corretas.length === 0) throw new Error(`Questão "${id}": informe 'correta' ou 'corretas'`);
    const ids = new Set(alternativas.map((a) => a.id));
    const estranhas = corretas.filter((c) => !ids.has(c));
    if (estranhas.length > 0) {
      throw new Error(`Questão "${id}": gabarito aponta alternativa inexistente (${estranhas.join(", ")})`);
    }
    return { ...base, alternativas, corretas };
  }

  if (tipo === TIPO_TESTE.VERDADEIRO_FALSO) {
    const correta = interpretarBooleano(questao.correta);
    if (correta === null) {
      throw new Error(`Questão "${id}": 'correta' deve ser verdadeiro ou falso`);
    }
    return { ...base, correta };
  }

  if (tipo === TIPO_TESTE.NUMERICA) {
    const respostaEsperada = parsearNumero(questao.respostaEsperada);
    if (!Number.isFinite(respostaEsperada)) {
      throw new Error(`Questão "${id}": 'respostaEsperada' deve ser um número`);
    }
    const tolerancia =
      questao.tolerancia === undefined || questao.tolerancia === null
        ? 0
        : Math.abs(parsearNumero(questao.tolerancia) || 0);
    return { ...base, respostaEsperada, tolerancia, unidade: texto(questao.unidade) || null };
  }

  return {
    ...base,
    minChars: questao.minChars === undefined ? null : Math.max(0, Number(questao.minChars) || 0),
    orientacao: texto(questao.orientacao) || null,
  };
}

/**
 * `tipo` define o padrão das questões; cada questão pode sobrescrever com o
 * próprio `tipo`, o que permite teste misto (objetiva + dissertativa).
 * `notaCorte` é percentual sobre a nota máxima (0 a 100).
 */
export function criarTeste({
  titulo,
  tipo,
  questoes,
  descricao = null,
  notaCorte = null,
  tempoLimiteMinutos = null,
} = {}) {
  if (!texto(titulo)) throw new Error("criarTeste exige 'titulo'");

  const tipoPadrao = texto(tipo).toUpperCase();
  if (!TIPOS_VALIDOS.includes(tipoPadrao)) {
    throw new Error(`tipo de teste inválido: "${tipo ?? ""}". Use ${TIPOS_VALIDOS.join(" | ")}`);
  }
  if (!Array.isArray(questoes) || questoes.length === 0) {
    throw new Error("criarTeste exige 'questoes' como lista com ao menos uma questão");
  }
  if (notaCorte !== null && notaCorte !== undefined) {
    const corte = parsearNumero(notaCorte);
    if (!Number.isFinite(corte) || corte < 0 || corte > 100) {
      throw new Error(`notaCorte deve ser um percentual entre 0 e 100 (recebido: ${notaCorte})`);
    }
    notaCorte = corte;
  }
  if (tempoLimiteMinutos !== null && tempoLimiteMinutos !== undefined) {
    tempoLimiteMinutos = exigirNumeroPositivo(tempoLimiteMinutos, "tempoLimiteMinutos", "criarTeste");
  }

  const idsVistos = new Set();
  const normalizadas = questoes.map((questao, indice) =>
    normalizarQuestao(questao, indice, tipoPadrao, idsVistos)
  );

  return {
    id: novoId("TST"),
    titulo: texto(titulo),
    descricao: texto(descricao) || null,
    tipo: tipoPadrao,
    questoes: normalizadas,
    totalQuestoes: normalizadas.length,
    notaMaxima: arredondar(
      normalizadas.reduce((soma, questao) => soma + questao.pontos, 0),
      2
    ),
    notaCorte,
    tempoLimiteMinutos,
    exigeRevisaoHumana: normalizadas.some((questao) => !questao.autoCorrigivel),
    criadoEm: hoje(),
  };
}

function semResposta(resposta) {
  if (!resposta) return true;
  const valor = resposta.valor ?? resposta.texto ?? resposta.resposta;
  return valor === undefined || valor === null || texto(valor) === "";
}

function valorDaResposta(resposta) {
  return resposta.valor ?? resposta.texto ?? resposta.resposta;
}

function compararResposta(questao, valor) {
  if (questao.tipo === TIPO_TESTE.MULTIPLA_ESCOLHA) {
    const marcadas = (Array.isArray(valor) ? valor : [valor]).map((item) => texto(item)).filter(Boolean);
    if (marcadas.length === 0) {
      return { correta: false, normalizado: null, motivo: "nenhuma alternativa marcada" };
    }
    const esperadas = new Set(questao.corretas.map(chave));
    const recebidas = new Set(marcadas.map(chave));
    const correta =
      esperadas.size === recebidas.size && [...recebidas].every((item) => esperadas.has(item));
    return {
      correta,
      normalizado: marcadas,
      motivo: correta ? null : `gabarito: ${questao.corretas.join(", ")}`,
    };
  }

  if (questao.tipo === TIPO_TESTE.VERDADEIRO_FALSO) {
    const interpretado = interpretarBooleano(valor);
    if (interpretado === null) {
      return { correta: false, normalizado: texto(valor), motivo: "resposta não reconhecida como verdadeiro/falso" };
    }
    return {
      correta: interpretado === questao.correta,
      normalizado: interpretado,
      motivo: interpretado === questao.correta ? null : `gabarito: ${questao.correta}`,
    };
  }

  if (questao.tipo === TIPO_TESTE.NUMERICA) {
    const numero = parsearNumero(valor);
    if (!Number.isFinite(numero)) {
      return { correta: false, normalizado: texto(valor), motivo: "resposta não numérica" };
    }
    const diferenca = Math.abs(numero - questao.respostaEsperada);
    return {
      correta: diferenca <= questao.tolerancia + 1e-9,
      normalizado: numero,
      motivo: diferenca <= questao.tolerancia + 1e-9 ? null : `esperado: ${questao.respostaEsperada}`,
    };
  }

  return { correta: null, normalizado: texto(valor), motivo: "questão dissertativa exige avaliação humana" };
}

/**
 * Corrige apenas as questões objetivas. Dissertativa volta em `pendentesRevisao`
 * com `nota: null` — o sistema não inventa nota de texto.
 * Enquanto houver pendência humana, `aprovado` é `null`: um teste corrigido pela
 * metade nunca pode reprovar candidato.
 */
export function corrigirTeste(teste, respostas = [], { tempoGastoMinutos = null } = {}) {
  if (!teste || !Array.isArray(teste.questoes)) {
    throw new Error("teste inválido: use criarTeste() para montar o teste");
  }
  if (!Array.isArray(respostas)) {
    throw new Error("'respostas' deve ser uma lista de { questaoId, valor }");
  }

  const mapa = new Map();
  for (const resposta of respostas) {
    if (resposta && resposta.questaoId !== undefined && resposta.questaoId !== null) {
      mapa.set(texto(resposta.questaoId), resposta);
    }
  }

  let nota = 0;
  let notaMaxima = 0;
  let notaMaximaCorrigida = 0;
  let acertos = 0;
  let erros = 0;
  let naoRespondidas = 0;

  const gabaritoComparado = [];
  const pendentesRevisao = [];

  for (const questao of teste.questoes) {
    notaMaxima += questao.pontos;
    const resposta = mapa.get(questao.id) ?? null;

    if (!questao.autoCorrigivel) {
      const conteudo = resposta ? texto(valorDaResposta(resposta)) : "";
      pendentesRevisao.push({
        questaoId: questao.id,
        enunciado: questao.enunciado,
        pontos: questao.pontos,
        nota: null,
        texto: conteudo || null,
        respondida: conteudo !== "",
        motivo: "questão dissertativa exige avaliação humana por rubrica",
      });
      gabaritoComparado.push({
        questaoId: questao.id,
        tipo: questao.tipo,
        resposta: conteudo || null,
        esperada: null,
        pontos: questao.pontos,
        nota: null,
        correta: null,
        respondida: conteudo !== "",
        pendenteRevisao: true,
        motivo: "aguardando revisão humana",
      });
      continue;
    }

    notaMaximaCorrigida += questao.pontos;

    if (semResposta(resposta)) {
      naoRespondidas += 1;
      gabaritoComparado.push({
        questaoId: questao.id,
        tipo: questao.tipo,
        resposta: null,
        esperada: questao.corretas ?? questao.correta ?? questao.respostaEsperada ?? null,
        pontos: questao.pontos,
        nota: 0,
        correta: false,
        respondida: false,
        pendenteRevisao: false,
        motivo: "sem resposta",
      });
      continue;
    }

    const comparacao = compararResposta(questao, valorDaResposta(resposta));
    const pontos = comparacao.correta ? questao.pontos : 0;
    if (comparacao.correta) acertos += 1;
    else erros += 1;
    nota += pontos;

    gabaritoComparado.push({
      questaoId: questao.id,
      tipo: questao.tipo,
      resposta: comparacao.normalizado,
      esperada: questao.corretas ?? questao.correta ?? questao.respostaEsperada ?? null,
      pontos: questao.pontos,
      nota: arredondar(pontos, 2),
      correta: comparacao.correta,
      respondida: true,
      pendenteRevisao: false,
      motivo: comparacao.motivo,
    });
  }

  nota = arredondar(nota, 2);
  notaMaxima = arredondar(notaMaxima, 2);
  const percentual = notaMaxima > 0 ? arredondar((nota / notaMaxima) * 100, 2) : 0;
  const percentualCorrigido =
    notaMaximaCorrigida > 0 ? arredondar((nota / notaMaximaCorrigida) * 100, 2) : null;

  const aguardandoRevisao = pendentesRevisao.length > 0;
  let aprovado = null;
  let motivoAprovacao;
  if (aguardandoRevisao) {
    motivoAprovacao = `${pendentesRevisao.length} questão(ões) aguardando revisão humana`;
  } else if (teste.notaCorte === null || teste.notaCorte === undefined) {
    motivoAprovacao = "teste sem nota de corte definida";
  } else {
    aprovado = percentual >= teste.notaCorte;
    motivoAprovacao = aprovado
      ? `percentual ${percentual} acima do corte ${teste.notaCorte}`
      : `percentual ${percentual} abaixo do corte ${teste.notaCorte}`;
  }

  const tempoExcedido =
    tempoGastoMinutos !== null &&
    teste.tempoLimiteMinutos !== null &&
    teste.tempoLimiteMinutos !== undefined &&
    parsearNumero(tempoGastoMinutos) > teste.tempoLimiteMinutos;

  return {
    testeId: teste.id ?? null,
    titulo: teste.titulo ?? null,
    nota,
    notaMaxima,
    notaMaximaCorrigida: arredondar(notaMaximaCorrigida, 2),
    percentual,
    percentualCorrigido,
    aprovado,
    motivoAprovacao,
    aguardandoRevisao,
    acertos,
    erros,
    naoRespondidas,
    gabaritoComparado,
    pendentesRevisao,
    tempoLimiteMinutos: teste.tempoLimiteMinutos ?? null,
    tempoGastoMinutos: tempoGastoMinutos === null ? null : parsearNumero(tempoGastoMinutos),
    tempoExcedido,
    corrigidoEm: hoje(),
  };
}

/**
 * Rubrica de questão dissertativa: critérios ponderados que somam 100, cada um
 * avaliado de 0 a 5. O resultado é 0 a 100.
 */
export function criarRubrica({ questaoId, criterios, descricao = null } = {}) {
  const id = texto(questaoId);
  if (!id) throw new Error("criarRubrica exige 'questaoId'");
  if (!Array.isArray(criterios) || criterios.length === 0) {
    throw new Error(`Rubrica da questão "${id}": informe ao menos um critério`);
  }

  const idsVistos = new Set();
  let somaPesos = 0;

  const normalizados = criterios.map((criterio, indice) => {
    const contexto = `Critério ${indice + 1} da rubrica "${id}"`;
    if (!criterio || typeof criterio !== "object" || Array.isArray(criterio)) {
      throw new Error(`${contexto}: deve ser um objeto com id, descricao e peso`);
    }
    const criterioId = texto(criterio.id);
    if (!criterioId) throw new Error(`${contexto}: 'id' obrigatório`);
    if (idsVistos.has(criterioId)) throw new Error(`${contexto}: id de critério duplicado "${criterioId}"`);
    idsVistos.add(criterioId);

    const descricaoCriterio = texto(criterio.descricao);
    if (!descricaoCriterio) throw new Error(`Critério "${criterioId}": 'descricao' obrigatória`);

    const peso = parsearNumero(criterio.peso);
    if (!Number.isFinite(peso) || peso <= 0) {
      throw new Error(`Critério "${criterioId}": 'peso' deve ser um número maior que zero`);
    }
    somaPesos += peso;

    return {
      id: criterioId,
      descricao: descricaoCriterio,
      peso,
      notaMinima: ESCALA_RUBRICA.minima,
      notaMaxima: ESCALA_RUBRICA.maxima,
    };
  });

  if (arredondar(somaPesos, 6) !== 100) {
    throw new Error(
      `Rubrica da questão "${id}": os pesos devem somar 100 (soma atual: ${arredondar(somaPesos, 2)})`
    );
  }

  return {
    id: novoId("RUB"),
    questaoId: id,
    descricao: texto(descricao) || null,
    criterios: normalizados,
    notaMinima: ESCALA_RUBRICA.minima,
    notaMaxima: ESCALA_RUBRICA.maxima,
    pesoTotal: 100,
    criadoEm: hoje(),
  };
}

function mapaDeNotas(notas) {
  const mapa = new Map();
  if (Array.isArray(notas)) {
    for (const item of notas) {
      if (!item) continue;
      const criterioId = texto(item.criterioId ?? item.id);
      if (criterioId) mapa.set(criterioId, item.nota);
    }
    return mapa;
  }
  if (notas && typeof notas === "object") {
    for (const [criterioId, nota] of Object.entries(notas)) mapa.set(texto(criterioId), nota);
    return mapa;
  }
  throw new Error("'notas' deve ser um objeto { criterioId: nota } ou uma lista de { criterioId, nota }");
}

export function avaliarComRubrica(rubrica, notas, { avaliador = null } = {}) {
  if (!rubrica || !Array.isArray(rubrica.criterios) || rubrica.criterios.length === 0) {
    throw new Error("rubrica inválida: use criarRubrica() para montá-la");
  }

  const recebidas = mapaDeNotas(notas);
  const conhecidas = new Set(rubrica.criterios.map((criterio) => criterio.id));

  const desconhecidas = [...recebidas.keys()].filter((criterioId) => !conhecidas.has(criterioId));
  if (desconhecidas.length > 0) {
    // Erro em vez de ignorar: critério digitado errado derrubaria o peso da nota.
    throw new Error(
      `Rubrica da questão "${rubrica.questaoId}": nota para critério inexistente (${desconhecidas.join(", ")})`
    );
  }

  const faltantes = rubrica.criterios.filter((criterio) => !recebidas.has(criterio.id)).map((c) => c.id);
  if (faltantes.length > 0) {
    throw new Error(
      `Rubrica da questão "${rubrica.questaoId}": falta nota para o(s) critério(s) ${faltantes.join(", ")}`
    );
  }

  let nota = 0;
  const detalhe = rubrica.criterios.map((criterio) => {
    const recebida = parsearNumero(recebidas.get(criterio.id));
    if (!Number.isFinite(recebida)) {
      throw new Error(`Critério "${criterio.id}": a nota deve ser um número`);
    }
    if (recebida < ESCALA_RUBRICA.minima || recebida > ESCALA_RUBRICA.maxima) {
      throw new Error(
        `Critério "${criterio.id}": nota ${recebida} fora da escala ${ESCALA_RUBRICA.minima} a ${ESCALA_RUBRICA.maxima}`
      );
    }
    const pontos = (recebida / ESCALA_RUBRICA.maxima) * criterio.peso;
    nota += pontos;
    return {
      criterioId: criterio.id,
      descricao: criterio.descricao,
      peso: criterio.peso,
      nota: recebida,
      pontos: arredondar(pontos, 2),
    };
  });

  nota = arredondar(nota, 2);
  return {
    questaoId: rubrica.questaoId,
    nota,
    notaMaxima: 100,
    percentual: nota,
    avaliador: texto(avaliador) || null,
    revisada: true,
    detalhe,
    avaliadaEm: hoje(),
  };
}
