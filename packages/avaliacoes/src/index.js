/**
 * @labutar/avaliacoes — DISC, testes técnicos/dissertativos e trilhas de curso.
 *
 * JS puro, sem dependências e sem import de Node: o mesmo código calcula o
 * resultado no servidor e no navegador (regra de ouro dos pacotes, ver
 * docs/01-arquitetura.md).
 *
 * Fluxo do DISC, na ordem em que deve ser executado:
 *
 *   criarInstrumentoDISC()      instrumento versionado: 24 blocos + 12 declarações
 *   responderDISC()             confere a resposta sem calcular nada
 *   calcularDISC()              perfis bruto, sob pressão e líquido
 *   avaliarValidadeDISC()       a resposta presta? (consistência, coerência, tempo, padrão)
 *   definirBenchmarkDISC()      perfil esperado da vaga, definido pelo requisitante
 *   emitirLaudoDISC()           laudo completo: validade + perfis + roda + aderência
 *   registrarAplicacaoDISC()    trilha de tratamento (LGPD art. 37)
 *   registrarRevisaoHumana()    revisão com fundamentação (LGPD art. 20)
 *   gerarRelatorioDISC()        leitura por audiência: candidato, recrutador, gestor
 *
 * A validade vem antes do perfil de propósito: perfil calculado sobre resposta
 * inválida parece técnico, tem gráfico bonito e sustenta decisão sobre a vida de
 * alguém. Quando a resposta não presta, o laudo diz isso e sai não utilizável.
 */
export * from "./constantes.js";
export * from "./disc.js";
export * from "./instrumento.js";
export * from "./series.js";
export * from "./escala.js";
export * from "./validade.js";
export * from "./circumplexo.js";
export * from "./graficos.js";
export * from "./benchmark.js";
export * from "./relatorios.js";
export * from "./laudo.js";
export * from "./auditoria.js";
export * from "./testes.js";
export * from "./cursos.js";
