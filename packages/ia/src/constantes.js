/** Tipos de violação detectados por `auditarPayload`. */
export const TIPO_VIOLACAO = Object.freeze({
  CPF: "CPF",
  CNPJ: "CNPJ",
  PIS: "PIS",
  EMAIL: "EMAIL",
  TELEFONE: "TELEFONE",
  CEP: "CEP",
  URL_PERFIL: "URL_PERFIL",
  DATA_NASCIMENTO: "DATA_NASCIMENTO",
  NOME_PROPRIO: "NOME_PROPRIO",
  DOCUMENTO: "DOCUMENTO",
});

export const PLACEHOLDER = Object.freeze({
  CANDIDATO: "CANDIDATO",
  EMPRESA: "EMPRESA",
  INSTITUICAO: "INSTITUICAO",
  LOCAL: "LOCAL_REMOVIDO",
  REMOVIDO: "[removido]",
});

/**
 * Nomes próprios brasileiros mais frequentes. É uma heurística e tem falso
 * negativo — ver README. Não existe detector determinístico de nome em texto
 * livre sem um modelo de linguagem, e usar um modelo para decidir o que pode
 * ir a outro modelo é circular.
 */
export const NOMES_COMUNS = Object.freeze([
  "maria", "jose", "joao", "ana", "luiz", "luis", "antonio", "francisco", "carlos", "paulo",
  "pedro", "lucas", "gabriel", "rafael", "daniel", "marcelo", "bruno", "eduardo", "felipe", "roberto",
  "anderson", "leonardo", "guilherme", "rodrigo", "tiago", "thiago", "wanderlei", "valdir", "jorge", "sebastiao",
  "julia", "juliana", "camila", "amanda", "bruna", "leticia", "jessica", "fernanda", "patricia", "aline",
  "sandra", "marcia", "marcia", "eliane", "adriana", "simone", "rosana", "vera", "mariana", "renata",
  "tatiane", "vanessa", "viviane", "debora", "silvia", "claudia", "regina", "rosa", "raquel", "eliana",
  "sueli", "solange", "tereza", "terezinha", "izabel", "isabel", "cristina", "cristiane", "daniela", "fabiana",
  "gisele", "gleice", "helena", "ione", "janaina", "joana", "karina", "larissa", "liliane", "lourdes",
  "luciana", "lucia", "luiza", "magda", "mara", "margarete", "marilene", "marli", "marta", "matilde",
  "maura", "michele", "michelle", "miriam", "monica", "nadir", "nair", "natalia", "neide", "neusa",
  "nilza", "noemia", "olga", "olivia", "paloma", "pamela", "paola", "priscila", "rita", "roberta",
  "rosane", "roseli", "rosimar", "rute", "ruthe", "sabrina", "salete", "samanta", "samara", "selma",
  "sergio", "silvana", "sirlene", "sonia", "suelen", "tais", "taise", "talia", "talita", "tamires",
  "tania", "tarcisio", "telma", "valdeci", "valdemar", "valdemir", "valdinei", "valentina", "valeria",
  "vanda", "vanderlei", "vanderleia", "vanderson", "vania", "vera", "veronica", "vicente", "victor", "victoria",
  "vilma", "vinicius", "vitor", "vitoria", "vivian", "walter", "wellington", "wesley", "william", "wilson",
]);

export const NOMES_COMUNS_SET = new Set(NOMES_COMUNS);

/** Características protegidas que o modelo não pode inferir nem usar. */
export const CARACTERISTICAS_PROTEGIDAS = Object.freeze([
  "raça", "cor", "etnia", "gênero", "sexo", "orientação sexual", "identidade de gênero",
  "idade", "data de nascimento", "estado civil", "gravidez", "maternidade", "paternidade",
  "deficiência", "doença", "diagnóstico", "religião", "crença", "convicção política",
  "filiação sindical", "origem nacional", "nacionalidade", "situação financeira",
]);

/**
 * Palavras que indicam que o modelo deixou de apoiar e passou a decidir.
 * `interpretarParecer` recusa a resposta se alguma aparecer.
 */
export const PALAVRAS_DE_REPROVACAO = Object.freeze([
  "reprovado", "reprovada", "reprovar", "eliminar", "eliminado", "eliminada", "eliminação",
  "descartar", "descartado", "descartada", "descarte", "não contratar", "nao contratar",
  "inapto", "inapta", "desqualificado", "desqualificada", "desqualificar", "rejeitar",
  "rejeitado", "rejeitada", "rejeição", "recusar", "recusado", "recusada", "indica contratação imediata",
]);

export const LIMITE_EVIDENCIA = 240;
export const DIVERGENCIA_PADRAO = 20;
