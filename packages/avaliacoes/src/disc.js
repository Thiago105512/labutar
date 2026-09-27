import { novoId } from "../../core/src/ids.js";
import { arredondar } from "../../core/src/dinheiro.js";
import { hoje } from "../../core/src/datas.js";
import {
  NOME_FATOR_DISC,
  ORDEM_FATORES_DISC,
  RESSALVAS_DISC,
  TIPO_PAR_CONSISTENCIA,
  VALENCIA_ITEM,
} from "./constantes.js";

const FATORES_VALIDOS = new Set(ORDEM_FATORES_DISC);
const INDICE_ORDEM = Object.fromEntries(ORDEM_FATORES_DISC.map((fator, indice) => [fator, indice]));

function texto(valor) {
  return valor === null || valor === undefined ? "" : String(valor).trim();
}

function identificador(valor) {
  return valor === null || valor === undefined ? "" : String(valor).trim();
}

function contarZerado() {
  return { D: 0, I: 0, S: 0, C: 0 };
}

function definirPerfil(codigo, titulo, resumo, forcas, desafios, papeisSugeridos) {
  return Object.freeze({
    codigo,
    titulo,
    resumo,
    forcas: Object.freeze(forcas),
    desafios: Object.freeze(desafios),
    papeisSugeridos: Object.freeze(papeisSugeridos),
  });
}

/**
 * Os 16 códigos de 1 e 2 letras (4 simples + 12 combinações ordenadas).
 * A ordem das letras importa: "DI" decide primeiro e comunica depois,
 * "ID" comunica primeiro e decide depois.
 */
export const PERFIS_DISC = Object.freeze({
  D: definirPerfil(
    "D",
    "Realizador direto",
    "Perfil voltado a resultado, desafio e autonomia. Decide rápido, assume a frente quando o assunto trava e comunica de forma objetiva, com pouca paciência para lentidão e rodeios.",
    [
      "Decisão rápida em cenário de pressão e ambiguidade",
      "Foco em meta, prazo e resultado mensurável",
      "Coragem para assumir risco calculado e defender posição",
      "Autonomia para tocar projeto sem supervisão constante",
    ],
    [
      "Pode atropelar pessoas e etapas para chegar logo ao resultado",
      "Baixa tolerância a detalhe, rotina e trabalho repetitivo",
      "Tendência a centralizar decisões e revisar o que os outros fizeram",
      "Comunicação dura em momento de tensão, o que desgasta o time",
    ],
    [
      "Liderança de time comercial e de metas agressivas",
      "Gestão de projeto crítico ou em recuperação",
      "Novos negócios e empreendedorismo interno",
      "Cargo de decisão com forte cobrança por resultado",
    ]
  ),
  I: definirPerfil(
    "I",
    "Comunicador persuasivo",
    "Perfil voltado a gente, visibilidade e novidade. Convence pelo entusiasmo, cria vínculo rápido e improvisa bem diante do imprevisto, mas perde fôlego em controle e registro.",
    [
      "Comunicação clara, envolvente e adequada a cada público",
      "Construção rápida de relacionamento e de confiança",
      "Otimismo que mobiliza o time em fase difícil",
      "Criatividade para propor caminhos e apresentar soluções",
    ],
    [
      "Dificuldade com prazo longo, planilha e registro de informação",
      "Tendência a prometer mais do que consegue entregar",
      "Desconforto com rotina, auditoria e tarefa repetitiva",
      "Decisão por impulso em contexto social, para não frustrar ninguém",
    ],
    [
      "Vendas consultivas, pré-vendas e negociação",
      "Recrutamento, seleção e employer branding",
      "Treinamento, desenvolvimento e cultura",
      "Atendimento, sucesso do cliente e relacionamento",
    ]
  ),
  S: definirPerfil(
    "S",
    "Sustentador consistente",
    "Perfil voltado a estabilidade, cooperação e rotina previsível. Cumpre o combinado, escuta bem e segura a operação no dia a dia, preferindo mudança anunciada com antecedência.",
    [
      "Constância: entrega o combinado no prazo, semana após semana",
      "Escuta ativa e apoio real aos colegas",
      "Execução confiável de processo e de rotina",
      "Paciência em atendimento e projeto de ciclo longo",
    ],
    [
      "Resistência a mudança brusca e a reorganização repentina",
      "Dificuldade em dizer não, acumulando demanda",
      "Evita confronto mesmo quando a conversa é necessária",
      "Pode adiar decisão esperando consenso que não vem",
    ],
    [
      "Operação, backoffice e suporte interno",
      "Atendimento ao cliente e pós-venda",
      "Rotinas de departamento pessoal e administração",
      "Saúde, segurança do trabalho e qualidade de vida",
    ]
  ),
  C: definirPerfil(
    "C",
    "Analista preciso",
    "Perfil voltado a padrão, dado e qualidade. Questiona antes de aceitar, prefere instrução clara e mensurável e se incomoda com decisão tomada no improviso.",
    [
      "Rigor técnico e atenção a detalhe que outros deixam passar",
      "Organização de processo, documentação e evidência",
      "Decisão apoiada em dado e em método",
      "Aderência a norma, política e compliance",
    ],
    [
      "Perfeccionismo que atrasa a entrega",
      "Trava quando a informação chega incompleta",
      "Comunicação técnica demais para público leigo",
      "Crítica direta ao trabalho alheio, lida como dureza",
    ],
    [
      "Controladoria, fiscal e contabilidade",
      "Qualidade, compliance e auditoria",
      "Engenharia e desenvolvimento de software",
      "Jurídico, análise de risco e dados",
    ]
  ),
  DI: definirPerfil(
    "DI",
    "Executor que mobiliza",
    "Dominância à frente, influência logo atrás: quer o resultado e usa a comunicação como alavanca para obtê-lo. Convence o time a ir junto em vez de apenas determinar.",
    [
      "Une decisão rápida com capacidade de arrastar pessoas",
      "Negocia bem sob pressão, sem perder o foco na meta",
      "Abre caminho em ambiente novo e com regra ainda indefinida",
      "Cobra resultado de forma direta, mas com energia positiva",
    ],
    [
      "Impaciência dupla: com lentidão e com excesso de detalhe",
      "Pode prometer prazo que o time não consegue cumprir",
      "Registro e documentação ficam em segundo plano",
      "Quando contrariado, o tom sobe rápido",
    ],
    [
      "Liderança comercial e de growth",
      "Gestão de conta estratégica e negociação",
      "Coordenação de projeto com muitas partes interessadas",
      "Direção de unidade ou operação nova",
    ]
  ),
  ID: definirPerfil(
    "ID",
    "Articulador com apetite de decisão",
    "Influência à frente, dominância em apoio: conquista o interlocutor primeiro e empurra para a ação depois. Prefere convencer a impor, mas não foge de decidir.",
    [
      "Carisma combinado com disposição para assumir responsabilidade",
      "Transita bem entre áreas e níveis hierárquicos",
      "Vende ideia difícil para público resistente",
      "Reage rápido quando o cenário muda",
    ],
    [
      "Risco de decidir para encerrar logo a conversa",
      "Detalhe operacional e follow-up ficam descobertos",
      "Dificuldade em manter rotina administrativa",
      "Pode parecer expansivo demais em ambiente formal",
    ],
    [
      "Desenvolvimento de negócios e parcerias",
      "Relações institucionais e representação da empresa",
      "Vendas complexas e key account",
      "Gestão de pessoas em time comercial",
    ]
  ),
  DS: definirPerfil(
    "DS",
    "Comando firme e constante",
    "Dominância sustentada pela estabilidade: cobra resultado, mas dentro de um ritmo previsível. Funciona melhor quando pode construir em cima de uma base que já existe.",
    [
      "Cobrança firme e, ao mesmo tempo, previsível para o time",
      "Sustenta a operação enquanto persegue a meta",
      "Lealdade ao grupo e senso de responsabilidade de longo prazo",
      "Mantém a calma em rotina pesada",
    ],
    [
      "Resistência a mudar o que já está funcionando",
      "Pode acumular tensão em vez de dar feedback cedo",
      "Pouca tolerância a improviso e a regra nova repentina",
      "Demora a reconhecer que o modelo atual esgotou",
    ],
    [
      "Gerência de operação e produção",
      "Supervisão de time com processo consolidado",
      "Logística e cadeia de suprimentos",
      "Gestão de facilities e serviços contínuos",
    ]
  ),
  SD: definirPerfil(
    "SD",
    "Estabilidade que assume quando precisa",
    "Estabilidade à frente, dominância em apoio: prefere manter o ritmo do grupo, mas toma a frente quando a situação exige proteção do time ou do resultado.",
    [
      "Preserva o clima e a continuidade mesmo sob cobrança",
      "Assume o comando em crise sem abandonar a rotina",
      "Decisão ponderada, apoiada no histórico do grupo",
      "Gera confiança em quem trabalha ao lado",
    ],
    [
      "Só age depois de esgotar o caminho do consenso",
      "Pode segurar decisão impopular tempo demais",
      "Dificuldade em delegar quando o prazo aperta",
      "Conflito aberto gera desgaste desproporcional",
    ],
    [
      "Coordenação de equipe e supervisão de turno",
      "Gestão de atendimento e de serviço contínuo",
      "Recursos humanos e relações trabalhistas",
      "Liderança técnica em time maduro",
    ]
  ),
  DC: definirPerfil(
    "DC",
    "Decisor exigente",
    "Dominância apoiada em conformidade: quer resultado, mas dentro do padrão correto. Cobra com critério técnico e aceita argumento bem fundamentado.",
    [
      "Combina meta ambiciosa com exigência de qualidade",
      "Decisão rápida sustentada por dado",
      "Identifica risco e falha de processo antes de virar problema",
      "Credibilidade técnica junto ao time",
    ],
    [
      "Nível de exigência alto demais para o dia a dia do time",
      "Pouca paciência com quem não trouxe número",
      "Comunicação seca, lida como desvalorização",
      "Pode travar entrega em busca da versão perfeita",
    ],
    [
      "Gestão de engenharia, produto e TI",
      "Controladoria, planejamento e inteligência de negócio",
      "Qualidade, segurança e compliance",
      "Direção técnica e arquitetura de solução",
    ]
  ),
  CD: definirPerfil(
    "CD",
    "Autoridade técnica",
    "Conformidade à frente, dominância em apoio: define o padrão e cobra que seja seguido. Sua autoridade vem do domínio do assunto, não do cargo.",
    [
      "Define método, critério de aceite e padrão de qualidade",
      "Sustenta posição técnica mesmo sob pressão hierárquica",
      "Documenta e organiza conhecimento da área",
      "Reduz retrabalho e erro operacional",
    ],
    [
      "Tende a centralizar a definição técnica",
      "Desconforto em negociar com quem não domina o assunto",
      "Pode subestimar o lado humano da mudança",
      "Dificuldade em aceitar solução boa, porém imperfeita",
    ],
    [
      "Liderança técnica e arquitetura",
      "Auditoria, perícia e análise de risco",
      "Jurídico contencioso e consultivo",
      "Responsável técnico de área regulada",
    ]
  ),
  IS: definirPerfil(
    "IS",
    "Relacionamento acolhedor",
    "Influência apoiada em estabilidade: cria vínculo, mantém o grupo unido e comunica com leveza. Prefere consenso a disputa e evita conflito aberto.",
    [
      "Ambiente de trabalho leve e cooperativo",
      "Boa leitura emocional do time e do cliente",
      "Comunicação acessível e didática",
      "Constância no relacionamento de longo prazo",
    ],
    [
      "Evita conversa difícil e feedback corretivo",
      "Dificuldade em cobrar prazo de quem gosta",
      "Pode assumir demanda extra para não desagradar",
      "Mudança rápida gera insegurança visível",
    ],
    [
      "Atendimento, suporte e experiência do cliente",
      "Recrutamento, onboarding e cultura",
      "Treinamento e desenvolvimento de pessoas",
      "Secretariado, recepção e serviços internos",
    ]
  ),
  SI: definirPerfil(
    "SI",
    "Apoio comunicativo",
    "Estabilidade à frente, influência em apoio: confiável na rotina, sociável na medida. Fala bem com o público sem precisar ser o centro da conversa.",
    [
      "Constância com boa habilidade de relacionamento",
      "Explica processo e orienta colega com paciência",
      "Mantém o clima estável em período de pressão",
      "Cumpre prazo sem abrir mão do cuidado com a pessoa",
    ],
    [
      "Demora a se posicionar em conflito entre áreas",
      "Resistência a meta agressiva e a mudança abrupta",
      "Tende a evitar exposição, mesmo quando seria útil",
      "Pode aceitar demanda além da capacidade",
    ],
    [
      "Atendimento de longo ciclo e carteira de cliente",
      "Assistente e analista de rotina com interface externa",
      "Saúde ocupacional e bem-estar",
      "Suporte técnico ao usuário",
    ]
  ),
  IC: definirPerfil(
    "IC",
    "Comunicador estruturado",
    "Influência apoiada em conformidade: apresenta bem porque estuda antes. Traduz o assunto técnico em mensagem clara, com menos improvisação que o perfil I puro.",
    [
      "Comunicação preparada, com dado e exemplo",
      "Organiza e documenta o que apresenta",
      "Transita entre área técnica e público leigo",
      "Credibilidade sem exposição excessiva",
    ],
    [
      "Preparação demais pode atrasar a entrega",
      "Desconforto em improvisar resposta na hora",
      "Autocrítica alta em apresentação que considera fraca",
      "Pode evitar conflito direto mesmo com argumento pronto",
    ],
    [
      "Treinamento técnico e educação corporativa",
      "Marketing de conteúdo e comunicação interna",
      "Pré-vendas técnico e solution consultant",
      "Análise de dados com interface de negócio",
    ]
  ),
  CI: definirPerfil(
    "CI",
    "Analista que sabe explicar",
    "Conformidade à frente, influência em apoio: rigor técnico com capacidade de comunicar a conclusão. Convence pelo argumento bem construído.",
    [
      "Analisa com profundidade e consegue apresentar o resultado",
      "Argumentação fundamentada, útil em comitê e auditoria",
      "Documenta processo e dissemina o padrão na área",
      "Equilíbrio entre cautela técnica e articulação",
    ],
    [
      "Perfeccionismo na análise atrasa a comunicação",
      "Prefere escrever a falar de improviso",
      "Pode expor demais a fragilidade de um plano",
      "Desconforto em ambiente de decisão política",
    ],
    [
      "Compliance, riscos e controles internos",
      "Business intelligence e análise de indicadores",
      "Consultoria técnica e implantação de sistema",
      "Jurídico consultivo e regulatório",
    ]
  ),
  SC: definirPerfil(
    "SC",
    "Operador metódico",
    "Estabilidade apoiada em conformidade: executa a rotina com padrão e cuidado. Confiável em tarefa que exige repetição sem erro.",
    [
      "Precisão em rotina, conferência e registro",
      "Cumprimento de norma e de procedimento interno",
      "Discrição e confiabilidade no trato de informação",
      "Ritmo constante, sem sobressalto",
    ],
    [
      "Forte resistência a mudança de procedimento",
      "Demora a decidir sem instrução completa",
      "Pouca iniciativa para propor melhoria no processo",
      "Dificuldade em lidar com público em conflito",
    ],
    [
      "Departamento pessoal, folha e benefícios",
      "Financeiro: contas a pagar, receber e conciliação",
      "Arquivo, documentação e almoxarifado",
      "Controle de qualidade e inspeção",
    ]
  ),
  CS: definirPerfil(
    "CS",
    "Padronizador",
    "Conformidade à frente, estabilidade em apoio: cria o procedimento e garante que ele seja mantido. Trabalha melhor com escopo definido e tempo para aprofundar.",
    [
      "Constrói e mantém padrão, checklist e manual",
      "Detecta desvio e inconsistência com rapidez",
      "Trabalho de qualidade estável ao longo do tempo",
      "Boa aderência a ambiente regulado",
    ],
    [
      "Rigidez quando a exceção é legítima",
      "Pouca exposição e dificuldade de se autopromover",
      "Retrabalho quando o requisito muda no meio",
      "Pode segurar informação por excesso de zelo",
    ],
    [
      "Fiscal, contábil e tributário",
      "Gestão de qualidade e certificação",
      "Segurança da informação e LGPD operacional",
      "Engenharia de processo e melhoria contínua",
    ]
  ),
});

function normalizarFator(valor, contexto) {
  const fator = texto(valor).toUpperCase();
  if (!FATORES_VALIDOS.has(fator)) {
    throw new Error(
      `${contexto}: fator inválido "${valor ?? ""}". Use D (Dominância), I (Influência), S (Estabilidade) ou C (Conformidade)`
    );
  }
  return fator;
}

/**
 * Valência do bloco. `null` quando não informada: o índice de desejabilidade
 * social é então omitido em vez de calculado sobre suposição.
 */
function normalizarValencia(valor) {
  const valencia = texto(valor).toUpperCase();
  if (!valencia) return null;
  if (!Object.values(VALENCIA_ITEM).includes(valencia)) {
    throw new Error(
      `valência inválida "${valor}". Use ${VALENCIA_ITEM.POSITIVA} (palavra desejável) ou ${VALENCIA_ITEM.DESAFIADORA} (palavra indesejável)`
    );
  }
  return valencia;
}

function normalizarTipoPar(valor, contexto) {
  const tipo = texto(valor).toUpperCase();
  if (!Object.values(TIPO_PAR_CONSISTENCIA).includes(tipo)) {
    throw new Error(
      `${contexto}: 'tipoPar' inválido "${valor ?? ""}". Use ${TIPO_PAR_CONSISTENCIA.REPETIDA} (mesma palavra, mesmo lado esperado) ou ${TIPO_PAR_CONSISTENCIA.OPOSTA} (antônimos, lados opostos esperados)`
    );
  }
  return tipo;
}

function normalizarAlternativa(alternativa, contexto, idsVistos) {
  if (!alternativa || typeof alternativa !== "object" || Array.isArray(alternativa)) {
    throw new Error(`${contexto}: alternativa deve ser um objeto com id, texto e fator`);
  }
  const id = identificador(alternativa.id);
  if (!id) throw new Error(`${contexto}: alternativa sem 'id'`);
  if (idsVistos.has(id)) {
    throw new Error(`${contexto}: id de alternativa duplicado "${id}". Ids devem ser únicos em toda a avaliação`);
  }
  idsVistos.add(id);

  const textoAlternativa = texto(alternativa.texto);
  if (!textoAlternativa) throw new Error(`Alternativa "${id}": 'texto' obrigatório`);

  return {
    id,
    texto: textoAlternativa,
    fator: normalizarFator(alternativa.fator, `Alternativa "${id}"`),
    // Itens de controle de consistência: preservados porque o cálculo de
    // validade precisa reconhecer a mesma palavra (ou seu antônimo) em outro
    // bloco. Quem não usa item de controle simplesmente não os informa.
    ...(identificador(alternativa.par)
      ? {
          par: identificador(alternativa.par),
          tipoPar: normalizarTipoPar(alternativa.tipoPar ?? TIPO_PAR_CONSISTENCIA.REPETIDA, `Alternativa "${id}"`),
        }
      : {}),
  };
}

/**
 * Valida e normaliza um conjunto de questões DISC no formato de escolha
 * forçada (mais/menos): cada questão tem exatamente 4 alternativas, cada uma
 * ligada a um fator. Erros de montagem são rejeitados aqui, na criação —
 * nunca no cálculo, para não silenciar questionário mal montado.
 */
export function criarAvaliacaoDISC({ titulo = null, instrucoes = null, questoes } = {}) {
  if (!Array.isArray(questoes) || questoes.length === 0) {
    throw new Error("criarAvaliacaoDISC exige 'questoes' como lista com ao menos uma questão");
  }

  const idsQuestoes = new Set();
  const idsAlternativas = new Set();
  const avisos = [];

  const normalizadas = questoes.map((questao, indice) => {
    const contexto = `Questão ${indice + 1}`;
    if (!questao || typeof questao !== "object" || Array.isArray(questao)) {
      throw new Error(`${contexto}: deve ser um objeto com id e alternativas`);
    }

    const id = identificador(questao.id);
    if (!id) throw new Error(`${contexto}: 'id' obrigatório`);
    if (idsQuestoes.has(id)) throw new Error(`Id de questão duplicado: "${id}"`);
    idsQuestoes.add(id);

    if (!Array.isArray(questao.alternativas) || questao.alternativas.length !== 4) {
      const recebidas = Array.isArray(questao.alternativas) ? questao.alternativas.length : 0;
      throw new Error(
        `Questão "${id}": o formato mais/menos exige exatamente 4 alternativas (recebidas: ${recebidas})`
      );
    }

    const alternativas = questao.alternativas.map((alternativa, i) =>
      normalizarAlternativa(alternativa, `Questão "${id}", alternativa ${i + 1}`, idsAlternativas)
    );

    const fatores = alternativas.map((a) => a.fator);
    const distintos = new Set(fatores);
    if (distintos.size !== ORDEM_FATORES_DISC.length) {
      // Não é erro: existem variantes do DISC com dois itens do mesmo fator.
      // Fica como aviso porque desequilibra a base de comparação entre fatores.
      avisos.push(
        `Questão "${id}": alternativas não cobrem os quatro fatores (fatores usados: ${fatores.join(", ")})`
      );
    }

    return {
      id,
      enunciado: texto(questao.enunciado) || null,
      valencia: normalizarValencia(questao.valencia),
      alternativas,
      fatores: [...distintos].sort((a, b) => INDICE_ORDEM[a] - INDICE_ORDEM[b]),
    };
  });

  return {
    id: novoId("DISC"),
    tipo: "DISC",
    titulo: texto(titulo) || "Avaliação DISC",
    instrucoes:
      texto(instrucoes) ||
      "Em cada questão, marque a alternativa que MAIS descreve você e a que MENOS descreve você.",
    questoes: normalizadas,
    totalQuestoes: normalizadas.length,
    avisos,
    ressalvas: [...RESSALVAS_DISC],
    criadoEm: hoje(),
  };
}

function mapaQuestoes(avaliacao) {
  if (!avaliacao || !Array.isArray(avaliacao.questoes) || avaliacao.questoes.length === 0) {
    throw new Error("avaliação DISC inválida: use criarAvaliacaoDISC() para montar o questionário");
  }
  return new Map(avaliacao.questoes.map((questao) => [questao.id, questao]));
}

/**
 * Confere as respostas sem calcular nada: separa o que falta (pendentes) do que
 * está malformado (invalidas). `mais === menos` é autocontradição e nunca entra
 * na conta — responder a mesma coisa nas duas pontas não mede preferência.
 */
export function responderDISC(avaliacao, respostas = []) {
  const questoes = mapaQuestoes(avaliacao);
  if (!Array.isArray(respostas)) {
    throw new Error("'respostas' deve ser uma lista de { questaoId, mais, menos }");
  }

  const invalidas = [];
  const porQuestao = new Map();

  for (const resposta of respostas) {
    const questaoId = identificador(resposta?.questaoId);
    const questao = questoes.get(questaoId);
    if (!questao) {
      invalidas.push({ questaoId: questaoId || null, motivo: "questão não encontrada na avaliação" });
      continue;
    }

    const mais = identificador(resposta.mais);
    const menos = identificador(resposta.menos);
    if (!mais || !menos) {
      invalidas.push({ questaoId, motivo: "resposta sem 'mais' ou sem 'menos'" });
      continue;
    }
    if (mais === menos) {
      invalidas.push({ questaoId, motivo: "'mais' e 'menos' não podem ser a mesma alternativa" });
      continue;
    }

    const ids = new Set(questao.alternativas.map((a) => a.id));
    if (!ids.has(mais)) {
      invalidas.push({ questaoId, motivo: `alternativa "${mais}" não pertence à questão` });
      continue;
    }
    if (!ids.has(menos)) {
      invalidas.push({ questaoId, motivo: `alternativa "${menos}" não pertence à questão` });
      continue;
    }

    // Última resposta válida vence: permite ao candidato mudar de ideia.
    porQuestao.set(questaoId, { questaoId, mais, menos });
  }

  const pendentes = [];
  const validas = [];
  for (const questao of avaliacao.questoes) {
    const resposta = porQuestao.get(questao.id);
    if (resposta) validas.push(resposta);
    else pendentes.push(questao.id);
  }

  return {
    completo: pendentes.length === 0 && invalidas.length === 0,
    totalQuestoes: avaliacao.questoes.length,
    respondidas: validas.length,
    pendentes,
    invalidas,
    validas,
  };
}

function percentual(contagem, base) {
  return base > 0 ? arredondar((contagem / base) * 100, 2) : 0;
}

/**
 * Perfil líquido: o "menos" pode ser negativo, então a escala 0–100 coloca 50
 * como ponto neutro. Usar `liquido / total` direto daria percentual negativo,
 * que quebra qualquer gráfico de barra.
 */
function percentualLiquido(liquido, base) {
  return base > 0 ? arredondar(((liquido / base + 1) / 2) * 100, 2) : 50;
}

/**
 * Calcula os três perfis clássicos: bruto (escolhas "mais"), menos/pressão
 * (escolhas "menos") e líquido (diferença entre os dois).
 * O denominador dos percentuais é o total de questões da avaliação: com
 * respostas pendentes eles não somam 100, e é justamente esse o sinal de que o
 * resultado ainda não é apresentável (ver `completo`).
 */
export function calcularDISC(avaliacao, respostas = []) {
  const checagem = responderDISC(avaliacao, respostas);
  const base = avaliacao.totalQuestoes ?? avaliacao.questoes.length;

  const bruto = contarZerado();
  const menos = contarZerado();
  const liquido = contarZerado();

  for (const resposta of checagem.validas) {
    const questao = avaliacao.questoes.find((q) => q.id === resposta.questaoId);
    const fatorMais = questao.alternativas.find((a) => a.id === resposta.mais).fator;
    const fatorMenos = questao.alternativas.find((a) => a.id === resposta.menos).fator;
    bruto[fatorMais] += 1;
    menos[fatorMenos] += 1;
  }

  for (const fator of ORDEM_FATORES_DISC) {
    liquido[fator] = bruto[fator] - menos[fator];
  }

  const percentuais = contarZerado();
  const percentuaisMenos = contarZerado();
  const percentuaisLiquidos = contarZerado();
  for (const fator of ORDEM_FATORES_DISC) {
    percentuais[fator] = percentual(bruto[fator], base);
    percentuaisMenos[fator] = percentual(menos[fator], base);
    percentuaisLiquidos[fator] = percentualLiquido(liquido[fator], base);
  }

  // Desempate determinístico: maior líquido primeiro; em igualdade, a ordem
  // canônica D, I, S, C decide.
  const ordenados = ORDEM_FATORES_DISC.slice().sort(
    (a, b) => liquido[b] - liquido[a] || INDICE_ORDEM[a] - INDICE_ORDEM[b]
  );

  let perfil = null;
  let fatorPredominante = null;
  if (checagem.respondidas > 0) {
    fatorPredominante = ordenados[0];
    const segundo = ordenados[1];
    const empateRelevante = liquido[fatorPredominante] > 0 && liquido[segundo] === liquido[fatorPredominante];
    perfil = empateRelevante ? `${fatorPredominante}${segundo}` : fatorPredominante;
  }

  return {
    bruto,
    menos,
    /** Sinônimo de `menos`, para quem lê o laudo no vocabulário "pressão". */
    pressao: { ...menos },
    liquido,
    percentuais,
    percentuaisMenos,
    percentuaisLiquidos,
    totalQuestoes: base,
    respondidas: checagem.respondidas,
    completo: checagem.completo,
    pendentes: checagem.pendentes,
    invalidas: checagem.invalidas,
    fatorPredominante,
    fatorPredominanteNome: fatorPredominante ? NOME_FATOR_DISC[fatorPredominante] : null,
    perfil,
    perfilTitulo: perfil ? PERFIS_DISC[perfil]?.titulo ?? null : null,
    ressalvas: [...RESSALVAS_DISC],
  };
}

/**
 * Aceita o código em qualquer ordem ("ID" e "DI" são descrições diferentes e
 * existem na tabela). Letras repetidas ("DD") são inválidas: não há perfil.
 */
function normalizarCodigoPerfil(perfil) {
  const codigo = texto(perfil).toUpperCase().replace(/[^DISC]/g, "");
  if (!codigo || codigo.length > 2) {
    throw new Error(`perfil DISC inválido: "${perfil ?? ""}". Use 1 ou 2 letras entre D, I, S e C`);
  }
  if (codigo.length === 2 && codigo[0] === codigo[1]) {
    throw new Error(`perfil DISC inválido: "${codigo}". As duas letras devem ser fatores diferentes`);
  }
  if (!codigo.split("").every((letra) => FATORES_VALIDOS.has(letra))) {
    throw new Error(`perfil DISC inválido: "${perfil}". Letras aceitas: D, I, S, C`);
  }
  return codigo;
}

export function codigosPerfilDISC() {
  return Object.keys(PERFIS_DISC);
}

export function descreverPerfil(perfil) {
  const codigo = normalizarCodigoPerfil(perfil);
  const definicao = PERFIS_DISC[codigo];
  if (!definicao) {
    throw new Error(
      `perfil DISC sem descrição cadastrada: "${codigo}". Códigos disponíveis: ${codigosPerfilDISC().join(", ")}`
    );
  }
  return {
    codigo,
    titulo: definicao.titulo,
    resumo: definicao.resumo,
    fatores: codigo.split("").map((letra) => ({ fator: letra, nome: NOME_FATOR_DISC[letra] })),
    forcas: [...definicao.forcas],
    desafios: [...definicao.desafios],
    papeisSugeridos: [...definicao.papeisSugeridos],
    ressalvas: [...RESSALVAS_DISC],
  };
}
