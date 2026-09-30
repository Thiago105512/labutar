# Cenário padrão de teste — 1.000 colaboradores

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

## 2. Tomadores: indústrias do Polo Industrial de Manaus

O foco da prestação de serviços são **indústrias do Polo Industrial de Manaus (PIM)**. Os 4
tomadores do cenário são indústrias fictícias do polo:

| Tomador | Temporários | Terceirizados | Total | Hipótese / serviço | O que testa |
|---|---|---|---|---|---|
| T1 — Eletroeletrônicos (TVs e áudio) | 350 | 50 | 400 | Temporário por acréscimo extraordinário (pico de produção do 2º semestre); terceirizado em limpeza | Volume, 3 turnos, adicional noturno, pico sazonal |
| T2 — Duas rodas (motocicletas) | 200 | 0 | 200 | Temporário por acréscimo extraordinário e substituição de férias coletivas | Admissões e desligamentos em massa, 180 + 90 dias |
| T3 — Informática e celulares | 50 | 150 | 200 | Temporário em substituição de afastados; terceirizado em logística interna e manutenção | Insalubridade por posto, turnos de revezamento |
| T4 — Plásticos e injeção (fornecedor do polo) | 0 | 100 | 100 | Portaria e controle de acesso, operação de empilhadeira | Coberturas de posto, adicional de função, NR-11 |
| **Total** | **600** | **300** | **900** | | |

O temporário recebe remuneração equivalente à dos empregados da tomadora na mesma função
(art. 12 da Lei 6.019/1974): cada tomador tem tabela salarial própria por função.

**Temporário: 180 + 90 dias.** Até 180 dias, consecutivos ou não, por tomadora (contados pela
raiz do CNPJ, todas as filiais juntas), prorrogáveis por até 90 dias com justificativa; depois,
90 dias de intervalo antes de nova contratação na mesma tomadora. **Já implementado e testado**
em `packages/mao-de-obra` (docs/11).

**Vigilância armada ou patrimonial fica fora:** só empresa autorizada pela Polícia Federal
pode prestá-la. No cenário, T4 tem portaria e controle de acesso, não vigilância.

### Particularidades do polo que o sistema precisa tratar

| Particularidade | Efeito no sistema |
|---|---|
| Fuso de Manaus (UTC−4, `America/Manaus`) | Dia do ponto, prazos e competência calculados no fuso local, não no de Brasília nem em UTC. Hoje parte do código deriva a data em UTC ou fixa −03:00: corrigir ao construir o `ponto` |
| 3 turnos, turno da noite cruzando a meia-noite | Jornada atribuída ao dia de início do turno; adicional noturno e hora reduzida |
| Sazonalidade (pico no 2º semestre, férias coletivas) | Picos de admissão e desligamento; muitos contratos chegando a 180 dias ao mesmo tempo |
| Ônibus fretado fornecido pela tomadora | Vale-transporte não devido nos dias com fretado; custo fora da fatura |
| Refeitório da tomadora | Desconto de alimentação conforme acordo; nada a pagar em vale-refeição |
| Feriados estaduais do Amazonas e municipais de Manaus | Calendário de feriados por município e por vigência em `tabelas-legais` (datas a conferir) |
| Relógios dos tomadores de fabricantes diferentes | Importação de AFD padronizada pela Portaria MTP 671/2021, sem depender do fabricante |

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
| ACT-T2 | Acordo | Alocados em T2 | Férias coletivas, compensação de dias-ponte |
| ACT-T3 | Acordo | Alocados em T3 | Turnos de revezamento, intervalo, feriados trabalhados |
| ACT-T4 | Acordo | Alocados em T4 | Escala de portaria, cobertura de posto, adicional de função |
| ACT-Ponto | Acordo | Toda a empresa | Tolerâncias de marcação e, se for o caso, autorização de REP-A |
| ACT-PLR | Acordo | Toda a empresa | Participação nos lucros |

A regra aplicável é resolvida **por colaborador, por dia e por assunto**: quem muda de tomador
no meio do mês passa a seguir o acordo do novo tomador a partir do dia da mudança — o mesmo
modelo diário da alocação (docs/11). Temporários seguem, além disso, a remuneração equivalente
à da tomadora (art. 12 da Lei 6.019/1974).

## 5. Ponto: relógio no tomador

O ponto é marcado em **relógio instalado em cada tomador** (REP-C). O Labutar não marca o
ponto; ele funciona como o programa de tratamento (PTRP, Portaria MTP 671/2021):

1. Coleta o **AFD** (arquivo fonte de dados) de cada relógio: envio pelo portal do tomador,
   importação pela equipe ou integração com o fabricante.
2. Identifica o colaborador pelo CPF e a alocação do dia.
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

No pico do 2º semestre as admissões de temporários podem dobrar; em janeiro, com o fim dos
contratos do pico, os desligamentos dobram.

## 7. Casos-limite obrigatórios na massa

A massa gerada precisa conter, de propósito:

1. Temporário que chega a 180 dias e é prorrogado até 270.
2. Temporário que chega a 180 dias sem prorrogação (alerta e desligamento).
3. Tentativa de recontratar temporário na mesma tomadora antes de 90 dias (bloqueio).
4. Temporário que já trabalhou para outra filial da mesma tomadora (mesma raiz de CNPJ).
5. Ex-empregado de tomador contratado como terceirizado antes de 18 meses (bloqueio).
6. Colaborador que muda de tomador no meio do mês (rateio em dois centros de custo).
7. Colaborador sem alocação em alguns dias (vai para o balde sem alocação).
8. Terceirizado em T3 que cobre posto em T4 (cobertura entre tomadores e adicionais diferentes).
9. Afastamento que atravessa o fim do contrato temporário.
10. Admissão e desligamento dentro da mesma competência.
11. Colaborador que muda de T1 para T3 no meio do mês (acordo coletivo muda no dia).
12. Mais de 100 temporários de T1 atingindo 180 dias na mesma semana, no fim do pico.
13. Reajuste da convenção retroativo à data-base, com acordo vigente que não trata de salário.
14. Turno da noite das 22h às 6h do dia seguinte, no fuso de Manaus (dia do ponto, adicional noturno).

## 8. O que o cenário mede

- A folha dos 1.000 fecha sem erro e dentro do tempo definido.
- O rateio por tomador, contrato e posto soma exatamente o total da folha, centavo a centavo.
- Os eventos do eSocial saem com a lotação certa por tomador.
- Cada tomador recebe fatura coerente com o ponto que aprovou.
- Os alertas de prazo do temporário disparam no dia certo.

## 9. Caso real de regressão (dezembro/2020)

Folha analítica real de uma empresa de trabalho temporário (38 colaboradores, 27 rescisões),
guardada **sem nomes, matrículas, cargos nem datas** em `packages/folha/test/casos/`. O motor
bate no centavo com o sistema anterior quando configurado como ele:

| Parâmetro | Sistema anterior | Padrão do Labutar |
|---|---|---|
| Arredondamento do INSS | Trunca cada faixa | Arredonda cada faixa |
| Arredondamento do FGTS | Trunca | Arredonda |
| IRRF de até R$ 10,00 | Retém | Dispensa (Lei 9.430/1996, art. 67) |
| IRRF de quem recebeu outro pagamento no mês | Soma à base (regime de caixa) | Igual |

Qual regra de arredondamento vale é conferido com os totalizadores do eSocial (S-5001 e
S-5003) antes da produção; até lá, cada empresa escolhe nos parâmetros da folha.
