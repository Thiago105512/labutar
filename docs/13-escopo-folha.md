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
| Rubricas parametrizáveis (proventos, descontos, bases) com fórmulas e incidências | E | A | 📋 | `folha` |
| Modelo temporal: toda regra e tabela com vigência por competência | E | A | 📋 | `tabelas-legais`; o padrão de parâmetro com vigência já existe em `mao-de-obra` (`PARAMETROS_LEGAIS`) e na tabela salarial do tomador |
| Recálculo retroativo e reprodução exata de competências passadas | E | A | ⬜ | Exige guardar a versão das regras usada em cada cálculo |
| Tabelas: INSS, IRRF, salário mínimo, salário-família, pisos | E | M | 📋 | IRRF 2026 pela Lei 15.270/2025 — **verificar** |
| Folha mensal, adiantamento, complementar | E | M | 📋 | Mensal prevista; adiantamento e complementar entram com este escopo |
| 13º salário (1ª e 2ª parcelas, médias) | E | M | 📋 | |
| Férias (gozadas, indenizadas, abono, fracionamento, 1/3) | E | M | 📋 | |
| Rescisão em todas as modalidades, incluindo acordo (art. 484-A CLT) | E | A | 🟡 | Aviso prévio proporcional pronto em `core`; verbas em `rescisao` |
| Horas extras, adicional noturno, DSR, insalubridade, periculosidade, comissões | E | M | 📋 | Insalubridade/periculosidade pelo **local do posto** (docs/11); comissões ⬜ |
| Médias e reflexos (férias, 13º, rescisão) | E | A | ⬜ | |
| Pensão alimentícia (desconto e repasse, incidência em férias e 13º) | E | M | ⬜ | |
| Consignado, vale-transporte, plano de saúde, coparticipação | E | M | 🟡 | VT e plano previstos em benefícios; consignado e coparticipação ⬜ |
| Aritmética decimal com regras de arredondamento explícitas | E | B | ✅ | `core/dinheiro` (centavos inteiros, faixas progressivas, arredondamento) e `mao-de-obra/rateio` (maior resto, fecha no centavo) |
| Simulação de folha e de rescisão antes do fechamento | D | M | ⬜ | |
| Críticas automáticas e comparação com a folha anterior | D | M | ⬜ | |
| Cálculo de PLR e bonificações com tributação própria | D | M | ⬜ | |
| Motor de regras configurável por usuário de RH, sem código | F | A | ⬜ | |
| Explicação do cálculo em linguagem natural ("por que este valor?") | F | A | ⬜ | Base de IA com desidentificação existe em `ia` |

## 2. Cadastro e vida funcional — `colaboradores`, `admissao`, `mao-de-obra`

| Item | Prio | Compl. | Status | Onde / observação |
|---|---|---|---|---|
| Admissão (checklist documental, exame admissional) | E | M | 🟡 | `admissao` com contrato reservado; modelo em docs/02 |
| Vínculos: CLT, aprendiz, estagiário, intermitente, temporário, autônomo (RPA), pró-labore, doméstico, avulso | E | M | 🟡 | Temporário, terceirizado e próprio com regras legais prontas (`mao-de-obra`); demais ⬜ |
| Dependentes, dados bancários, documentos, histórico contratual | E | B | 📋 | |
| Alterações de cargo, salário, lotação, jornada, centro de custo, com histórico | E | M | 🟡 | Lotação/alocação com histórico e centro de custo prontos; cargo, salário e jornada ⬜ |
| Afastamentos (doença, acidente, maternidade, licenças), retorno, estabilidades | E | M | 📋 | Estabilidades ⬜ |
| Férias: períodos aquisitivo e concessivo, alertas de vencimento | E | M | 📋 | |
| Contrato de experiência e prorrogações, com alertas | E | M | ⬜ | Prazo do temporário (180 + 90) já tem alerta |
| Plano de cargos e salários, organograma | D | B | ⬜ | |
| Transferência entre empresas do grupo | D | M | ⬜ | |
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
| Cadastro de sindicatos, categorias, datas-base | E | M | 📋 | Entidade Convenção em docs/11 |
| Acordos coletivos por tomador ou para toda a empresa, com prevalência sobre a convenção | E | A | ⬜ | Abrangência: empresa, tomador, contrato ou posto |
| Pisos, reajustes e adicionais por convenção | E | A | 📋 | |
| Regras de jornada e benefícios por convenção | E | A | 📋 | |
| Contribuições sindicais e assistenciais, com regras de oposição | E | M | ⬜ | |
| Aplicação automática por colaborador | E | A | 📋 | Por vínculo e, no terceirizado, pela categoria da prestadora |
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
| Custo de pessoal por área, cargo, centro de custo | E | M | 🟡 | Rateio por centro de custo pronto; relatório ⬜ |
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
| Suíte de regressão com casos reais de cálculo | E | A | 🟡 | CI com 600+ testes, inclusive sobre PostgreSQL; casos reais de folha ⬜ |
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
