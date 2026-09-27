export const FATOR_DISC = Object.freeze({
  DOMINANCIA: "D",
  INFLUENCIA: "I",
  ESTABILIDADE: "S",
  CONFORMIDADE: "C",
});

/** Ordem canônica dos fatores. Todo desempate no DISC usa esta ordem. */
export const ORDEM_FATORES_DISC = Object.freeze(["D", "I", "S", "C"]);

export const NOME_FATOR_DISC = Object.freeze({
  D: "Dominância",
  I: "Influência",
  S: "Estabilidade",
  C: "Conformidade",
});

export const TIPO_TESTE = Object.freeze({
  MULTIPLA_ESCOLHA: "MULTIPLA_ESCOLHA",
  VERDADEIRO_FALSO: "VERDADEIRO_FALSO",
  NUMERICA: "NUMERICA",
  DISSERTATIVA: "DISSERTATIVA",
});

/**
 * Só estes tipos têm correção automática. DISSERTATIVA nunca recebe nota
 * inventada pelo sistema: exige rubrica e revisor humano.
 */
export const TIPOS_AUTO_CORRIGIVEIS = Object.freeze([
  TIPO_TESTE.MULTIPLA_ESCOLHA,
  TIPO_TESTE.VERDADEIRO_FALSO,
  TIPO_TESTE.NUMERICA,
]);

export const TIPO_AULA = Object.freeze({
  VIDEO: "VIDEO",
  TEXTO: "TEXTO",
  QUIZ: "QUIZ",
});

export const STATUS_MATRICULA = Object.freeze({
  EM_ANDAMENTO: "EM_ANDAMENTO",
  CONCLUIDA: "CONCLUIDA",
  ATRASADA: "ATRASADA",
});

/** Escala fixa de cada critério de rubrica. */
export const ESCALA_RUBRICA = Object.freeze({ minima: 0, maxima: 5 });

/**
 * Limites do instrumento, exibidos junto de qualquer resultado de DISC.
 * O DISC é questionário de preferências declaradas, não teste psicológico:
 * teste validado é de uso privativo de psicólogo (Lei 4.119/1964 e SATEPSI/CFP).
 */
export const RESSALVAS_DISC = Object.freeze([
  "Resultado indicativo: descreve preferências declaradas pela própria pessoa, não mede capacidade, inteligência nem desempenho no trabalho.",
  "Não pode ser o único critério de uma decisão de contratação. Deve ser lido junto com entrevista, análise de experiência e, quando couber, teste técnico.",
  "Usar o perfil como filtro eliminatório é juridicamente arriscado no Brasil: recusa apoiada apenas em traço de personalidade pode configurar prática discriminatória (Lei 9.029/1995) e gerar condenação por dano moral.",
  "Instrumento de autorrelato: sofre influência de desejabilidade social, humor, contexto do momento e do quanto a pessoa conhece a função pretendida.",
  "Não é diagnóstico clínico, psicológico ou médico, e não identifica transtorno, deficiência nem aptidão permanente.",
  "O resultado é dado pessoal protegido pela LGPD: informar a finalidade, manter base legal adequada, garantir acesso e correção ao titular e restringir o acesso interno ao necessário.",
  "Perfis não são bons nem ruins. Toda descrição de pontos fortes e desafios é hipótese de conversa na entrevista, nunca conclusão sobre a pessoa.",
]);

/**
 * O instrumento é versionado e o laudo guarda a versão usada. Sem isso, um
 * perfil de 2026 fica incomparável com um de 2027 e ninguém percebe — erro que
 * em processo trabalhista custa a credibilidade de todos os laudos anteriores.
 */
export const VERSAO_INSTRUMENTO_DISC = "1.0.0";
export const IDIOMA_INSTRUMENTO_DISC = "pt-BR";

/**
 * Valência do bloco de palavras. É o que permite calcular desejabilidade
 * social: num bloco POSITIVA escolher "mais" é resposta desejável; num bloco
 * DESAFIADORA o desejável é escolher "menos". Sem valência declarada o índice
 * não é calculado — e nunca é inventado.
 */
export const VALENCIA_ITEM = Object.freeze({
  POSITIVA: "POSITIVA",
  DESAFIADORA: "DESAFIADORA",
});

/**
 * Par de itens de controle, técnica dos manuais do PPA e do Extended DISC:
 * REPETIDA espera o mesmo lado nas duas ocorrências; OPOSTA espera lados
 * contrários. Incoerência aqui é o sinal mais forte de resposta descuidada.
 */
export const TIPO_PAR_CONSISTENCIA = Object.freeze({
  REPETIDA: "REPETIDA",
  OPOSTA: "OPOSTA",
});

/** Escala Likert das declarações comportamentais (parte normativa do instrumento). */
export const ESCALA_CONCORDANCIA = Object.freeze({
  minima: 1,
  maxima: 5,
  neutra: 3,
  rotulos: Object.freeze({
    1: "Discordo totalmente",
    2: "Discordo em parte",
    3: "Neutro",
    4: "Concordo em parte",
    5: "Concordo totalmente",
  }),
});

export const NIVEL_CONFIABILIDADE = Object.freeze({
  ALTA: "ALTA",
  MEDIA: "MEDIA",
  BAIXA: "BAIXA",
  INSUFICIENTE: "INSUFICIENTE",
});

/**
 * Limiares de validade. Concentrados aqui para o tenant poder calibrar sem
 * tocar no cálculo — mas o padrão é conservador: na dúvida o laudo sai marcado
 * como não confiável em vez de sair bonito e errado.
 *
 * Não há índice de desejabilidade social global, e não é esquecimento: com
 * blocos de valência uniforme (todas as palavras do bloco igualmente
 * desejáveis), exatamente uma das duas escolhas é sempre "desejável", o que
 * trava o índice em 50% para qualquer pessoa. O sinal equivalente — e que de
 * fato varia — é a coerência entre a série clara e a série escura: quem se
 * apresenta como muito Dominante e ao mesmo tempo não admite nada do lado
 * agressivo da Dominância está editando a resposta.
 */
export const LIMITE_VALIDADE_DISC = Object.freeze({
  segundosMinimosPorQuestao: 4,
  tempoTotalMinimoSegundos: 180,
  consistenciaMinima: 60,
  divergenciaSeriesMaxima: 35,
  divergenciaMetodoMaxima: 30,
  extremidadeMaxima: 50,
  viesPosicaoMaxima: 70,
  pesos: Object.freeze({
    consistencia: 30,
    coerencia: 20,
    velocidade: 20,
    extremidade: 15,
    padrao: 15,
  }),
  cortes: Object.freeze({ alta: 80, media: 60, baixa: 40 }),
});

/**
 * 8 estilos primários do circumplexo, no padrão Everything DiSC (Wiley):
 * D no topo, sentido horário. `codigo` casa com as chaves de PERFIS_DISC;
 * `rotulo` é a grafia de mercado (Di, iS), só para exibição.
 */
export const SEGMENTOS_DISC = Object.freeze([
  Object.freeze({ codigo: "D", rotulo: "D", angulo: 90, nome: "Dominância" }),
  Object.freeze({ codigo: "DI", rotulo: "Di", angulo: 45, nome: "Dominância com Influência" }),
  Object.freeze({ codigo: "I", rotulo: "i", angulo: 0, nome: "Influência" }),
  Object.freeze({ codigo: "IS", rotulo: "iS", angulo: 315, nome: "Influência com Estabilidade" }),
  Object.freeze({ codigo: "S", rotulo: "S", angulo: 270, nome: "Estabilidade" }),
  Object.freeze({ codigo: "SC", rotulo: "SC", angulo: 225, nome: "Estabilidade com Conformidade" }),
  Object.freeze({ codigo: "C", rotulo: "C", angulo: 180, nome: "Conformidade" }),
  Object.freeze({ codigo: "CD", rotulo: "CD", angulo: 135, nome: "Conformidade com Dominância" }),
]);

/** Resolução gráfica da roda: 12 setores de 30°, cada um apontando o estilo dominante. */
export const RODA_DISC_12 = Object.freeze([
  Object.freeze({ setor: 1, angulo: 90, rotulo: "D" }),
  Object.freeze({ setor: 2, angulo: 60, rotulo: "D / Di" }),
  Object.freeze({ setor: 3, angulo: 30, rotulo: "Di / i" }),
  Object.freeze({ setor: 4, angulo: 0, rotulo: "i" }),
  Object.freeze({ setor: 5, angulo: 330, rotulo: "i / iS" }),
  Object.freeze({ setor: 6, angulo: 300, rotulo: "iS / S" }),
  Object.freeze({ setor: 7, angulo: 270, rotulo: "S" }),
  Object.freeze({ setor: 8, angulo: 240, rotulo: "S / SC" }),
  Object.freeze({ setor: 9, angulo: 210, rotulo: "SC / C" }),
  Object.freeze({ setor: 10, angulo: 180, rotulo: "C" }),
  Object.freeze({ setor: 11, angulo: 150, rotulo: "C / CD" }),
  Object.freeze({ setor: 12, angulo: 120, rotulo: "CD / D" }),
]);

export const TIPO_GRAFICO_DISC = Object.freeze({
  PRESSAO: "PRESSAO",
  DECLARADO: "DECLARADO",
  LIQUIDO: "LIQUIDO",
  RODA: "RODA",
  OVERLAY_TIME: "OVERLAY_TIME",
  BENCHMARK: "BENCHMARK",
});

export const NIVEL_ADERENCIA = Object.freeze({
  ALTA: "ALTA",
  MEDIA: "MEDIA",
  BAIXA: "BAIXA",
  SEM_PERFIL: "SEM_PERFIL",
});

export const AUDIENCIA_RELATORIO = Object.freeze({
  CANDIDATO: "CANDIDATO",
  RECRUTADOR: "RECRUTADOR",
  GESTOR: "GESTOR",
});

/** LGPD art. 20: toda leitura automatizada precisa de revisão humana registrada. */
export const STATUS_REVISAO = Object.freeze({
  PENDENTE: "PENDENTE",
  REVISADO: "REVISADO",
  DESCARTADO: "DESCARTADO",
});

export const DECISAO_REVISAO = Object.freeze({
  MANTIDO: "MANTIDO",
  DIVERGENTE: "DIVERGENTE",
  DESCARTADO: "DESCARTADO",
});
