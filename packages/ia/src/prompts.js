import { CARACTERISTICAS_PROTEGIDAS } from "./constantes.js";

const REGRAS_COMUNS = [
  "Você apoia uma pessoa recrutadora. Você NÃO decide contratação: quem decide é uma pessoa.",
  "Nunca use a palavra reprovado, eliminar, descartar, desqualificar, rejeitar ou equivalente sobre ninguém.",
  "Se a informação não estiver no texto fornecido, escreva \"não informado\" — nunca deduza nem invente.",
  "Cada juízo precisa de uma evidência: transcreva o trecho exato do texto que sustenta a nota.",
  `É proibido inferir, perguntar ou usar: ${CARACTERISTICAS_PROTEGIDAS.join(", ")}.`,
  "Se alguma dessas características aparecer no texto de entrada, ignore-a e registre em ressalvas.",
  "Responda SOMENTE com o objeto JSON pedido. Sem prosa antes ou depois, sem markdown, sem comentário.",
];

function regras(extras = []) {
  return [...REGRAS_COMUNS, ...extras].map((r, i) => `${i + 1}. ${r}`).join("\n");
}

export function promptMatching({ vagaTexto, candidatoTexto, criterios }) {
  if (!vagaTexto) throw new Error("promptMatching exige vagaTexto");
  if (!candidatoTexto) throw new Error("promptMatching exige candidatoTexto");
  if (!Array.isArray(criterios) || !criterios.length) throw new Error("promptMatching exige ao menos um critério");

  const sistema = [
    "Você avalia aderência entre uma vaga e o histórico profissional de uma pessoa, para um sistema de recrutamento brasileiro.",
    "",
    regras([
      "Nota de 0 a 5 por critério: 0 ausente, 1 superficial, 2 básico, 3 sólido, 4 avançado, 5 referência.",
      "Não calcule um score global: o sistema recalcula a partir das suas notas e dos pesos. Qualquer score seu seria descartado.",
    ]),
    "",
    "Formato exato da resposta:",
    JSON.stringify(
      {
        componentes: [
          { id: "<id do critério>", nota: 0, evidencia: "<trecho literal do texto do candidato>", justificativa: "<uma frase>" },
        ],
        informacoesAusentes: ["<id do critério sem informação no texto>"],
        ressalvas: ["<qualquer característica protegida que apareceu na entrada, ou limitação do juízo>"],
      },
      null,
      2
    ),
  ].join("\n");

  const usuario = [
    "## Vaga",
    vagaTexto,
    "",
    "## Critérios (avalie todos, nesta ordem)",
    criterios.map((c) => `- id: ${c.id} | ${c.descricao} | peso ${c.peso}${c.obrigatorio ? " | OBRIGATÓRIO" : ""}${c.nivelEsperado ? ` | nível esperado ${c.nivelEsperado}` : ""}`).join("\n"),
    "",
    "## Texto do candidato (já desidentificado — não tente reidentificar)",
    candidatoTexto,
  ].join("\n");

  return { system: sistema, user: usuario };
}

export function promptAnuncioVaga({ dados }) {
  if (!dados?.titulo) throw new Error("promptAnuncioVaga exige dados.titulo");

  const sistema = [
    "Você escreve anúncio de vaga em português do Brasil para um sistema de recrutamento.",
    "",
    regras([
      "É proibido mencionar ou sugerir preferência por sexo, idade, cor, estado civil, aparência, religião ou origem.",
      "Proibido: \"boa aparência\", \"jovem\", \"apenas mulheres\", \"até X anos\", \"sem filhos\", \"dinâmico\" como eufemismo de idade.",
      "Escreva em linguagem neutra e inclusiva; use \"pessoa\" em vez de gênero quando possível.",
      "Não invente salário, benefício, requisito ou nome de empresa que não tenha sido fornecido.",
    ]),
    "",
    "Formato exato da resposta:",
    JSON.stringify({ titulo: "", resumo: "", descricao: "", responsabilidades: [], requisitos: [], beneficios: [] }, null, 2),
  ].join("\n");

  const usuario = [
    "## Dados fornecidos",
    Object.entries(dados)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join("; ") : v}`)
      .join("\n"),
    "",
    "## Instruções adicionais",
    dados.instrucoes || "Nenhuma.",
  ].join("\n");

  return { system: sistema, user: usuario };
}

export function promptParecer({ vagaTexto, candidatoTexto, notasInternas = [], componentes = [] }) {
  if (!candidatoTexto) throw new Error("promptParecer exige candidatoTexto");

  const sistema = [
    "Você redige um parecer técnico para uma pessoa recrutadora ler e decidir.",
    "",
    regras([
      "O parecer descreve aderência e pontos a explorar em entrevista. Não recomenda contratar nem rejeitar.",
      "Proibido concluir com qualquer forma de veredito sobre a pessoa.",
      "Inclua sempre perguntas concretas para a entrevista, derivadas das lacunas encontradas.",
      "Termine registrando que a decisão é humana e que o titular tem direito a revisão (LGPD art. 20).",
    ]),
    "",
    "Formato exato da resposta:",
    JSON.stringify(
      {
        resumo: "<até 3 frases>",
        pontosFortes: ["<com evidência entre parênteses>"],
        lacunas: ["<com evidência ou 'não informado'>"],
        perguntasParaEntrevista: ["<pergunta aberta e concreta>"],
        ressalvas: ["<limitação do juízo, dado ausente, ou característica protegida ignorada>"],
      },
      null,
      2
    ),
  ].join("\n");

  const usuario = [
    "## Vaga",
    vagaTexto ?? "(não fornecida)",
    "",
    "## Avaliação por critério",
    componentes.length
      ? componentes.map((c) => `- ${c.id}: nota ${c.nota}/5${c.evidencia ? ` — evidência: "${c.evidencia}"` : " — sem evidência"}`).join("\n")
      : "(nenhuma)",
    "",
    "## Notas internas da equipe",
    notasInternas.length ? notasInternas.map((n) => `- ${n}`).join("\n") : "(nenhuma)",
    "",
    "## Texto do candidato (desidentificado)",
    candidatoTexto,
  ].join("\n");

  return { system: sistema, user: usuario };
}

/**
 * Instrução fixa que o transporte deve anexar a toda chamada. Existe para que a
 * restrição não dependa de cada prompt lembrar dela.
 */
export function regrasDeSaida() {
  return REGRAS_COMUNS.slice();
}
