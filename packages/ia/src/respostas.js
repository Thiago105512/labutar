import { normalizar, semEspacos } from "../../core/src/texto.js";
import { arredondar } from "../../core/src/dinheiro.js";
import { PALAVRAS_DE_REPROVACAO, LIMITE_EVIDENCIA } from "./constantes.js";

function chaveDeComparacao(texto) {
  return semEspacos(normalizar(String(texto ?? "")).toLowerCase());
}

function removerVirgulasFinais(texto) {
  return texto.replace(/,(\s*[}\]])/g, "$1");
}

/**
 * Modelos cercam JSON de prosa, de cerca de código, ou truncam no meio.
 * Nunca lança: devolver `{ ok:false, motivo }` é o que permite ao chamador
 * mandar para análise humana em vez de derrubar o processo.
 */
export function extrairJson(texto) {
  const bruto = String(texto ?? "").trim();
  if (!bruto) return { ok: false, valor: null, motivo: "resposta vazia" };

  const tentativas = [];

  const cercado = bruto.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (cercado) tentativas.push(cercado[1].trim());

  const inicio = bruto.indexOf("{");
  const fim = bruto.lastIndexOf("}");
  if (inicio !== -1 && fim > inicio) tentativas.push(bruto.slice(inicio, fim + 1));

  tentativas.push(bruto);

  let ultimoMotivo = "não foi possível extrair um objeto JSON da resposta";
  for (const tentativa of tentativas) {
    if (!tentativa) continue;
    for (const variante of [tentativa, removerVirgulasFinais(tentativa)]) {
      let valor;
      try {
        valor = JSON.parse(variante);
      } catch {
        ultimoMotivo = tentativa.includes("{") ? "JSON mal formado ou truncado" : "resposta não contém objeto JSON";
        continue;
      }
      if (Array.isArray(valor)) return { ok: false, valor: null, motivo: "resposta é um array; esperado objeto" };
      if (!valor || typeof valor !== "object") return { ok: false, valor: null, motivo: "JSON não é um objeto" };
      return { ok: true, valor, motivo: null };
    }
  }
  return { ok: false, valor: null, motivo: ultimoMotivo };
}

function notaValida(valor) {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0 && valor <= 5;
}

/**
 * Converte a resposta do modelo em componentes verificáveis.
 *
 * Duas decisões que importam:
 *
 * 1. O **score é recalculado aqui**, a partir das notas por critério e dos
 *    pesos da rubrica. Se o modelo mandar um número global, ele é registrado
 *    em `scoreInformadoPeloModelo` e comparado — mas nunca é o que vale. Um
 *    número que não se reconstrói a partir das partes não é auditável, e
 *    decisão de contratação precisa ser.
 *
 * 2. Cada evidência é **conferida contra o texto do candidato**. Se não estiver
 *    lá, o componente é marcado `naoVerificado`. Modelo que inventa citação é
 *    o modo de falha mais comum aqui, e uma citação inventada sustenta uma nota
 *    que sustenta uma contratação.
 */
export function interpretarMatching(texto, { criterios = [], textoCandidato = "", pesos = null } = {}) {
  const extracao = extrairJson(texto);
  if (!extracao.ok) {
    return { ok: false, motivo: extracao.motivo, score: null, componentes: [], evidencias: [], ressalvas: [] };
  }

  const valor = extracao.valor;
  const brutos = Array.isArray(valor.componentes) ? valor.componentes : null;
  if (!brutos) {
    return { ok: false, motivo: "resposta sem o array 'componentes'", score: null, componentes: [], evidencias: [], ressalvas: [] };
  }
  if (!criterios.length) {
    return { ok: false, motivo: "rubrica vazia: impossível validar os componentes", score: null, componentes: [], evidencias: [], ressalvas: [] };
  }

  const textoBusca = chaveDeComparacao(textoCandidato);
  const porId = new Map(criterios.map((c) => [String(c.id), c]));
  const vistos = new Set();
  const componentes = [];
  const problemas = [];

  for (const item of brutos) {
    const id = String(item?.id ?? "");
    const criterio = porId.get(id);
    if (!criterio) {
      problemas.push(`componente "${id}" não pertence à rubrica`);
      continue;
    }
    if (vistos.has(id)) {
      problemas.push(`componente "${id}" duplicado`);
      continue;
    }
    vistos.add(id);

    if (!notaValida(item.nota)) {
      problemas.push(`componente "${id}" com nota inválida (${JSON.stringify(item.nota)}); esperado número de 0 a 5`);
      continue;
    }

    const evidencia = typeof item.evidencia === "string" ? item.evidencia.trim().slice(0, LIMITE_EVIDENCIA) : "";
    const semEvidencia = !evidencia || /^(n\/?a|nenhuma|não informado|nao informado|-)$/i.test(evidencia);
    const encontrada = semEvidencia ? false : textoBusca.includes(chaveDeComparacao(evidencia));

    if (!semEvidencia && !encontrada) {
      problemas.push(`componente "${id}" cita evidência que não está no texto do candidato`);
    }

    componentes.push({
      id,
      descricao: criterio.descricao,
      peso: pesos?.[id] ?? criterio.peso ?? 1,
      nota: item.nota,
      evidencia: semEvidencia ? null : evidencia,
      evidenciaVerificada: encontrada,
      naoVerificado: !encontrada,
      justificativa: typeof item.justificativa === "string" ? semEspacos(item.justificativa).slice(0, 400) : "",
      obrigatorio: !!criterio.obrigatorio,
    });
  }

  const faltantes = criterios.filter((c) => !vistos.has(String(c.id))).map((c) => String(c.id));
  if (faltantes.length) problemas.push(`critérios sem resposta do modelo: ${faltantes.join(", ")}`);

  const totalPesos = componentes.reduce((soma, c) => soma + c.peso, 0);
  const score = totalPesos > 0
    ? arredondar((componentes.reduce((soma, c) => soma + c.peso * (c.nota / 5) * 100, 0) / totalPesos), 2)
    : null;

  const scoreInformado = typeof valor.score === "number" ? valor.score : null;
  const naoVerificados = componentes.filter((c) => c.naoVerificado);

  const ressalvas = [
    ...(Array.isArray(valor.ressalvas) ? valor.ressalvas.map((r) => semEspacos(String(r))) : []),
    ...(Array.isArray(valor.informacoesAusentes) ? valor.informacoesAusentes.map((r) => `informação ausente: ${r}`) : []),
  ];

  return {
    // ok exige tudo: componentes completos, notas válidas e evidência conferida.
    // Meio-validado não existe — ou sustenta leitura humana, ou não serve.
    ok: problemas.length === 0 && faltantes.length === 0 && naoVerificados.length === 0 && score !== null,
    motivo: problemas.length ? problemas.join("; ") : null,
    score,
    scoreInformadoPeloModelo: scoreInformado,
    divergenciaScoreModelo: scoreInformado != null && score != null ? arredondar(Math.abs(scoreInformado - score), 2) : null,
    componentes,
    faltantes,
    evidencias: componentes.filter((c) => c.evidencia).map((c) => ({ id: c.id, trecho: c.evidencia, verificada: c.evidenciaVerificada })),
    ressalvas,
  };
}

/**
 * Um parecer que conclui por eliminação não é parecer: é decisão automatizada,
 * o que a LGPD art. 20 sujeita a revisão e o art. 37 a registro — e reprovar
 * alguém por texto gerado sem responsabilidade identificada é passivo
 * trabalhista direto.
 */
export function interpretarParecer(texto) {
  const extracao = extrairJson(texto);
  if (!extracao.ok) {
    return { ok: false, motivo: extracao.motivo, parecer: null, ressalvas: [] };
  }

  const valor = extracao.valor;
  const bruto = JSON.stringify(valor).toLowerCase();
  const normalizado = normalizar(bruto);

  const encontradas = PALAVRAS_DE_REPROVACAO.filter((p) => normalizado.includes(normalizar(p).toLowerCase()));
  if (encontradas.length) {
    return {
      ok: false,
      motivo: `parecer contém linguagem de decisão eliminatória: ${encontradas.join(", ")}. IA apoia a decisão, não a toma.`,
      parecer: null,
      ressalvas: [],
      termosEncontrados: encontradas,
    };
  }

  if (typeof valor.resumo !== "string" || !valor.resumo.trim()) {
    return { ok: false, motivo: "parecer sem 'resumo'", parecer: null, ressalvas: [] };
  }

  const lista = (campo) => (Array.isArray(valor[campo]) ? valor[campo].map((x) => semEspacos(String(x))).filter(Boolean) : []);

  return {
    ok: true,
    motivo: null,
    parecer: {
      resumo: semEspacos(valor.resumo),
      pontosFortes: lista("pontosFortes"),
      lacunas: lista("lacunas"),
      perguntasParaEntrevista: lista("perguntasParaEntrevista"),
    },
    ressalvas: lista("ressalvas"),
    aviso: "Documento de apoio. A decisão é da pessoa recrutadora e o titular tem direito a revisão (LGPD art. 20).",
  };
}

export function interpretarAnuncio(texto) {
  const extracao = extrairJson(texto);
  if (!extracao.ok) return { ok: false, motivo: extracao.motivo, anuncio: null };

  const valor = extracao.valor;
  if (typeof valor.titulo !== "string" || !valor.titulo.trim()) {
    return { ok: false, motivo: "anúncio sem 'titulo'", anuncio: null };
  }

  const lista = (campo) => (Array.isArray(valor[campo]) ? valor[campo].map((x) => semEspacos(String(x))).filter(Boolean) : []);
  const anuncio = {
    titulo: semEspacos(valor.titulo),
    resumo: typeof valor.resumo === "string" ? semEspacos(valor.resumo) : "",
    descricao: typeof valor.descricao === "string" ? valor.descricao : "",
    responsabilidades: lista("responsabilidades"),
    requisitos: lista("requisitos"),
    beneficios: lista("beneficios"),
  };

  // O anúncio gerado ainda passa por auditarAnuncio() do ATS antes de publicar:
  // pedir para o modelo não discriminar reduz incidência, não substitui a checagem.
  return { ok: true, motivo: null, anuncio, exigeAuditoria: true };
}
