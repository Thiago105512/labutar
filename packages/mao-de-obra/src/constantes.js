/**
 * Constantes do domínio de mão de obra.
 *
 * Cada regra legal aqui cita o dispositivo de onde vem. Onde a lei admite
 * mais de uma leitura, o valor é um PARÂMETRO (em PARAMETROS_LEGAIS), não uma
 * constante espalhada no código, para que o jurídico do cliente possa
 * confirmar ou ajustar sem alterar regra de negócio. Ver
 * docs/11-dominio-mao-de-obra.md, seção "Pontos a validar".
 */

/** Os três tipos de vínculo que convivem na mesma folha. */
export const TIPO_VINCULO = Object.freeze({
  /** Lei 6.019/1974, arts. 2º a 12: colocado à disposição de uma tomadora. */
  TEMPORARIO: "TEMPORARIO",
  /** Lei 6.019/1974, arts. 4-A a 5-D: empregado da prestadora alocado em tomadora. */
  TERCEIRIZADO: "TERCEIRIZADO",
  /** CLT: empregado da própria empresa, lotado em setor interno. */
  PROPRIO: "PROPRIO",
});

/** Tipos de contrato com a tomadora. Cada um só aceita o vínculo correspondente. */
export const TIPO_CONTRATO_TOMADOR = Object.freeze({
  /** Contrato de trabalho temporário (Lei 6.019/1974, art. 9º). */
  TRABALHO_TEMPORARIO: "TRABALHO_TEMPORARIO",
  /** Contrato de prestação de serviços (Lei 6.019/1974, art. 5-B). */
  PRESTACAO_SERVICOS: "PRESTACAO_SERVICOS",
});

export const VINCULO_ACEITO_POR_CONTRATO = Object.freeze({
  [TIPO_CONTRATO_TOMADOR.TRABALHO_TEMPORARIO]: TIPO_VINCULO.TEMPORARIO,
  [TIPO_CONTRATO_TOMADOR.PRESTACAO_SERVICOS]: TIPO_VINCULO.TERCEIRIZADO,
});

/**
 * Hipóteses que justificam o trabalho temporário (Lei 6.019/1974, art. 2º).
 * Os códigos numéricos acompanham o campo de hipótese legal do grupo de
 * trabalho temporário do S-2200 — conferir no leiaute vigente do eSocial.
 */
export const HIPOTESE_TEMPORARIO = Object.freeze({
  SUBSTITUICAO_TRANSITORIA: "SUBSTITUICAO_TRANSITORIA",
  DEMANDA_COMPLEMENTAR: "DEMANDA_COMPLEMENTAR",
});

export const CODIGO_ESOCIAL_HIPOTESE = Object.freeze({
  [HIPOTESE_TEMPORARIO.SUBSTITUICAO_TRANSITORIA]: 1,
  [HIPOTESE_TEMPORARIO.DEMANDA_COMPLEMENTAR]: 2,
});

/**
 * Categoria do trabalhador no eSocial (Tabela 01).
 * 101 = empregado geral; 106 = trabalhador temporário (Lei 6.019/1974).
 */
export const CATEGORIA_ESOCIAL = Object.freeze({
  [TIPO_VINCULO.TEMPORARIO]: "106",
  [TIPO_VINCULO.TERCEIRIZADO]: "101",
  [TIPO_VINCULO.PROPRIO]: "101",
});

/** Onde o vínculo pode ser lotado. */
export const DESTINO_POR_VINCULO = Object.freeze({
  [TIPO_VINCULO.TEMPORARIO]: "POSTO",
  [TIPO_VINCULO.TERCEIRIZADO]: "POSTO",
  [TIPO_VINCULO.PROPRIO]: "SETOR",
});

export const TIPO_ALOCACAO = Object.freeze({
  /** Posto fixo do trabalhador. Não pode haver duas principais no mesmo dia. */
  PRINCIPAL: "PRINCIPAL",
  /** Cobertura eventual (folguista, ferista, falta): prevalece sobre a principal no dia. */
  COBERTURA: "COBERTURA",
});

/**
 * Parâmetros de interpretação legal. Valores padrão conservadores; o
 * cliente pode sobrescrever por tenant depois de validar com o jurídico.
 */
export const PARAMETROS_LEGAIS = Object.freeze({
  /** Art. 10, §1º: até 180 dias, consecutivos ou não, com a mesma tomadora. */
  temporarioLimiteDias: 180,
  /** Art. 10, §2º: prorrogação de até 90 dias, comprovada a manutenção das condições. */
  temporarioProrrogacaoDias: 90,
  /** Art. 10, §5º: nova colocação na mesma tomadora só após 90 dias do término. */
  temporarioQuarentenaDias: 90,
  /**
   * Intervalo sem contrato que encerra a contagem acumulada ("consecutivos
   * ou não"). A lei não fixa esse número; 90 dias espelha a quarentena.
   * PONTO A VALIDAR com o jurídico.
   */
  temporarioIntervaloQueReiniciaContagem: 90,
  /** Aviso de vencimento de contrato temporário. */
  temporarioDiasDeAviso: 30,
  /** Art. 5-D: ex-empregado da tomadora só volta como terceirizado após 18 meses. */
  terceirizacaoQuarentenaMeses: 18,
});

/**
 * Capital social mínimo da própria empresa.
 * Temporário: art. 6º, III (R$ 100.000,00).
 * Prestação de serviços: art. 4-B, III, conforme número de empregados.
 * Valores em centavos.
 */
export const CAPITAL_MINIMO_TEMPORARIO = 10_000_000;
export const CAPITAL_MINIMO_TERCEIRIZACAO = Object.freeze([
  { ateEmpregados: 10, centavos: 1_000_000 },
  { ateEmpregados: 20, centavos: 2_500_000 },
  { ateEmpregados: 50, centavos: 4_500_000 },
  { ateEmpregados: 100, centavos: 10_000_000 },
  { ateEmpregados: Infinity, centavos: 25_000_000 },
]);
