# Escopo funcional: folha e gestão de pessoas

> Escopo definido pelo cliente em 2026-09-30 e adotado como **referência oficial** do
> produto. Cada item tem o status real no repositório nesta data. Atualize a coluna
> **Status** no mesmo PR que entregar o item.

**Prioridade:** [E] essencial · [D] desejável · [F] diferencial
**Complexidade:** (B) baixa · (M) média · (A) alta

**Status:**
✅ pronto e testado · 🟡 parcial (base existe, falta parte) · 📋 previsto na documentação ·
⬜ novo — entrou no planejamento com este escopo

Itens marcados **verificar** dependem de vigência legal a confirmar com jurídico, contador
ou especialista em DP antes de implementar (ver seção 16).

---

## 1. Motor de cálculo — pacote `folha`, tabelas em `tabelas-legais`

| Item | Prio | Compl. | Status | Onde / observação |
|---|---|---|---|---|
| Rubricas parametrizáveis (proventos, descontos, bases) com fórmulas e incidências | E | A | 🟡 | `folha/verbas`: catálogo `NNNN.VV` com incidências do eSocial; fórmulas configuráveis pelo usuário ⬜ |
| Modelo temporal: toda regra e tabela com vigência por competência | E | A | ✅ | `folha/tabelas`: competência sem tabela é recusada; 2020 e 2026 cadastrados (2021–2025 a cadastrar) |
| Recálculo retroativo e reprodução exata de competências passadas | E | A | ⬜ | Exige guardar a versão das regras usada em cada cálculo |
| Tabelas: INSS, IRRF, salário mínimo, salário-família, pisos | E | M | 🟡 | 2026 ✅ (Portaria Interministerial MPS/MF 13/2026; IRRF com simplificado e redução da Lei 15.270/2025); pisos ⬜ |
| Folha mensal, adiantamento, complementar | E | M | 🟡 | Mensal ✅ (setembro/2026 no painel); desconto do adiantamento ✅; folha de adiantamento e complementar ⬜ |
| 13º salário (1ª e 2ª parcelas, médias) | E | M | ✅ | `folha/decimo-terceiro`: avos (15 dias no mês), 1ª parcela até 30/11 sem impostos, 2ª até 20/12 com INSS e IRRF exclusivos (redução da Lei 15.270 inclusa); contrato que termina antes vai na rescisão. Médias entram como valor informado |
| Férias (gozadas, indenizadas, abono, fracionamento, 1/3) | E | M | 🟡 | `folha/ferias`: dias pelas faltas (art. 130), até 3 períodos (art. 134), início fora dos 2 dias antes de feriado/DSR, dobra fora do concessivo, abono isento, IRRF em separado, repartição por mês de gozo. ⬜ Gravar a programação e levar a parte do mês para a folha mensal |
| Rescisão em todas as modalidades, incluindo acordo (art. 484-A CLT) | E | A | 🟡 | `folha/rescisao` com motivos 01–07, 10 e 33 da Tabela 19: aviso proporcional e projeção, 13º e férias (vencidas, dobro, proporcionais, sobre o aviso), art. 479 (não no temporário), multa e saque do FGTS, prazo de 10 dias. ⬜ Gravar a rescisão, termo (TRCT) e S-2299; demais motivos da Tabela 19 |
| Horas extras, adicional noturno, DSR, insalubridade, periculosidade, comissões | E | M | 🟡 | ✅ com DSR pelo calendário do local (feriados do AM e de Manaus); comissões ⬜ |
| Médias e reflexos (férias, 13º, rescisão) | E | A | ⬜ | |
| Pensão alimentícia (desconto e repasse, incidência em férias e 13º) | E | M | ⬜ | |
| Consignado, vale-transporte, plano de saúde, coparticipação | E | M | 🟡 | VT ✅ no holerite; **Crédito do Trabalhador (eConsignado)** ✅ verba 9253.01, importação do arquivo mensal ⬜; plano e coparticipação ⬜ |
| Salário-paternidade e estabilidade (Lei 15.371/2026) | E | M | ⬜ | Vigência 01/01/2027 (10 dias; 15 em 2028; 20 em 2029), pago pelo INSS; estabilidade até 30 dias após o retorno |
| Aritmética decimal com regras de arredondamento explícitas | E | B | ✅ | `core/dinheiro` (centavos inteiros, faixas progressivas, arredondamento) e `mao-de-obra/rateio` (maior resto, fecha no centavo) |
| Simulação de folha e de rescisão antes do fechamento | D | M | 🟡 | Simulação de rescisão e de férias por colaborador na tela da folha ✅; folha antes do fechamento ⬜ |
| Críticas automáticas e comparação com a folha anterior | D | M | ⬜ | |
| Cálculo de PLR e bonificações com tributação própria | D | M | ⬜ | |
| Motor de regras configurável por usuário de RH, sem código | F | A | ⬜ | |
| Explicação do cálculo em linguagem natural ("por que este valor?") | F | A | ⬜ | Base de IA com desidentificação existe em `ia` |

## 2. Cadastro e vida funcional — `colaboradores`, `admissao`, `mao-de-obra`

| Item | Prio | Compl. | Status | Onde / observação |
|---|---|---|---|---|
| Admissão (checklist documental, exame admissional) | E | M | 🟡 | Admissão puxa os dados do recrutamento (candidato aprovado, com a candidatura indo para a etapa Admissão) ou do cadastro (readmissão pela mesma pessoa/CPF), ou começa do zero (`cadastro/origens`). Checklist documental e ASO: `admissao` com contrato reservado; modelo em docs/02 |
| Vínculos: CLT, aprendiz, estagiário, intermitente, temporário, autônomo (RPA), pró-labore, doméstico, avulso | E | M | 🟡 | Temporário, terceirizado e próprio com regras legais prontas (`mao-de-obra`); demais ⬜ |
| Dependentes, dados bancários, documentos, histórico contratual | E | B | 🟡 | Pessoa por CPF com dependentes (IR e salário-família) e vínculos por matrícula prontos (`cadastro`); dados bancários e documentos ⬜ |
| Alterações de cargo, salário, lotação, jornada, centro de custo, com histórico | E | M | 🟡 | Lotação/alocação e salário com vigência e histórico prontos (`cadastro`); cargo e jornada ⬜ |
| Afastamentos (doença, acidente, maternidade, licenças), retorno, estabilidades | E | M | 📋 | Estabilidades ⬜ |
| Férias: períodos aquisitivo e concessivo, alertas de vencimento | E | M | 🟡 | Períodos aquisitivo e concessivo calculados (`folha/avos`); histórico de gozo e alertas ⬜ |
| Contrato de experiência e prorrogações, com alertas | E | M | ⬜ | Prazo do temporário (180 + 90) já tem alerta |
| Plano de cargos e salários, organograma | D | B | ⬜ | |
| Transferência entre empresas do grupo | D | M | ⬜ | |
| Tomadores, contratos (temporário e prestação de serviços) e postos com vagas, adicionais e salário da tomadora | E | M | ✅ | `cadastro`; posto cheio impede admissão; remuneração equivalente (art. 12) e quarentena de 18 meses (art. 5-D) checadas |
| Importação da planilha do sistema anterior (prévia antes de gravar) | E | M | ✅ | Colunas em `cadastro/importacao.js`; CPF pode vir vazio e fica pendente |
| Admissão digital com reconhecimento de documentos por IA | F | M | 📋 | OCR previsto na admissão |

## 3. Obrigações legais — `esocial` e obrigações acessórias

| Item | Prio | Compl. | Status | Onde / observação |
|---|---|---|---|---|
| eSocial: tabelas (S-1000 e correlatos) | E | A | 📋 | Lotação por tomador (S-1020) descrita em docs/11 |
| eSocial: não periódicos (S-2200, S-2205, S-2206, S-2230, S-2299, S-2300, S-2399) | E | A | 🟡 | Contrato reservado para S-2200; S-2206/2230/2299 previstos; S-2205, S-2300/2399 ⬜ |
| eSocial: periódicos (S-1200, S-1210, S-1260, S-1299) | E | A | 📋 | S-1200 segregado por lotação usa o rateio pronto; S-1260 ⬜ |
| eSocial: SST (S-2210, S-2220, S-2240) | E | A | 📋 | Código herdado do S-2220 com defeitos inventariados (docs/05) |
| Tratamento de rejeições, retificações, exclusões | E | A | 📋 | Campos de retificação no modelo do evento |
| DCTFWeb e EFD-Reinf | E | A | 📋 | Reinf para cessão de mão de obra por tomador |
| FGTS Digital | E | A | 📋 | |
| CAGED | E | M | ⬜ | **verificar** situação atual (substituído pelo eSocial para a maioria dos empregadores) |
| PPP digital | E | M | ⬜ | |
| Guias de recolhimento e conciliação | E | M | ⬜ | |
| Conciliação com o registrado no governo (CNIS, FGTS, eSocial) | D | A | ⬜ | |
| Informe de rendimentos | D | M | 🟡 | Espaço no portal do colaborador; geração ⬜ |
| DIRF, RAIS | D | B | ⬜ | **verificar**: obrigações em substituição ou extintas |
| Monitoramento de mudanças de leiaute e legislação, com análise de impacto | F | A | ⬜ | |

## 4. Convenções coletivas e sindicatos — `tabelas-legais` / `folha`

No cenário de referência (docs/14): **1 convenção e vários acordos coletivos**. O acordo
prevalece sobre a convenção no que regula (art. 620 da CLT); a regra é resolvida por
colaborador, por dia e por assunto.

| Item | Prio | Compl. | Status | Onde / observação |
|---|---|---|---|---|
| Cadastro de sindicatos, categorias, datas-base | E | M | 🟡 | `convencoes`: instrumento com registro no MTE, sindicatos (CNPJ), vigência, data-base e abrangência; 1ª CCT: AM000038/2026 (docs/18). Cadastro pela tela ⬜ |
| Acordos coletivos por tomador ou para toda a empresa, com prevalência sobre a convenção | E | A | 🟡 | Regra de prevalência pronta (ACT do posto > tomador > empresa > CCT); aguardando os ACTs |
| Pisos, reajustes e adicionais por convenção | E | A | ✅ | Piso por função enquadrada no posto (piso geral fora da tabela), conformidade na folha, reajuste da data-base, insalubridade mínima e gratificações |
| Regras de jornada e benefícios por convenção | E | A | 🟡 | 12x36 (divisor 192, VT 3%), VR por dia com refeitório, cesta básica com as condições, custos por colaborador no custo do tomador ✅; banco de horas ⬜ (depende do ponto) |
| Contribuições sindicais e assistenciais, com regras de oposição | E | M | ✅ | Mensalidade associativa (2%, mínimo), assistencial no mês fixado, oposição na pessoa; negocial patronal por faixa |
| Aplicação automática por colaborador | E | A | ✅ | Enquadramento sindical da empresa por tipo de vínculo; cada holerite mostra instrumento, função e piso |
| Reajuste retroativo (dissídio) com recálculo de competências | E | A | ⬜ | Depende do recálculo retroativo (seção 1) |
| Leitura de convenção em PDF com sugestão de parametrização por IA | F | A | ⬜ | |

## 5. Ponto e jornada — `ponto`

| Item | Prio | Compl. | Status | Onde / observação |
|---|---|---|---|---|
| Conformidade com a Portaria MTP 671/2021 (REP-C, REP-P, REP-A) | E | A | 🟡 | **Relógio no tomador (REP-C) é o caso principal**; REP-P previsto; REP-A ⬜ (exige acordo coletivo) |
| Importação do AFD dos relógios dos tomadores e geração do AEJ (programa de tratamento, PTRP) | E | A | ⬜ | Envio pelo portal do tomador, importação ou integração com fabricante |
| Marcação por relógio, app, web, biometria/facial | E | M | 🟡 | Relógio via AFD (linha acima); app previsto; biometria no próprio relógio |
| Escalas (12x36, revezamento, turnos) | E | M | 📋 | Escala no cadastro do posto |
| Banco de horas e compensação | E | A | 📋 | |
| Faltas, atrasos, abonos, justificativas | E | M | 📋 | |
| Fechamento integrado à folha | E | M | 📋 | Ponto aprovado pelo tomador = base da folha e da fatura |
| Geolocalização, jornada externa e teletrabalho | D | M | 📋 | |
| Detecção de fraude em marcação | F | A | ⬜ | |

## 6. Saúde e segurança do trabalho — `sst`

| Item | Prio | Compl. | Status | Onde / observação |
|---|---|---|---|---|
| PGR e PCMSO | E | M | 📋 | |
| ASO e calendário de exames, com alertas | E | M | 📋 | |
| CAT e gestão de acidentes | E | M | 📋 | |
| Controle de EPI (entrega, validade, assinatura) | E | M | 📋 | Também no módulo de estoque |
| LTCAT, PPP e eventos de SST no eSocial | E | A | 🟡 | Eventos previstos; LTCAT e PPP ⬜ |
| CIPA e treinamentos obrigatórios (NRs) | D | M | 🟡 | Cursos e certificados prontos em `avaliacoes`; CIPA ⬜ |
| Gestão de riscos psicossociais | D | A | ⬜ | NR-1 atualizada — **verificar** |
| Integração com clínicas e laboratórios | F | M | ⬜ | |

## 7. Benefícios

| Item | Prio | Compl. | Status | Onde / observação |
|---|---|---|---|---|
| Vale-transporte, vale-refeição e alimentação | E | M | 📋 | Também na planilha de custos do comercial |
| Plano de saúde e odontológico, seguro de vida | E | M | 📋 | |
| Benefícios flexíveis | D | M | ⬜ | |
| Conciliação de faturas de operadoras por colaborador | D | A | ⬜ | |
| Integração com emissores de cartão | D | M | ⬜ | |
| Consignado via plataforma oficial | D | M | ⬜ | **verificar** regras vigentes |

## 8. Integrações financeiras e contábeis — `financeiro`, `contabil`

| Item | Prio | Compl. | Status | Onde / observação |
|---|---|---|---|---|
| Lançamentos contábeis e provisões (férias, 13º, encargos) | E | M | 📋 | |
| Rateio por centro de custo e projeto | E | M | 🟡 | Rateio por tomador/contrato/posto e setor **pronto** (`mao-de-obra/rateio`); projeto ⬜ |
| CNAB e pagamentos bancários | E | M | ⬜ | Pagamento em lote previsto; CNAB entra aqui |
| Exportação para contabilidade e ERP | E | M | 📋 | |
| Contas a pagar (guias, rescisões) | D | M | 📋 | |
| Open Finance e Pix de salários | F | M | 📋 | |

## 9. Portal e app do colaborador — `web/portal`

| Item | Prio | Compl. | Status | Onde / observação |
|---|---|---|---|---|
| Holerite, informe de rendimentos, espelho de ponto | E | B | 🟡 | Portal, login e isolamento prontos; conteúdo depende de folha e ponto |
| Solicitação de férias, abonos, declarações, alteração de dados | E | M | 🟡 | Idem |
| Assinatura digital com validade jurídica | D | M | 📋 | Contrato eletrônico na admissão |
| Comunicação e notificações | D | B | 🟡 | Templates, avisos e lembretes prontos em `comunica`; entrega real ⬜ |
| Autenticação forte | D | M | 📋 | 2FA previsto (docs/12) |
| Assistente conversacional de dúvidas trabalhistas | F | M | ⬜ | |

## 10. Gestão de pessoas (RH estratégico)

| Item | Prio | Compl. | Status | Onde / observação |
|---|---|---|---|---|
| Recrutamento e seleção, banco de talentos, onboarding | D | M | ✅ | `ats`, `avaliacoes`, painel e portal do candidato; onboarding 🟡 |
| Avaliação de desempenho, metas e OKRs | D | M | ⬜ | |
| Treinamento e trilhas | D | M | 🟡 | Cursos e certificados em `avaliacoes` |
| Pesquisa de clima e eNPS | D | B | ⬜ | |
| Desligamento: entrevista de saída e offboarding | D | M | ⬜ | Plano de desmobilização por contrato pronto (`mao-de-obra`) |
| Sucessão e gestão de competências | F | A | ⬜ | Competências já existem no cadastro de candidatos |

## 11. Analytics e gestão

| Item | Prio | Compl. | Status | Onde / observação |
|---|---|---|---|---|
| Custo de pessoal por área, cargo, centro de custo | E | M | 🟡 | Custo por lotação (tomador ou setor) com encargos na folha ✅; por cargo ⬜ |
| Turnover, absenteísmo, headcount, tempo de casa | D | M | ⬜ | |
| Projeção orçamentária e simulação de cenários | D | A | ⬜ | Planilha de custos do comercial cobre a formação de preço |
| Dashboards e relatórios configuráveis | D | M | 🟡 | Painel do recrutamento pronto |
| Risco trabalhista preditivo | F | A | ⬜ | |
| Provisão de passivo trabalhista por colaborador | F | A | ⬜ | |

## 12. Módulos específicos (nichos)

| Item | Prio | Compl. | Status | Onde / observação |
|---|---|---|---|---|
| **Terceirização e trabalho temporário (faturamento, repasse)** | D | A | 🟡 | **Foco do produto.** Regras legais, alocação, rateio e desmobilização prontos (`mao-de-obra`, docs/11); faturamento previsto |
| **Vigilância e facilities (postos, cobertura, convenção por posto)** | D | A | 🟡 | Postos, coberturas e rateio prontos; convenção por posto prevista |
| Folha doméstica (eSocial Doméstico) | D | A | ⬜ | Fora do foco inicial |
| Construção civil (CNO, obras, rateio por obra) | D | A | ⬜ | O rateio por posto serve de base para rateio por obra |
| Rural (safra, contratos de curta duração) | D | A | ⬜ | |
| Saúde (plantões, escalas, insalubridade) | D | A | ⬜ | |
| Servidor público (RPPS) | D | A | ⬜ | Arquitetura distinta; fora do foco |
| Cooperativas | D | A | ⬜ | |
| Cálculo judicial trabalhista | F | A | ⬜ | |

## 13. Plataforma, segurança e conformidade

| Item | Prio | Compl. | Status | Onde / observação |
|---|---|---|---|---|
| Multi-tenant, multi-empresa, multi-CNPJ, multi-filial | E | A | 🟡 | Multi-tenant com isolamento no banco (RLS) pronto; multi-CNPJ/filial ⬜ |
| Perfis e permissões granulares | E | M | 🟡 | Perfis, níveis por módulo, contas externas prontos (docs/12); **ações granulares por módulo** a fazer |
| Trilha de auditoria de cálculo e de acesso | E | A | 🟡 | Auditoria de acesso pronta; de cálculo ⬜ |
| LGPD: base legal, criptografia, log, retenção, descarte, dados sensíveis | E | A | 🟡 | Consentimento, anonimização, senhas com scrypt, tokens só em hash; criptografia em repouso e política de retenção ⬜ |
| Backup, alta disponibilidade, recuperação de desastres | E | M | ⬜ | Depende do provedor escolhido (docs/10) |
| Suíte de regressão com casos reais de cálculo | E | A | 🟡 | Folha real de 12/2020 (38 colaboradores, anonimizada): INSS, IRRF, FGTS, encargos e os 11 holerites mensais no centavo; e as 27 rescisões (saldo, férias com 1/3, 13º, INSS, INSS 13º, IRRF e líquido) no centavo |
| Ambiente de homologação separado | E | M | ⬜ | |
| API aberta e webhooks | D | M | 📋 | |
| Workflow de aprovação | D | M | ⬜ | |
| Gestão de documentos com validade jurídica | D | M | 📋 | |
| Certificações (ISO 27001, SOC 2) | D | M | ⬜ | |
| Configuração sem código | F | A | ⬜ | |

## 14. Operação e serviço

| Item | Prio | Compl. | Status | Onde / observação |
|---|---|---|---|---|
| Equipe de inteligência legislativa (trabalhista, previdenciária, tributária, eSocial) | E | A | ⬜ | Processo e pessoas, não código |
| Migração de dados de sistemas anteriores | E | A | 📋 | Importação prevista no roadmap |
| Suporte com SLA e base de conhecimento | E | M | ⬜ | |
| Treinamento de usuários | D | M | ⬜ | |
| Módulo multi-cliente para escritório contábil | D | M | ⬜ | |
| Rodada de folha em paralelo para clientes-piloto | D | M | 📋 | Previsto para o primeiro cliente (100 ativos) |

---

## 15. Ordem de construção

Adotada a ordem sugerida no escopo, com o foco do produto (terceirização e temporário)
dentro de cada fase:

| Fase | Módulos do escopo | Primeiras entregas |
|---|---|---|
| 1 | 1, 2, 4, 13 | Motor de cálculo com modelo temporal e rubricas; tabelas legais versionadas; cadastro de vínculos e histórico; convenções; permissões granulares por ação; **suíte de regressão com casos reais** |
| 2 | 3 | eSocial mínimo do nicho (tabelas, admissão, remuneração por lotação, desligamento) — próprio ou via middleware homologado |
| 3 | 5, 8, 9 | Ponto REP-P, integração contábil e bancária, portal do colaborador com holerite e ponto |
| 4 | 6, 7, 11 | SST, benefícios, analytics |
| 5 | 10, 12, diferenciais [F] | RH estratégico, demais nichos, recursos de IA |

Dois pontos já feitos antecipam fases: as regras de terceirização e temporário (nicho 12)
e o rateio por centro de custo (8) — são o diferencial e alimentam a folha desde o início.

## 16. Pontos a verificar antes de implementar

1. IRRF 2026 — regras da Lei 15.270/2025.
2. CAGED — situação atual frente ao eSocial.
3. DIRF e RAIS — substituição ou extinção.
4. NR-1 — gestão de riscos psicossociais.
5. Consignado — regras da plataforma oficial vigentes.
6. Leiautes vigentes do eSocial, DCTFWeb, EFD-Reinf e FGTS Digital (validar contra XSD).
   eSocial S-1.3 ✅ versionado em `packages/esocial/xsd/`, com teste que confere os padrões
   do Labutar (CNPJ, matrícula, código de verba) contra `tipos.xsd`.
7. Os pontos de interpretação da Lei 6.019/1974 listados em docs/11, seção 6.
8. Uso do relógio do tomador para registrar o ponto de empregados da prestadora: requisitos
   da Portaria MTP 671/2021 (identificação do empregador no AFD, acesso aos arquivos).
9. Registro do Labutar como programa de tratamento de ponto (PTRP) e atestado técnico.

## 17. O que o produto precisa de fora do código

A folha é o módulo de maior risco: um erro de cálculo atinge todos os clientes. Antes de
ligar a folha em produção:

- **Especialista em DP** revisando cada rubrica e a suíte de regressão.
- **Casos reais** de holerite, férias, 13º e rescisão (com dados pessoais removidos) como
  base da suíte — o cálculo do Labutar precisa bater, centavo a centavo, com o sistema atual.
- **Contador** validando incidências, provisões e retenções.
- **Acompanhamento legislativo contínuo** (item 14) — tabelas e leiautes mudam todo ano.
- **Folha em paralelo** com o sistema atual por 2 a 3 competências no cliente piloto.
