import { criarAvaliacaoDISC } from "./disc.js";
import {
  ESCALA_CONCORDANCIA,
  IDIOMA_INSTRUMENTO_DISC,
  ORDEM_FATORES_DISC,
  TIPO_PAR_CONSISTENCIA,
  VALENCIA_ITEM,
  VERSAO_INSTRUMENTO_DISC,
} from "./constantes.js";

/** Código estável do instrumento padrão. O laudo guarda código + versão. */
export const CODIGO_INSTRUMENTO_DISC = "DISC-PADRAO-LABUTAR";

/**
 * 24 blocos de escolha forçada, 4 palavras por bloco (uma para cada fator),
 * no desenho clássico do PPA/Personal Profile System: metade dos blocos com
 * palavras socialmente desejáveis e metade com palavras indesejáveis.
 *
 * A alternância de valência não é estética. Sem ela, "mais" vira sempre a
 * palavra bonita e o teste passa a medir desejabilidade social em vez de
 * preferência — e o índice de validade fica sem base de comparação.
 */
const TABELA_BLOCOS = [
  ["b01", VALENCIA_ITEM.POSITIVA, { D: "Decidido", I: "Persuasivo", S: "Paciente", C: "Preciso" }],
  ["b02", VALENCIA_ITEM.POSITIVA, { D: "Corajoso", I: "Entusiasmado", S: "Leal", C: "Organizado" }],
  ["b03", VALENCIA_ITEM.POSITIVA, { D: "Direto", I: "Espontâneo", S: "Confiável", C: "Analítico" }],
  ["b04", VALENCIA_ITEM.POSITIVA, { D: "Competitivo", I: "Otimista", S: "Cooperativo", C: "Cauteloso" }],
  ["b05", VALENCIA_ITEM.POSITIVA, { D: "Independente", I: "Comunicativo", S: "Constante", C: "Detalhista" }],
  ["b06", VALENCIA_ITEM.POSITIVA, { D: "Firme", I: "Carismático", S: "Acolhedor", C: "Sistemático" }],
  ["b07", VALENCIA_ITEM.POSITIVA, { D: "Objetivo", I: "Criativo", S: "Diplomático", C: "Rigoroso" }],
  ["b08", VALENCIA_ITEM.POSITIVA, { D: "Determinado", I: "Sociável", S: "Equilibrado", C: "Lógico" }],
  ["b09", VALENCIA_ITEM.POSITIVA, { D: "Audacioso", I: "Entusiasmado", S: "Calmo", C: "Meticuloso" }],
  ["b10", VALENCIA_ITEM.POSITIVA, { D: "Focado em resultado", I: "Articulado", S: "Confiável", C: "Disciplinado" }],
  ["b11", VALENCIA_ITEM.POSITIVA, { D: "Ágil para decidir", I: "Animado", S: "Atencioso", C: "Preciso" }],
  ["b12", VALENCIA_ITEM.POSITIVA, { D: "Persistente", I: "Convincente", S: "Estável", C: "Exato" }],
  ["b13", VALENCIA_ITEM.DESAFIADORA, { D: "Indeciso", I: "Impulsivo", S: "Acomodado", C: "Rígido" }],
  ["b14", VALENCIA_ITEM.DESAFIADORA, { D: "Agressivo", I: "Exagerado", S: "Passivo", C: "Desorganizado" }],
  ["b15", VALENCIA_ITEM.DESAFIADORA, { D: "Intolerante", I: "Superficial", S: "Esquivo", C: "Perfeccionista" }],
  ["b16", VALENCIA_ITEM.DESAFIADORA, { D: "Autoritário", I: "Descuidado", S: "Teimoso", C: "Crítico" }],
  ["b17", VALENCIA_ITEM.DESAFIADORA, { D: "Apressado", I: "Falante", S: "Submisso", C: "Burocrático" }],
  ["b18", VALENCIA_ITEM.DESAFIADORA, { D: "Confrontador", I: "Retraído", S: "Lento", C: "Distante" }],
  ["b19", VALENCIA_ITEM.DESAFIADORA, { D: "Dominador", I: "Inconstante", S: "Ansioso", C: "Inflexível" }],
  ["b20", VALENCIA_ITEM.DESAFIADORA, { D: "Insensível", I: "Instável", S: "Agradador", C: "Formalista" }],
  ["b21", VALENCIA_ITEM.DESAFIADORA, { D: "Disputador", I: "Indisciplinado", S: "Rotineiro", C: "Controlador" }],
  ["b22", VALENCIA_ITEM.DESAFIADORA, { D: "Irrequieto", I: "Exibido", S: "Dependente", C: "Obstinado" }],
  ["b23", VALENCIA_ITEM.DESAFIADORA, { D: "Impetuoso", I: "Afoito", S: "Moroso", C: "Exigente" }],
  ["b24", VALENCIA_ITEM.DESAFIADORA, { D: "Intransigente", I: "Desatento", S: "Inseguro", C: "Apegado a regras" }],
];

/**
 * Itens de controle, técnica dos manuais do PPA e do Extended DISC.
 * REPETIDA: a mesma palavra volta em outro bloco — quem responde com atenção
 * marca o mesmo lado. OPOSTA: antônimos do mesmo fator — quem responde com
 * atenção marca lados contrários. Contradição aqui derruba o índice de
 * consistência e o laudo sai marcado, em vez de sair um perfil inventado.
 */
const PARES_CONSISTENCIA = [
  { par: "op1", tipoPar: TIPO_PAR_CONSISTENCIA.OPOSTA, a: "b01/D", b: "b13/D" },
  { par: "op2", tipoPar: TIPO_PAR_CONSISTENCIA.OPOSTA, a: "b08/I", b: "b18/I" },
  { par: "op3", tipoPar: TIPO_PAR_CONSISTENCIA.OPOSTA, a: "b09/S", b: "b19/S" },
  { par: "op4", tipoPar: TIPO_PAR_CONSISTENCIA.OPOSTA, a: "b02/C", b: "b14/C" },
  { par: "rp1", tipoPar: TIPO_PAR_CONSISTENCIA.REPETIDA, a: "b03/S", b: "b10/S" },
  { par: "rp2", tipoPar: TIPO_PAR_CONSISTENCIA.REPETIDA, a: "b01/C", b: "b11/C" },
  { par: "rp3", tipoPar: TIPO_PAR_CONSISTENCIA.REPETIDA, a: "b02/I", b: "b09/I" },
];

/**
 * Parte normativa do instrumento. Escolha forçada mede preferência relativa
 * (ipsativa) e não compara duas pessoas entre si; a escala de concordância
 * devolve um 0–100 por fator que permite comparar candidatos e cruzar com o
 * benchmark da vaga. Divergência grande entre as duas partes é sinal de alerta,
 * não de empate técnico.
 */
const TABELA_DECLARACOES = [
  ["e01", "D", "Tomo decisão rápido, mesmo com informação incompleta.", false],
  ["e02", "D", "Prefiro ceder a insistir quando alguém discorda de mim.", true],
  ["e03", "D", "Assumo a frente quando o assunto trava.", false],
  ["e04", "I", "Falo com facilidade em grupo e com pessoas que acabei de conhecer.", false],
  ["e05", "I", "Rendo mais trabalhando sozinho do que em meio a muita gente.", true],
  ["e06", "I", "Uso entusiasmo para convencer os outros de uma ideia.", false],
  ["e07", "S", "Mantenho o mesmo ritmo de entrega mesmo em semana difícil.", false],
  ["e08", "S", "Gosto de trocar de atividade várias vezes ao longo do dia.", true],
  ["e09", "S", "Prefiro ambiente previsível a ambiente em constante mudança.", false],
  ["e10", "C", "Confiro o trabalho antes de entregar e me incomodo com erro de detalhe.", false],
  ["e11", "C", "Improviso a solução na hora em vez de seguir o procedimento.", true],
  ["e12", "C", "Decido com base em dado e evidência, não em impressão.", false],
];

function montarPares() {
  const porPosicao = new Map();
  for (const par of PARES_CONSISTENCIA) {
    for (const ponta of [par.a, par.b]) {
      const [bloco, fator] = ponta.split("/");
      porPosicao.set(`${bloco}/${fator}`, { par: par.par, tipoPar: par.tipoPar });
    }
  }
  return porPosicao;
}

const PARES_POR_POSICAO = montarPares();

function montarQuestoes() {
  return TABELA_BLOCOS.map(([id, valencia, palavras]) => ({
    id,
    valencia,
    alternativas: ORDEM_FATORES_DISC.map((fator) => {
      const controle = PARES_POR_POSICAO.get(`${id}/${fator}`);
      return {
        id: `${id}-${fator}`,
        texto: palavras[fator],
        fator,
        ...(controle ?? {}),
      };
    }),
  }));
}

function montarDeclaracoes() {
  return TABELA_DECLARACOES.map(([id, fator, texto, reversa]) =>
    Object.freeze({ id, fator, texto, reversa })
  );
}

/** Blocos de escolha forçada já no formato aceito por `criarAvaliacaoDISC`. */
export function blocosInstrumentoDISC() {
  return montarQuestoes();
}

/** Declarações da escala de concordância (1 a 5), uma por linha. */
export function declaracoesInstrumentoDISC() {
  return montarDeclaracoes();
}

export const INSTRUCOES_ESCALA_DISC =
  "Agora indique quanto cada afirmação descreve você no trabalho. Responda como você é, não como gostaria de ser.";

/**
 * Instrumento completo: escolha forçada + escala de concordância + metadados
 * de versão. É o objeto que vai para o Firestore em
 * `tenants/{tenantId}/avaliacoes/{avaliacaoId}`.
 */
export function criarInstrumentoDISC({ versao = VERSAO_INSTRUMENTO_DISC, idioma = IDIOMA_INSTRUMENTO_DISC } = {}) {
  const forcada = criarAvaliacaoDISC({
    titulo: "Perfil Comportamental DISC",
    instrucoes:
      "Em cada questão, marque a palavra que MAIS descreve você no trabalho e a que MENOS descreve você. " +
      "Escolha como você realmente é, não como gostaria de ser: não existe resposta certa.",
    questoes: montarQuestoes(),
  });

  return {
    ...forcada,
    codigoInstrumento: CODIGO_INSTRUMENTO_DISC,
    versao,
    idioma,
    formato: Object.freeze(["ESCOLHA_FORCADA", "ESCALA_CONCORDANCIA"]),
    escala: Object.freeze({
      tipo: "CONCORDANCIA",
      minima: ESCALA_CONCORDANCIA.minima,
      maxima: ESCALA_CONCORDANCIA.maxima,
      neutra: ESCALA_CONCORDANCIA.neutra,
      rotulos: { ...ESCALA_CONCORDANCIA.rotulos },
      instrucoes: INSTRUCOES_ESCALA_DISC,
      declaracoes: montarDeclaracoes(),
      totalDeclaracoes: TABELA_DECLARACOES.length,
    }),
    tempoEstimadoMinutos: 10,
  };
}

/**
 * Tradução do instrumento é mudança de versão, não de parâmetro solto: cada
 * idioma exige revalidação (invariância de medida). Aqui fica o gancho para o
 * en/es, com erro explícito enquanto não houver tabela validada — o mesmo
 * princípio aplicado ao eSocial: nunca deixar stub que pareça funcionar.
 */
export function criarInstrumentoDISCTraduzido(idioma) {
  const suportados = [IDIOMA_INSTRUMENTO_DISC];
  if (!suportados.includes(String(idioma ?? ""))) {
    throw new Error(
      `instrumento DISC no idioma "${idioma ?? ""}" ainda não foi validado. Idiomas disponíveis: ${suportados.join(", ")}. ` +
        "Traduzir sem revalidar as normas por idioma gera perfil não comparável."
    );
  }
  return criarInstrumentoDISC({ idioma });
}
