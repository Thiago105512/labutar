# Cenário padrão de teste — 1.000 trabalhadores

> Cenário **fictício** definido em 2026-09-30 para testar volume e regras. Toda massa de
> dados gerada para testes, demonstração e medição de desempenho segue este documento.
> Não substitui os casos reais de folha (docs/13, seção 17): a massa fictícia prova que o
> sistema aguenta e aplica as regras; os casos reais provam que o cálculo bate no centavo.

## 1. Composição

| Vínculo | Quantidade | Categoria eSocial | Onde trabalha |
|---|---|---|---|
| Temporário (Lei 6.019/1974) | 600 | 106 | Tomadores |
| Terceirizado (prazo indeterminado) | 300 | 101 | Tomadores |
| Próprio, prazo indeterminado | 100 | 101 | Administrativo da empresa |
| **Total** | **1.000** | | |

## 2. Tomadores

| Tomador | Temporários | Terceirizados | Total | Hipótese / serviço | O que testa |
|---|---|---|---|---|---|
| T1 — Indústria (polo industrial) | 350 | 50 | 400 | Temporário por acréscimo extraordinário de serviços; terceirizado em limpeza | Volume, turnos, adicional noturno, pico de produção |
| T2 — Varejo (rede de supermercados) | 200 | 0 | 200 | Temporário por acréscimo (fim de ano) e substituição de férias | Admissões e desligamentos em massa, 180 + 90 dias |
| T3 — Hospital | 50 | 150 | 200 | Temporário em substituição de licenças; terceirizado em higienização e recepção | Insalubridade pelo local do posto, escala 12x36 |
| T4 — Centro logístico | 0 | 100 | 100 | Vigilância e portaria | Periculosidade, convenção de vigilância, coberturas de posto |
| **Total** | **600** | **300** | **900** | | |

O temporário recebe remuneração equivalente à dos empregados da tomadora na mesma função
(art. 12 da Lei 6.019/1974): cada tomador tem tabela salarial própria por função.

## 3. Administrativo próprio (100)

| Setor | Pessoas |
|---|---|
| Diretoria e gestão | 5 |
| Recrutamento e seleção | 15 |
| Departamento pessoal | 12 |
| Financeiro e faturamento | 10 |
| Comercial | 8 |
| Operações (supervisores de posto, SST) | 40 |
| Apoio (TI, jurídico, compras, almoxarifado) | 10 |

Os supervisores de operação visitam os tomadores, mas o custo deles é administrativo e
entra no rateio de despesas indiretas entre os contratos.

## 4. Normas coletivas: 1 convenção e vários acordos

A empresa tem **uma convenção coletiva (CCT)** e **vários acordos coletivos (ACT)**. O acordo
prevalece sobre a convenção naquilo que regula (art. 620 da CLT); o que o acordo não regula
vem da convenção; o que nenhum dos dois regula vem da lei.

| Norma | Tipo | Abrangência | Cláusulas que regula |
|---|---|---|---|
| CCT da categoria | Convenção | Todos os empregados da empresa | Piso, reajuste anual, adicionais, benefícios, contribuições |
| ACT-T1 | Acordo | Alocados em T1 | Turnos de revezamento, adicional noturno diferenciado, banco de horas |
| ACT-T3 | Acordo | Alocados em T3 | Escala 12x36, intervalo, feriados trabalhados |
| ACT-T4 | Acordo | Alocados em T4 | Escala de vigilância, cobertura de posto, adicional de função |
| ACT-Ponto | Acordo | Toda a empresa | Tolerâncias de marcação e, se for o caso, autorização de REP-A |
| ACT-PLR | Acordo | Toda a empresa | Participação nos lucros |

A regra aplicável é resolvida **por trabalhador, por dia e por assunto**: quem muda de tomador
no meio do mês passa a seguir o acordo do novo tomador a partir do dia da mudança — o mesmo
modelo diário da alocação (docs/11). Temporários seguem, além disso, a remuneração equivalente
à da tomadora (art. 12 da Lei 6.019/1974).

## 5. Ponto: relógio no tomador

O ponto é marcado em **relógio instalado em cada tomador** (REP-C). O Labutar não marca o
ponto; ele funciona como o programa de tratamento (PTRP, Portaria MTP 671/2021):

1. Coleta o **AFD** (arquivo fonte de dados) de cada relógio: envio pelo portal do tomador,
   importação pela equipe ou integração com o fabricante.
2. Identifica o trabalhador pelo CPF e a alocação do dia.
3. Aplica escala, tolerâncias e o acordo coletivo daquele tomador.
4. Gera espelho, banco de horas e ocorrências; o tomador aprova no portal.
5. Gera o **AEJ** (arquivo eletrônico de jornada) e envia o ponto aprovado à folha e ao faturamento.

Na massa: 4 tomadores, pelo menos 2 fabricantes de relógio, marcações faltando, marcação em
relógio de tomador diferente do alocado (cobertura) e AFD reenviado com marcações repetidas.

## 6. Movimento mensal simulado

| Evento | Por mês | Observação |
|---|---|---|
| Admissões | ~110 | Maior parte temporários: 600 com permanência média de 6 meses renovam ~100 por mês |
| Desligamentos | ~110 | Fim de contrato temporário é o principal motivo |
| Prorrogações de temporário (após 180 dias) | ~15 | Com justificativa |
| Afastamentos | ~20 | Doença, acidente, maternidade |
| Férias | ~30 | Terceirizados e administrativo |
| Coberturas de posto | ~40 | Faltas e férias em T3 e T4 |

## 7. Casos-limite obrigatórios na massa

A massa gerada precisa conter, de propósito:

1. Temporário que chega a 180 dias e é prorrogado até 270.
2. Temporário que chega a 180 dias sem prorrogação (alerta e desligamento).
3. Tentativa de recontratar temporário na mesma tomadora antes de 90 dias (bloqueio).
4. Temporário que já trabalhou para outra filial da mesma tomadora (mesma raiz de CNPJ).
5. Ex-empregado de tomador contratado como terceirizado antes de 18 meses (bloqueio).
6. Trabalhador que muda de tomador no meio do mês (rateio em dois centros de custo).
7. Trabalhador sem alocação em alguns dias (vai para o balde sem alocação).
8. Terceirizado em T3 que cobre posto em T4 (cobertura entre tomadores e adicionais diferentes).
9. Afastamento que atravessa o fim do contrato temporário.
10. Admissão e desligamento dentro da mesma competência.
11. Trabalhador que muda de T1 para T3 no meio do mês (acordo coletivo muda no dia).
12. Reajuste da convenção retroativo à data-base, com acordo vigente que não trata de salário.

## 8. O que o cenário mede

- A folha dos 1.000 fecha sem erro e dentro do tempo definido.
- O rateio por tomador, contrato e posto soma exatamente o total da folha, centavo a centavo.
- Os eventos do eSocial saem com a lotação certa por tomador.
- Cada tomador recebe fatura coerente com o ponto que aprovou.
- Os alertas de prazo do temporário disparam no dia certo.
