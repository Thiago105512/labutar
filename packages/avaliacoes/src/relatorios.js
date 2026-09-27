import { AUDIENCIA_RELATORIO, NOME_FATOR_DISC, ORDEM_FATORES_DISC, RESSALVAS_DISC } from "./constantes.js";
import { GUARDRAILS_BENCHMARK_DISC } from "./benchmark.js";

/**
 * Guia de gestão por fator. É a camada que transforma o perfil em ação: sem
 * ela, o relatório vira um adjetivo sobre a pessoa ("ele é D") e não serve para
 * delegar, dar feedback ou onboardar.
 */
export const GUIA_GESTAO_POR_FATOR = Object.freeze({
  D: Object.freeze({
    comunicacao: "Direta e curta. Comece pela conclusão e pela decisão esperada, depois o contexto.",
    comoDelegar: "Delegue resultado e prazo, não o passo a passo. Deixe a alçada explícita por escrito.",
    comoDarFeedback: "Fale do impacto no resultado e no time, sem amortecer demais e sem rodeio.",
    motivadores: Object.freeze(["Desafio e meta visível", "Autonomia para decidir", "Autoridade sobre o próprio escopo", "Rapidez de resposta do ambiente"]),
    desgasta: Object.freeze(["Comitê que decide devagar", "Microgestão", "Rotina sem variação", "Trabalho sem dono definido"]),
    riscosGestao: "Conflito com pares, centralização de decisão e desgaste do time em período de pressão.",
    onboarding: Object.freeze({
      d30: "Deixar explícito o que é decisão dele e o que precisa de aprovação, com nome e sobrenome.",
      d60: "Dar um resultado pequeno, visível e com prazo curto para ele conquistar cedo.",
      d90: "Ampliar a alçada e cobrar o efeito no time, não apenas no número.",
    }),
  }),
  I: Object.freeze({
    comunicacao: "Abra espaço para conversa e reconheça em público. Confirme por escrito o combinado depois.",
    comoDelegar: "Delegue com contexto e propósito, e combine pontos de controle para o follow-up não se perder.",
    comoDarFeedback: "Comece pelo que funcionou, seja específico no ajuste e feche com a expectativa clara.",
    motivadores: Object.freeze(["Reconhecimento público", "Contato com pessoas", "Novidade e variedade", "Liberdade de método"]),
    desgasta: Object.freeze(["Isolamento", "Burocracia e registro", "Tarefa repetitiva", "Trabalho sem retorno de ninguém"]),
    riscosGestao: "Promessa além da capacidade, follow-up descoberto e decisão no impulso para não frustrar ninguém.",
    onboarding: Object.freeze({
      d30: "Apresentar a rede de contatos e o mapa de quem decide o quê.",
      d60: "Colocar em uma frente com público (cliente, time ou plateia interna).",
      d90: "Instalar rotina leve de registro e acompanhamento das promessas feitas.",
    }),
  }),
  S: Object.freeze({
    comunicacao: "Aviso prévio de mudança, tom calmo e tempo para processar antes de exigir resposta.",
    comoDelegar: "Delegue com escopo estável e prazo realista. Evite trocar a prioridade no meio do caminho.",
    comoDarFeedback: "Em particular, específico sobre o fato, com espaço real para a pessoa falar.",
    motivadores: Object.freeze(["Previsibilidade", "Cooperação e bom clima", "Reconhecimento da constância", "Segurança no cargo"]),
    desgasta: Object.freeze(["Mudança brusca", "Conflito aberto", "Pressão de última hora", "Reorganização sem explicação"]),
    riscosGestao: "Acúmulo de demanda por dificuldade de dizer não e adiamento de conversa necessária.",
    onboarding: Object.freeze({
      d30: "Mostrar a rotina completa, com quem faz o quê e onde está cada informação.",
      d60: "Definir junto o limite de demanda que ele pode assumir sem estourar.",
      d90: "Treinar explicitamente como discordar e como dizer não dentro da cultura da casa.",
    }),
  }),
  C: Object.freeze({
    comunicacao: "Dados, critérios e por escrito. Evite pedir decisão no improviso.",
    comoDelegar: "Delegue com critério de aceite explícito e informação completa desde o início.",
    comoDarFeedback: "Aponte o desvio em relação ao padrão, com evidência, e combine o critério dali em diante.",
    motivadores: Object.freeze(["Qualidade e precisão", "Padrão claro", "Autonomia técnica", "Tempo para aprofundar"]),
    desgasta: Object.freeze(["Requisito que muda no meio", "Improvisação", "Pressão por velocidade sem critério", "Falta de informação"]),
    riscosGestao: "Perfeccionismo que atrasa entrega e crítica direta lida como dureza pelo time.",
    onboarding: Object.freeze({
      d30: "Entregar o padrão existente: manuais, checklists, exemplos de saída esperada.",
      d60: "Pedir que ele documente um processo que hoje só existe na cabeça de alguém.",
      d90: "Combinar o ponto em que 'bom o suficiente' vale mais que 'perfeito', por tipo de entrega.",
    }),
  }),
});

/**
 * Perguntas comportamentais (formato STAR) para o ponto em que o perfil medido
 * diverge do esperado na vaga. É o uso legítimo do DISC em seleção: gerar
 * pergunta boa, não gerar veredito.
 */
export const PERGUNTAS_ENTREVISTA_POR_FATOR = Object.freeze({
  D: Object.freeze({
    ACIMA: Object.freeze([
      "Conte uma decisão impopular que você tomou com informação incompleta. O que fez com quem discordou?",
      "Quando foi a última vez que você atropelou um processo para entregar mais rápido? O que aconteceu depois?",
    ]),
    ABAIXO: Object.freeze([
      "Descreva uma situação em que precisou conduzir o grupo sem autoridade formal. Como se posicionou?",
      "O que você faz quando o time espera uma decisão sua e você ainda não tem convicção?",
    ]),
  }),
  I: Object.freeze({
    ACIMA: Object.freeze([
      "Como você sustenta semanas de trabalho sem plateia, só com planilha e rotina?",
      "Que promessa feita no entusiasmo você não conseguiu cumprir? Como resolveu com quem esperava?",
    ]),
    ABAIXO: Object.freeze([
      "Como você conduz uma apresentação para um público que discorda de você?",
      "Que relação de trabalho você construiu de propósito, e não por afinidade? O que exigiu?",
    ]),
  }),
  C: Object.freeze({
    ACIMA: Object.freeze([
      "Que entrega sua atrasou por refinamento? Como você decidiu parar?",
      "Como você explica uma conclusão técnica para quem não é da área e precisa decidir hoje?",
    ]),
    ABAIXO: Object.freeze([
      "Como você garante qualidade quando o prazo não permite revisão completa?",
      "Que erro de detalhe seu passou despercebido e virou problema? O que mudou depois?",
    ]),
  }),
  S: Object.freeze({
    ACIMA: Object.freeze([
      "O que você fez na última mudança brusca de prioridade? Quanto tempo levou para se reorganizar?",
      "Quando foi a última vez que você disse não a uma demanda do seu gestor?",
    ]),
    ABAIXO: Object.freeze([
      "Descreva uma rotina que você manteve por mais de um ano. O que te fez sustentá-la?",
      "Como você lida com o colega que depende de você para não se perder no processo?",
    ]),
  }),
});

const AVISO_LEGAL =
  "Este documento descreve preferências comportamentais autorrelatadas. Não é teste psicológico (DISC não consta do SATEPSI/CFP e, nessa condição, seu uso é privativo de psicólogo), não mede capacidade nem desempenho, e não pode ser o único critério de qualquer decisão sobre a pessoa. Uso como filtro eliminatório pode configurar prática discriminatória (Lei 9.029/1995) e violar a LGPD (art. 6º e art. 20).";

function secao(id, titulo, itens, texto = null) {
  return { id, titulo, itens: itens ?? [], texto };
}

function fatoresDoPerfil(codigo) {
  return String(codigo ?? "").split("").filter((letra) => ORDEM_FATORES_DISC.includes(letra));
}

function guiaDo(laudo) {
  return fatoresDoPerfil(laudo.descricaoPerfil?.codigo).map((fator) => ({
    fator,
    nome: NOME_FATOR_DISC[fator],
    ...(GUIA_GESTAO_POR_FATOR[fator] ?? {}),
  }));
}

function perguntasPara(laudo) {
  const pontos = laudo.benchmark?.pontosAtencao ?? [];
  if (pontos.length > 0) {
    return pontos.map((ponto) => ({
      fator: ponto.fator,
      nome: ponto.nome,
      divergencia: `${ponto.direcao} do esperado (${ponto.desvio > 0 ? "+" : ""}${ponto.desvio} pontos)`,
      perguntas: PERGUNTAS_ENTREVISTA_POR_FATOR[ponto.fator]?.[ponto.direcao] ?? [],
    }));
  }

  const ordem = laudo.diferenciacao?.ordem ?? [];
  if (ordem.length === 0) return [];
  const maisForte = ordem[0];
  const maisFraco = ordem[ordem.length - 1];
  return [
    {
      fator: maisForte.fator,
      nome: maisForte.nome,
      divergencia: "fator mais forte do perfil",
      perguntas: PERGUNTAS_ENTREVISTA_POR_FATOR[maisForte.fator]?.ACIMA ?? [],
    },
    {
      fator: maisFraco.fator,
      nome: maisFraco.nome,
      divergencia: "fator menos expressivo do perfil",
      perguntas: PERGUNTAS_ENTREVISTA_POR_FATOR[maisFraco.fator]?.ABAIXO ?? [],
    },
  ];
}

function relatorioIndisponivel(laudo, audiencia) {
  const motivos = laudo?.alertas?.length ? laudo.alertas : ["Resposta incompleta ou sem confiabilidade verificada."];
  return {
    audiencia,
    titulo: "Perfil comportamental indisponível",
    subtitulo: "O laudo não pôde ser emitido com confiança suficiente para leitura.",
    geradoEm: laudo?.geradoEm ?? null,
    secoes: [
      secao("motivo", "Por que não há perfil", motivos),
      secao("proxima", "Próximo passo", [
        "Reaplicar o instrumento em condições adequadas (tempo reservado, ambiente sem interrupção).",
        "Se a reaplicação não for possível, seguir o processo sem a avaliação comportamental — ela é apoio, nunca requisito.",
      ]),
    ],
    perfil: null,
    alertas: motivos,
    avisoLegal: AVISO_LEGAL,
    ressalvas: [...(laudo?.ressalvas ?? RESSALVAS_DISC)],
  };
}

/**
 * Relatório por audiência. O mesmo laudo gera três leituras diferentes, e a
 * diferença não é de tom apenas: o que o recrutador pode ver (aderência à vaga,
 * alertas de validade) o candidato não vê, e o que o candidato vê é sempre
 * descritivo e próprio, nunca comparativo.
 */
export function gerarRelatorioDISC({ laudo, audiencia, nomeCandidato = null, tituloVaga = null } = {}) {
  if (!laudo || laudo.tipo !== "LAUDO_DISC") {
    throw new Error("gerarRelatorioDISC exige um laudo gerado por emitirLaudoDISC()");
  }
  const publico = String(audiencia ?? "").trim().toUpperCase();
  if (!Object.values(AUDIENCIA_RELATORIO).includes(publico)) {
    throw new Error(
      `audiência inválida: "${audiencia ?? ""}". Use ${Object.values(AUDIENCIA_RELATORIO).join(", ")}`
    );
  }
  if (!laudo.utilizavel) return relatorioIndisponivel(laudo, publico);

  const perfil = laudo.descricaoPerfil;
  const nome = nomeCandidato ? String(nomeCandidato).trim() : null;
  const vaga = tituloVaga ? String(tituloVaga).trim() : null;
  const guia = guiaDo(laudo);

  if (publico === AUDIENCIA_RELATORIO.CANDIDATO) {
    return {
      audiencia: publico,
      titulo: "Seu perfil comportamental",
      subtitulo: nome ? `${nome} — resultado do Perfil Comportamental DISC` : "Resultado do Perfil Comportamental DISC",
      geradoEm: laudo.geradoEm,
      secoes: [
        secao("estilo", "Seu estilo predominante", [`${perfil.codigo} — ${perfil.titulo}`], perfil.resumo),
        secao("forcas", "O que costuma funcionar bem em você", perfil.forcas),
        secao("desenvolvimento", "Onde vale prestar atenção", [
          ...perfil.desafios,
          `Diferenciação do seu perfil: ${laudo.diferenciacao.nivel.toLowerCase()} (amplitude de ${laudo.diferenciacao.amplitude} pontos).`,
        ]),
        secao("comunicacao", "Como você tende a se comunicar", guia.map((g) => `${g.nome}: ${g.comunicacao}`)),
        secao("motiva", "O que te motiva e o que te desgasta", [
          ...guia.flatMap((g) => g.motivadores.map((m) => `Motiva: ${m}`)),
          ...guia.flatMap((g) => g.desgasta.map((d) => `Desgasta: ${d}`)),
        ]),
        secao("leitura", "Como ler este resultado", [
          "Descreve preferências que você mesmo declarou, num dia específico. Não é diagnóstico nem definição de quem você é.",
          "Não existe perfil melhor ou pior: cada estilo tem força real e custo real, dependendo do contexto.",
          "Se algo aqui parece errado, diga — o resultado pode ser revisto e reaplicado.",
        ]),
      ],
      perfil: { codigo: perfil.codigo, titulo: perfil.titulo },
      alertas: [],
      avisoLegal: AVISO_LEGAL,
      ressalvas: [...laudo.ressalvas],
    };
  }

  if (publico === AUDIENCIA_RELATORIO.RECRUTADOR) {
    return {
      audiencia: publico,
      titulo: "Leitura de apoio à seleção",
      subtitulo: [nome, vaga].filter(Boolean).join(" · ") || "Perfil comportamental DISC",
      geradoEm: laudo.geradoEm,
      secoes: [
        secao("confiabilidade", "Confiabilidade da resposta", [
          `Nível: ${laudo.validade.confiabilidade}${laudo.validade.indice !== null ? ` (índice ${laudo.validade.indice})` : ""}`,
          `Instrumento: ${laudo.instrumento.codigo ?? "DISC"} v${laudo.instrumento.versao ?? "?"} · ${laudo.resposta.respondidas}/${laudo.resposta.totalQuestoes} questões`,
          ...(laudo.resposta.tempoMedioPorQuestao ? [`Tempo médio por questão: ${laudo.resposta.tempoMedioPorQuestao}s`] : []),
          ...(laudo.alertas.length > 0 ? laudo.alertas : ["Nenhum alerta de validade."]),
        ]),
        secao("perfil", "Perfil", [`${perfil.codigo} — ${perfil.titulo}`, `Fator predominante: ${laudo.perfis.liquido.fatorPredominanteNome}`, `Diferenciação: ${laudo.diferenciacao.nivel}`], perfil.resumo),
        secao("forcaRisco", "Forças prováveis e pontos de risco", [
          ...perfil.forcas.map((f) => `Força: ${f}`),
          ...perfil.desafios.map((d) => `Risco: ${d}`),
        ]),
        secao("mascara", "Autoimagem × comportamento sob pressão", [
          `Diferença média entre as séries: ${laudo.mascara.magnitude} pontos (${laudo.mascara.nivel}).`,
          laudo.mascara.leitura,
        ]),
        laudo.benchmark
          ? secao("aderencia", `Aderência ao perfil esperado — ${laudo.benchmark.titulo ?? "vaga"}`, [
              `Score indicativo: ${laudo.benchmark.score} (${laudo.benchmark.nivel})`,
              ...laudo.benchmark.porFator.map(
                (item) => `${item.nome}: medido ${item.medido} × esperado ${item.esperado} → aderência ${item.aderencia}%${item.obrigatorio ? " (fator obrigatório)" : ""}`
              ),
              laudo.benchmark.aviso,
            ])
          : secao("aderencia", "Aderência à vaga", ["Nenhum benchmark comportamental definido para esta vaga. Defina com o requisitante antes de comparar candidatos."]),
        secao("entrevista", "Perguntas sugeridas para a entrevista", perguntasPara(laudo).flatMap((bloco) => [
          `${bloco.nome} — ${bloco.divergencia}:`,
          ...bloco.perguntas.map((p) => `  → ${p}`),
        ])),
        secao("limites", "O que este laudo não autoriza", [...GUARDRAILS_BENCHMARK_DISC.usoVedado]),
      ],
      perfil: { codigo: perfil.codigo, titulo: perfil.titulo },
      benchmark: laudo.benchmark,
      alertas: [...laudo.alertas],
      avisoLegal: AVISO_LEGAL,
      ressalvas: [...laudo.ressalvas],
    };
  }

  return {
    audiencia: publico,
    titulo: "Guia de gestão do perfil",
    subtitulo: [nome, vaga].filter(Boolean).join(" · ") || "Perfil comportamental DISC",
    geradoEm: laudo.geradoEm,
    secoes: [
      secao("perfil", "Perfil", [`${perfil.codigo} — ${perfil.titulo}`], perfil.resumo),
      secao("gerir", "Como gerenciar", guia.map((g) => `${g.nome} — comunicação: ${g.comunicacao}`)),
      secao("delegar", "Como delegar", guia.map((g) => `${g.nome}: ${g.comoDelegar}`)),
      secao("feedback", "Como dar feedback", guia.map((g) => `${g.nome}: ${g.comoDarFeedback}`)),
      secao("motivacao", "O que motiva e o que desgasta", [
        ...guia.flatMap((g) => g.motivadores.map((m) => `${g.nome} · motiva: ${m}`)),
        ...guia.flatMap((g) => g.desgasta.map((d) => `${g.nome} · desgasta: ${d}`)),
      ]),
      secao("risco", "Risco de gestão a acompanhar", guia.map((g) => `${g.nome}: ${g.riscosGestao}`)),
      secao("onboarding", "Plano de integração 30/60/90", guia.flatMap((g) => [
        `${g.nome} · 30 dias: ${g.onboarding.d30}`,
        `${g.nome} · 60 dias: ${g.onboarding.d60}`,
        `${g.nome} · 90 dias: ${g.onboarding.d90}`,
      ])),
      secao("limite", "Limite de uso", [
        "Este guia orienta a conversa de gestão. Não é avaliação de desempenho nem base para decisão sobre permanência.",
        "Perfil descreve tendência, não capacidade: desempenho se mede por entrega e por resultado.",
      ]),
    ],
    perfil: { codigo: perfil.codigo, titulo: perfil.titulo },
    alertas: [],
    avisoLegal: AVISO_LEGAL,
    ressalvas: [...laudo.ressalvas],
  };
}

/** Serializa o relatório em Markdown — é o que vira PDF e o que vai por e-mail. */
export function formatarRelatorioMarkdown(relatorio) {
  if (!relatorio || !Array.isArray(relatorio.secoes)) {
    throw new Error("formatarRelatorioMarkdown exige um relatório de gerarRelatorioDISC()");
  }

  const linhas = [`# ${relatorio.titulo}`];
  if (relatorio.subtitulo) linhas.push("", `_${relatorio.subtitulo}_`);
  if (relatorio.geradoEm) linhas.push("", `Gerado em ${String(relatorio.geradoEm).slice(0, 10)}.`);

  for (const item of relatorio.secoes) {
    linhas.push("", `## ${item.titulo}`);
    if (item.texto) linhas.push("", item.texto);
    for (const linha of item.itens) linhas.push(`- ${linha}`);
  }

  linhas.push("", "> " + relatorio.avvisoLegal);

  if (relatorio.ressalvas?.length) {
    linhas.push("", "## Ressalvas");
    for (const ressalva of relatorio.ressalvas) linhas.push(`- ${ressalva}`);
  }

  return linhas.join("\n");
}
