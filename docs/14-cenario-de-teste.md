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

## 4. Convenções coletivas

| Convenção | Aplica-se a |
|---|---|
| Comércio e serviços (empresa de trabalho temporário) | Administrativo próprio |
| Asseio e conservação | Terceirizados de T1 e T3 |
| Vigilância | Terceirizados de T4 |

Temporários seguem a remuneração da tomadora, não a convenção da prestadora.

## 5. Movimento mensal simulado

| Evento | Por mês | Observação |
|---|---|---|
| Admissões | ~110 | Maior parte temporários: 600 com permanência média de 6 meses renovam ~100 por mês |
| Desligamentos | ~110 | Fim de contrato temporário é o principal motivo |
| Prorrogações de temporário (após 180 dias) | ~15 | Com justificativa |
| Afastamentos | ~20 | Doença, acidente, maternidade |
| Férias | ~30 | Terceirizados e administrativo |
| Coberturas de posto | ~40 | Faltas e férias em T3 e T4 |

## 6. Casos-limite obrigatórios na massa

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

## 7. O que o cenário mede

- A folha dos 1.000 fecha sem erro e dentro do tempo definido.
- O rateio por tomador, contrato e posto soma exatamente o total da folha, centavo a centavo.
- Os eventos do eSocial saem com a lotação certa por tomador.
- Cada tomador recebe fatura coerente com o ponto que aprovou.
- Os alertas de prazo do temporário disparam no dia certo.
