/**
 * CCT 2026 — Asseio, Conservação e Serviços Terceirizados do Amazonas.
 * Registro MTE AM000038/2026 (23/01/2026), solicitação MR076105/2025,
 * processo 13621.201052/2026-83. Fonte: extrato do Mediador (www3.mte.gov.br/sistemas/mediador).
 *
 * Só o que muda cálculo, custo ou prazo vira parâmetro; as demais cláusulas ficam listadas em
 * `clausulas` (número e assunto) para consulta. Valores em centavos, percentuais em %.
 */
const p = (valor, funcoes) => ({ valor, funcoes });

export const CCT_AM000038_2026 = {
  id: "AM000038-2026",
  tipo: "CCT",
  registroMTE: "AM000038/2026",
  dataRegistro: "2026-01-23",
  solicitacao: "MR076105/2025",
  processo: "13621.201052/2026-83",
  vigencia: { inicio: "2026-01-01", fim: "2026-12-31" },
  dataBase: { mes: 1 },
  sindicatoLaboral: { cnpj: "23006562000148", nome: "Sindicato dos Empregados em Empresas de Asseio e Conservação do Estado do Amazonas", sigla: "SEEACEAM" },
  sindicatoPatronal: { cnpj: "34501213000119", nome: "Sindicato das Empresas de Asseio e Conservação do Estado do Amazonas", sigla: "SEAC-AM" },
  abrangencia: { categoria: "Empregados em empresas de asseio, conservação e serviços terceirizados", uf: "AM" },

  // Cláusula 3ª — pisos a partir de 01/01/2026, para jornada legal. Função não listada e não
  // enquadrada em outra representação: piso geral.
  pisoGeral: 165525,
  pisos: [
    p(165525, [
      "Agente de Limpeza", "Agente de Limpeza Banheirista", "Agente de Limpeza Embarcado", "Agente Social Terceirizado",
      "Ajudante (Serviços Gerais, Entrega)", "Auxiliar de Pedreiro", "Auxiliar de Pintor", "Aux. de Produção em Reciclagem",
      "Borracheiro", "Copeira(o)", "Copeira(o) Hospitalar", "Mensageiro/Office-Boy", "Operário Rural/Caseiro", "Lavador",
      "Auxiliar de Bombeiro Hidráulico", "Cumim (Aux. de Garçom)", "Auxiliar de Piscineiro", "Lavador de Autos",
      "Auxiliar de Preparação", "Serviços Gerais",
    ]),
    p(649226, ["Administrador de Tecnologia da Informação"]),
    p(649226, ["Administrador de Tecnologia da Informação com conhecimento e experiência na área de Saúde"]),
    p(649226, ["Administrador de Tecnologia da Informação com conhecimento e experiência na área de Trânsito"]),
    p(177728, ["Agente de Limpeza Apoio"]),
    p(205243, ["Agente de Limpeza com Habilitação"]),
    p(199141, ["Agente de Limpeza Habilitado para Operar Roçadeira"]),
    p(186644, ["Agente de Piscina/Piscineiro"]),
    p(454670, ["Apontador Geral"]),
    p(233415, ["Apontador de Turma"]),
    p(188103, ["Almoxarife"]),
    p(457309, ["Analista de Sistema (Nível Superior)"]),
    p(730380, ["Analista de Sistema – Tecnologia da Informática"]),
    p(405766, ["Analista de Custos – CBO 2522-10"]),
    p(405766, ["Analista de Folha de Pagamento – CBO 4131-05"]),
    p(405766, ["Analista de Suprimento – CBO – 1424-10"]),
    // § 2º: artífice é mão de obra sem especialização, só para reparos — não confundir com as funções técnicas.
    p(218603, ["Artífice de Serviços Gerais (Carpinteiro; Pedreiro; Pintor; Soldador; Serralheiro; Encanador e Outros) Sem Especialização Técnica"]),
    p(166551, ["Ascensorista (6 horas diárias)","Auxiliar de Apoio Logístico"]),
    p(213359, ["Assistente Administrativo","Assistente de Pessoal","Assistente Financeiro"]),
    p(280000, ["Assistente Administrativo Tipo II - (Nível intermediário)"]),
    p(218178, ["Assistente Administrativo (Designer)"]),
    p(358813, ["Assistente Administrativo com nível superior ou cursando nível superior"]),
    p(202712, ["Assistente Comercial"]),
    p(359224, ["Assistente de TI"]),
    p(184778, ["Atendente"]),
    p(182169, ["Auxiliar Administrativo"]),
    p(178932, ["Auxiliar de Almoxarifado"]),
    p(174362, ["Auxiliar de Caldeireiro"]),
    p(184779, ["Auxiliar de Escritório"]),
    p(165525, ["Auxiliar de Lavanderia"]),
    p(206001, ["Auxiliar de Manutenção"]),
    p(173698, ["Auxiliar de Marceneiro","Auxiliar de Mecânico"]),
    p(210068, ["Auxiliar de Pedreiro Qualificado"]),
    p(213055, ["Auxiliar de Produção Terceirizado"]),
    p(231879, ["Auxiliar de Produção de Linha de Montagem Terceirizado"]),
    p(184252, ["Auxiliar de Refrigeração"]),
    p(284734, ["Auxiliar de Serviços Diversos"]),
    p(169145, ["Auxiliar de Jardinagem"]),
    p(249894, ["Auxiliar de TI"]),
    p(245833, ["Bibliotecário Terceirizado"]),
    p(241972, ["Bombeiro Hidráulico"]),
    p(238748, ["Carpinteiro"]),
    p(405766, ["Cobrador Externo CBO 4213-05"]),
    p(269311, ["Conferente"]),
    p(201559, ["Costureiro(a) Terceirizado(a)"]),
    p(477374, ["Designe de Produção"]),
    p(336645, ["Digitador"]),
    p(336645, ["Eletricista de Alta Tensão"]),
    p(221209, ["Eletricista Predial de Baixa Tensão"]),
    p(260000, ["Eletrotécnico Terceirizado"]),
    p(256602, ["Encarregado de Serviços","Inspetor de Alunos Terceirizado"]),
    p(176964, ["Fiscal de Pátio"]),
    p(180415, ["Garçom Terceirizado"]),
    p(242027, ["Instalador-Reparador de Redes e Cabos Telefônicos"]),
    p(188676, ["Jardineiro /Paisagista"]),
    p(178268, ["Jardineiro/Roçador/Podador"]),
    p(649226, ["Jornalista Terceirizado"]),
    p(189197, ["Leiturista"]),
    p(201559, ["Líder de Serviços"]),
    p(277601, ["Marceneiro"]),
    p(506963, ["Mecânico de Lancha"]),
    p(201132, ["Mecânico de Refrigeração"]),
    p(253392, ["Mecânico de Máquinas"]),
    p(224723, ["Monitorador"]),
    p(374843, ["Nutricionista/Analista em Nutrição"]),
    p(242027, ["Operador de Balancim"]),
    p(180217, ["Operador Eletrônico"]),
    p(291061, ["Operador de Equipamentos Industriais"]),
    p(277791, ["Operador de Máquina Industriais"]),
    p(200386, ["Operador de Máquina Reprográfica"]),
    p(194266, ["Operador de Máquinas de Papel e Similares"]),
    p(261703, ["Operador de Máquina para movimentação de Resíduos"]),
    p(339775, ["Operador de Rádio"]),
    p(305222, ["Operador de Usina Hidráulica","Operador de Usina Térmica"]),
    p(296979, ["Pedreiro","Pintor"]),
    p(165525, ["Piloto Fluvial Terceirizado"]),
    p(171760, ["Prensista","Processador de Máquina de Moagem"]),
    p(173898, ["Prensista de Resíduos"]),
    p(213437, ["Profissional de Vendas Terceirizado"]),
    p(514793, ["Programador de Informática"]),
    p(649226, ["Programador de Rede Terceirizado"]),
    p(184779, ["Recepcionista"]),
    p(182169, ["Repositor de Supermercado"]),
    p(177728, ["Revisora de Leito"]),
    p(195442, ["Secretária (o)"]),
    p(283310, ["Secretária Bilíngue"]),
    p(405766, ["Secretária da Alta Administração"]),
    p(277677, ["Soldador"]),
    p(368269, ["Supervisor Administrativo (Específico para empresas de reciclagem - CBO 410105)"]),
    p(312368, ["Supervisor Técnico em Refrigeração"]),
    p(323260, ["Supervisor de Serviços Gerais","Supervisor Operacional"]),
    p(546645, ["Supervisor de TI"]),
    p(217495, ["Tratador de Animais Terceirizado"]),
    p(368070, ["Técnico Agrícola"]),
    p(261476, ["Técnico em Administração (Nível Médio)"]),
    p(598233, ["Técnico em Administração (Nível Superior)"]),
    p(215683, ["Técnico em Secretariado"]),
    p(290000, ["Técnico em Secretariado Tipo II (Nível Intermediário)"]),
    p(220424, ["Técnico de Controle de Pragas"]),
    p(376316, ["Técnico de Informática I"]),
    p(468446, ["Técnico de Informática II"]),
    p(242027, ["Técnico de Manutenção de Telefone"]),
    p(503750, ["Técnico em Edificações Terceirizado"]),
    p(376318, ["Técnico em Refrigeração"]),
    p(241987, ["Técnico em Cabeamento de Rede Terceirizado"]),
    p(405802, ["Técnico em Meio Ambiente Terceirizado"]),
    p(246151, ["Técnico em Segurança do Trabalho Terceirizado"]),
    p(376318, ["Técnico de Suporte em Informática I"]),
    p(468446, ["Técnico de Suporte em Informática II"]),
    p(475210, ["Técnico de Suprimento I"]),
    p(499938, ["Técnico de Suprimento II"]),
    p(257112, ["Técnico de Suporte Helpdesk Terceirizado"]),
    p(195028, ["Telefonista"]),
    p(236092, ["Telefonista / Recepcionista Bilingue"]),
    p(331884, ["Técnico em Eletrônica"]),
    p(166363, ["Triador de Resíduos Sólidos"]),
  ],
  // Cláusula 3ª, § 1º — quem ganha acima do piso ou tem função fora da tabela: reajuste mínimo.
  reajuste: { percentual: 6.79, desde: "2026-01-01" },
  // § 3º — líder de serviços em contrato de 5 a 10 colaboradores; acima de 10, encarregado.
  lideranca: { liderDe: 5, liderAte: 10, funcaoLider: "Líder de Serviços", funcaoEncarregado: "Encarregado de Serviços" },

  // Cláusula 6ª e 3ª § 4º — adicionais sobre o salário mínimo nacional ou o salário-base.
  insalubridade: {
    minimoEmHospital: 20,
    porFuncao: [{ funcao: "Agente de Limpeza Banheirista", grau: 40, cbo: "514225", desde: "2023-01-01" }],
  },
  gratificacoes: [
    { funcao: "Piloto Fluvial Terceirizado", nome: "Gratificação de comando", percentual: 40, base: "SALARIO_BASE" },
    { funcao: "Piloto Fluvial Terceirizado", nome: "Gratificação de praticagem", percentual: 40, base: "SALARIO_BASE" },
    { funcao: "Piloto Fluvial Terceirizado", nome: "Adicional de insalubridade", percentual: 20, base: "SALARIO_MINIMO" },
  ],

  // Cláusula 5ª — 13º em duas parcelas: 30/11 e 20/12 (igual à lei).
  decimoTerceiro: { primeiraAte: "11-30", segundaAte: "12-20" },

  // Cláusula 7ª — vale-refeição (cartão) por dia, sem natureza salarial; desconto de até 10%;
  // falta (justificada ou não) desconta o dia; dispensado com refeitório próprio ou do tomador.
  valeRefeicao: { porDia: 2450, descontoMaximoPercentual: 10, faltaDescontaDia: true, dispensadoComRefeitorio: true },
  // Cláusula 8ª — cesta básica só para associados ao sindicato laboral, entregue até o dia 10 do
  // mês seguinte. Perde: falta injustificada ou atestado acima de 1 dia; atrasos somando 8 h;
  // afastamento ou férias; admitido ou desligado sem 30 dias trabalhados no mês.
  cestaBasica: { valor: 18000, soAssociados: true, faltasToleradas: 1, atrasosHorasLimite: 8, perdeEmFeriasOuAfastamento: true, exigeMesCompleto: true, entregaAteDia: 10 },
  // Cláusula 9ª — vale-transporte: 6% do salário-base; na escala 12x36, 3%.
  valeTransporte: { descontoPercentual: 6, descontoPercentual12x36: 3 },
  // Cláusulas 10ª, 12ª, 13ª e 18ª — custos mensais da empresa por colaborador.
  custosPorColaborador: [
    { chave: "PLANO_ODONTOLOGICO", nome: "Plano odontológico", valor: 1600, clausula: 10 },
    { chave: "ASSISTENCIA_SOCIAL", nome: "Assistência social e familiar (SEAC-AM)", valor: 2000, clausula: 12, vencimento: "10º dia útil" },
    { chave: "SEGURO_VIDA", nome: "Seguro de vida (R$ 5.000,00)", valor: 500, clausula: 13, soContratosApos: "2026-01-23" },
    { chave: "QUALIFICACAO", nome: "Programa de qualificação profissional (SEAC-AM)", valor: 1000, clausula: 18, vencimento: "10º dia útil" },
  ],
  // Cláusula 11ª — plano de saúde opcional, descontado integralmente do colaborador.
  planoSaude: { opcional: true, descontoIntegral: true },

  // Cláusulas 19ª a 22ª — jornada.
  bancoHoras: { exigeAdesaoEscrita: true, horasPagasNoMes: 20, acimaDeHorasMensais: 192, adicionalPago: 50, prazoDias: 90, adicionalSaldo: 50 },
  escala12x36: { divisor: 192, adicionalNoturno: 20, noturnoDe: "22:00", noturnoAte: "05:00", horaNoturnaReduzida: false, intervaloIndenizadoPercentual: 50, domingosEFeriadosCompensados: true },
  tempoParcial: { permitidoSoComPisoIntegral: true, feriasDias: 30 },

  // Cláusulas 16ª e 17ª — rescisão.
  rescisao: {
    pagamentoDias: 10,
    homologacaoSindicalAcimaDeMeses: 12,
    entregaDocumentosDias: 20,
    multaDocumentosForaDoPrazo: "1/3 do salário nominal",
    exigePPP: true,
    taxaHomologacao: { regular: 5000, demais: 10000 },
    // Sucessão de contrato (nova licitação ou novo contrato): o colaborador segue com a nova
    // prestadora e a rescisão é por acordo — multa de 20% do FGTS e metade do aviso indenizado.
    sucessaoContratual: { motivoESocial: "33", multaFGTS: 20, avisoIndenizadoFracao: 0.5 },
    // Cláusula 37ª — dispensa no mês anterior à data-base por fim do contrato com o tomador: sem a
    // indenização adicional do art. 9º da Lei 7.238/1984.
    isentaIndenizacaoAdicionalFimDeContrato: true,
  },

  // Cláusulas 29ª a 31ª — contribuições descontadas do colaborador (com direito de oposição).
  contribuicoes: {
    assistencial: { mes: 2, associado: 2000, naoAssociado: 4000, oposicaoAte: "2026-02-13", naoDescontaAdmitidosDepois: true, repasseAte: "10º dia útil" },
    mensalidadeAssociativa: { percentualSalarioBase: 2, minimo: 3311, oposicaoAQualquerTempo: true, repasseAte: "10º dia útil" },
  },
  // Cláusula 28ª — contribuição negocial patronal, por faixa de colaboradores (valor por mês).
  contribuicaoNegocialPatronal: [
    { ate: 3, valor: 15000 }, { ate: 10, valor: 25000 }, { ate: 20, valor: 35000 }, { ate: 30, valor: 45000 },
    { ate: 50, valor: 55000 }, { ate: 80, valor: 65000 }, { ate: 110, valor: 75000 }, { ate: 150, valor: 85000 },
    { ate: 200, valor: 95000 }, { ate: null, valor: 125000 },
  ],
  // Cláusula 41ª — multa por descumprimento, por colaborador.
  multaDescumprimento: { primeira: "1/3 do salário mínimo da CCT", reincidencia: "1/2 salário mínimo da CCT" },

  // Cláusula 45ª — encargos sociais mínimos nas propostas de preço (planilha de custo), por jornada.
  encargosMinimos: {
    jornadas: ["40H_SEG_SEX", "44H_SEG_SEX", "44H_SEG_SAB", "12X36"],
    total: { "40H_SEG_SEX": 81.98, "44H_SEG_SEX": 81.98, "44H_SEG_SAB": 81.86, "12X36": 82.27 },
    grupos: [
      { grupo: "A", nome: "Encargos sociais", itens: [
        ["INSS", 20, 20, 20, 20], ["FGTS", 8, 8, 8, 8], ["SESC", 1.5, 1.5, 1.5, 1.5], ["SENAC", 1, 1, 1, 1],
        ["SEBRAE", 0.6, 0.6, 0.6, 0.6], ["INCRA", 0.2, 0.2, 0.2, 0.2], ["Salário-educação", 2.5, 2.5, 2.5, 2.5], ["RAT", 3, 3, 3, 3],
      ], total: [36.8, 36.8, 36.8, 36.8] },
      { grupo: "B", nome: "Custos e substituições", itens: [
        ["Férias gozadas", 8.25, 8.25, 8.24, 8.27], ["Auxílio-doença", 2.69, 2.69, 2.68, 2.69], ["Afastamentos de mais de 15 dias", 0.13, 0.13, 0.13, 0.13],
        ["Licença-paternidade", 0.01, 0.01, 0.01, 0.01], ["Acidente de trabalho", 0.01, 0.01, 0.01, 0.01], ["Faltas legais", 0.76, 0.76, 0.76, 0.76],
        ["Treinamento", 0.39, 0.39, 0.33, 0.54],
      ], total: [12.24, 12.24, 12.16, 12.41] },
      { grupo: "C", nome: "Indenizações", itens: [
        ["1/3 constitucional de férias", 2.75, 2.75, 2.75, 2.76], ["13º salário", 9.34, 9.34, 9.33, 9.35], ["Aviso prévio trabalhado", 0.14, 0.14, 0.14, 0.14],
      ], total: [12.23, 12.23, 12.22, 12.25] },
      { grupo: "D", nome: "Rescisões", itens: [
        ["Aviso prévio indenizado", 3.52, 3.52, 3.52, 3.53], ["Complemento do aviso prévio (Lei 12.506)", 0.82, 0.82, 0.82, 0.82],
        ["Reflexos no 13º e nas férias", 0.84, 0.84, 0.84, 0.85], ["Indenização compensatória (multa do FGTS)", 4.01, 4.01, 4.01, 4.02],
        ["Indenização adicional (Lei 7.238/1984, art. 9º)", 0.52, 0.52, 0.52, 0.52], ["Férias indenizadas", 0.84, 0.84, 0.84, 0.84],
        ["1/3 de férias indenizadas", 0.28, 0.28, 0.28, 0.28],
      ], total: [10.83, 10.83, 10.83, 10.86] },
      { grupo: "E", nome: "Complementares", itens: [["Abono pecuniário", 0.26, 0.26, 0.26, 0.26], ["1/3 do abono pecuniário", 0.09, 0.09, 0.09, 0.09]], total: [0.35, 0.35, 0.35, 0.35] },
      { grupo: "F", nome: "Incidências", itens: [
        ["FGTS sobre aviso prévio indenizado", 0.35, 0.35, 0.35, 0.35], ["Incidências do salário-maternidade", 0.15, 0.15, 0.15, 0.15],
        ["FGTS sobre 1/12 do 13º indenizado", 0.03, 0.03, 0.03, 0.03], ["Incidência do grupo A sobre B + C", 9, 9, 8.97, 9.07],
      ], total: [9.53, 9.53, 9.5, 9.6] },
    ],
  },

  clausulas: [
    [1, "Vigência e data-base"], [2, "Abrangência"], [3, "Piso salarial"], [4, "Comprovantes de pagamento"], [5, "13º salário"],
    [6, "Adicional de insalubridade"], [7, "Vale-refeição"], [8, "Cesta básica"], [9, "Vale-transporte"], [10, "Plano odontológico"],
    [11, "Plano de saúde"], [12, "Assistência social e familiar"], [13, "Seguro de vida"], [14, "Empréstimo consignado"],
    [15, "Registro na CTPS Digital e eSocial"], [16, "Continuidade dos contratos (sucessão)"], [17, "Homologação da rescisão"],
    [18, "Programa de qualificação profissional"], [19, "Banco de horas"], [20, "Abono de faltas (acompanhamento)"], [21, "Jornada 12x36"],
    [22, "Trabalho por tempo parcial"], [23, "Validade dos atestados"], [24, "Uniformes e EPI"], [25, "Quadro de avisos"],
    [26, "Liberação do dirigente sindical"], [27, "Remessa do comprovante do FGTS"], [28, "Contribuição negocial patronal"],
    [29, "Contribuição assistencial laboral"], [30, "Contribuição associativa patronal"], [31, "Mensalidade associativa laboral"],
    [32, "Certidão de regularidade sindical"], [33, "Certidões"], [34, "Empresas de outros estados"], [35, "Cópias da CCT"],
    [36, "Declaração anual de quitação (art. 507-B)"], [37, "Encerramento de contrato na data-base"], [38, "Acordo coletivo"],
    [39, "Comissão de Conciliação Prévia"], [40, "Comissão de autoconstatação"], [41, "Multa"], [42, "Objetivo"],
    [43, "Beneficiários"], [44, "Disposições finais"], [45, "Tabela de encargos sociais"],
  ].map(([numero, assunto]) => ({ numero, assunto })),
};
