# Domínio: empresa de mão de obra

> **Este é o documento central do Labutar.** O produto é feito para empresas cujo negócio
> é fornecer pessoas a outras empresas — trabalho temporário e prestação de serviços
> terceirizados — e que também têm seus próprios empregados. Todo módulo (ponto, folha,
> faturamento, eSocial, comercial) parte das definições abaixo.
>
> Regras implementadas: `packages/mao-de-obra` (JS puro, com testes).
> Status: 2026-09-30. Onde a lei admite leitura diferente, o texto diz **"a validar"** e o
> código usa um parâmetro em `PARAMETROS_LEGAIS`, não um número fixo.

## 1. Por que isso é o diferencial

Um ATS comum termina na contratação. Uma folha comum trata todo mundo como empregado da
empresa, lotado num departamento. Nenhum dos dois responde às perguntas que a empresa de
mão de obra faz todo dia:

- Quem está trabalhando **em qual tomador, em qual posto, hoje**?
- Quanto do salário deste mês de cada pessoa vai para **a fatura de cada cliente**?
- Este temporário pode continuar na mesma tomadora? **Até quando?**
- O contrato com o cliente acabou: **quem é desligado e quem é realocado?**
- A tomadora pede comprovação: **só os documentos dos trabalhadores dela**, deste mês.
- Qual é a **margem real** de cada contrato, depois de faltas, coberturas e encargos?

O Labutar responde porque trata **vínculo**, **alocação** e **centro de custo** como
conceitos de primeira classe, ligados entre si desde a admissão até a fatura.

## 2. Os três vínculos

Os três coexistem **na mesma empresa, na mesma folha e no mesmo CNPJ** (ou filiais).
O que muda é a regra.

| | Temporário | Terceirizado | Próprio |
|---|---|---|---|
| **Base legal** | Lei 6.019/1974, arts. 2º a 12 (red. Lei 13.429/2017); Decreto 10.060/2019 | Lei 6.019/1974, arts. 4-A a 5-D (red. Leis 13.429 e 13.467/2017) | CLT |
| **Contrato com o cliente** | Contrato de trabalho temporário com a tomadora (art. 9º) | Contrato de prestação de serviços (art. 5-B) | — |
| **Onde trabalha** | Posto na tomadora | Posto na tomadora | Setor interno (RH, DP, comercial, supervisão…) |
| **Motivo** | Obrigatório: substituição transitória de pessoal permanente ou demanda complementar (art. 2º) | Livre: qualquer atividade, inclusive a principal (art. 4-A) | — |
| **Prazo** | 180 dias, consecutivos ou não, + prorrogação de até 90 (art. 10, §§1º e 2º) | Em geral indeterminado | Indeterminado |
| **Quarentena** | 90 dias para voltar à mesma tomadora após cumprir o prazo (art. 10, §5º) | Ex-empregado da tomadora: 18 meses (art. 5-D) | — |
| **Salário** | Equivalente ao dos empregados da tomadora na mesma função, base horária (art. 12, "a") | Convenção da categoria da prestadora; equivalência é facultativa (art. 4-C, §1º) | Convenção/política da empresa |
| **Pode mudar de tomador?** | Não no mesmo contrato — nova tomadora exige novo contrato | Sim, por realocação | — |
| **Fim do contrato com o cliente** | Encerra o contrato temporário | **Não** encerra o vínculo: realocar ou desligar | — |
| **Responsabilidade do cliente** | Subsidiária (art. 10, §7º); solidária na falência da empresa (art. 16) | Subsidiária (art. 5-A, §5º) | — |
| **Categoria eSocial** | 106 | 101 | 101 |
| **Custo vai para** | Fatura da tomadora | Fatura da tomadora | Despesa, rateada nos contratos |

### 2.1 Temporário — o que o sistema garante

| Regra | Onde |
|---|---|
| Hipótese legal e motivo justificador descritos no contrato; proibido substituir grevista | `validarContratoTemporario` |
| Soma dos dias na **mesma tomadora** (raiz do CNPJ — filiais contam juntas), consecutivos ou não | `cicloAtual` |
| Limite de 180 dias; prorrogação só com justificativa e até 90 dias | `validarContratoTemporario` |
| Data final máxima calculada e mostrada antes de assinar | `dataLimite` |
| Quarentena de 90 dias para nova colocação na mesma tomadora; antes disso o sistema **bloqueia**, porque caracteriza vínculo com a tomadora (art. 10, §6º) | `quarentenaAte` |
| Alerta de vencimento (30 dias, configurável) | `situacaoContratoTemporario` |
| Salário-hora nunca abaixo do praticado pela tomadora na função, na data, nem do mínimo | `verificarRemuneracaoEquivalente` |
| Só entra em posto de contrato **de trabalho temporário** da **mesma** tomadora | `validarAlocacao` |

Direitos do art. 12 que a folha precisa gerar: remuneração equivalente, jornada de 8 horas
com horas extras (máx. 2/dia, adicional constitucional de 50%), férias proporcionais,
repouso semanal remunerado, adicional noturno, seguro contra acidente e proteção
previdenciária; registro da condição de temporário na CTPS digital.

### 2.2 Terceirizado — o que o sistema garante

| Regra | Onde |
|---|---|
| Só entra em posto de contrato **de prestação de serviços** | `validarAlocacao` |
| Ex-empregado da tomadora bloqueado por 18 meses após o desligamento | `verificarQuarentenaExEmpregado` |
| Uma alocação principal por dia; coberturas eventuais (folguista, ferista, falta) prevalecem no dia | `validarAlocacao`, `alocacaoNoDia` |
| Fim do contrato com o cliente gera **plano de desmobilização**: realocar ou desligar, pessoa a pessoa | `planoDeDesmobilizacao` |

Condições que a tomadora deve estender enquanto o serviço for nas dependências dela
(art. 4-C): refeitório, transporte, atendimento médico/ambulatorial, treinamento quando a
atividade exigir, condições sanitárias e de segurança. O cadastro do posto registra isso.

### 2.3 Próprio

Empregado CLT da própria empresa, lotado em **setor**. O custo é despesa operacional ou
administrativa. Parte dele (supervisores de campo, DP que atende os contratos) pode ser
**rateada** nos contratos para calcular margem — nunca faturada diretamente.

### 2.4 A própria empresa

`capitalSocialMinimo` confere a exigência para operar: R$ 100.000 para trabalho temporário
(art. 6º, III); para prestação de serviços, de R$ 10.000 a R$ 250.000 conforme o número de
empregados (art. 4-B, III). Vale o maior, se a empresa pratica os dois. O registro da
empresa de trabalho temporário no Ministério do Trabalho também fica no cadastro.

## 3. Modelo de dados

```
Empresa (tenant)
 └─ Filial / estabelecimento (CNPJ)
     ├─ Setor ─────────────────────────────── centro de custo SET:{setor}
     └─ Tomador (cliente, CNPJ)
         ├─ Unidade (endereço onde o serviço é prestado)
         ├─ TabelaSalarial (função → salário-hora, por vigência)   ← equivalência do temporário
         └─ ContratoTomador (TRABALHO_TEMPORARIO | PRESTACAO_SERVICOS)
             └─ Posto (função, unidade, escala, turno, adicionais do local, preço)
                                   └──── centro de custo TOM:{tomador}/CTR:{contrato}/POS:{posto}

Pessoa (cadastro único: candidato → colaborador → ex-colaborador)
 └─ Vínculo (TEMPORARIO | TERCEIRIZADO | PROPRIO, admissão, desligamento, convenção)
     ├─ dadosTemporario (hipótese, justificativa, substituído, fim previsto, prorrogação)
     └─ Alocação (PRINCIPAL | COBERTURA, posto ou setor, início, fim)

Convenção coletiva (sindicato, categoria, base territorial, vigência,
                    pisos por função, adicionais, benefícios, data-base)
```

### Entidades principais

| Entidade | Campos essenciais | Observações |
|---|---|---|
| **Pessoa** | CPF, nome, dados pessoais, documentos, **empregos anteriores** (CNPJ, desligamento) | Uma só, do candidato ao ex-colaborador. Empregos anteriores alimentam a quarentena do art. 5-D |
| **Vínculo** | tipo, admissão, desligamento, função, convenção, salário, jornada, filial | Uma pessoa pode ter vários vínculos ao longo do tempo (ex.: temporário → efetivo terceirizado) |
| **Tomador** | CNPJ, razão social, unidades, contatos, regras de faturamento | Também é cliente no módulo comercial |
| **ContratoTomador** | tipo, vigência, índice e data de reajuste, taxa de administração, forma de faturamento | O contrato ganho no comercial vira este registro |
| **Posto** | função, unidade, escala (12x36, 5x2, 6x1…), turno, quantidade, adicionais do local (insalubridade/periculosidade), preço | Efetivo previsto × alocado mostra **posto descoberto** |
| **Alocação** | vínculo, posto **ou** setor, tipo, início, fim | É ela, dia a dia, que define para quem vai o custo |
| **TabelaSalarial do tomador** | função, salário-hora, vigência | Obrigatória para cada função com temporário |
| **Convenção** | sindicato, categoria, abrangência, vigência, pisos, adicionais, benefícios | Versionada: o cálculo de março usa a de março |

Hoje os documentos existentes (vagas, candidatos, candidaturas) ficam em `jsonb`
(`docs/10-decisao-postgresql.md`). As entidades acima entram como **tabelas relacionais**,
com chaves estrangeiras, porque folha e fatura dependem de junções e de integridade.

## 4. Como cada módulo usa o domínio

### Ponto
O trabalhador bate ponto **no posto** (app com geolocalização da unidade). A marcação
carrega o posto. O tomador **confere e aprova** o espelho dos seus trabalhadores no portal.
O ponto aprovado é, ao mesmo tempo, **base da folha e base da fatura** — se o cliente
contestar horas, contesta antes da folha fechar, não depois da nota emitida.

### Folha
Uma folha por competência e filial, com todos os vínculos. Cada lançamento (rubrica ×
vínculo) recebe o **rateio por centro de custo** da competência (`ratearCompetencia` →
`ratearValor`): um terceirizado que mudou de tomador no dia 16 tem o custo dividido pelos
dias em cada posto; a cobertura de um folguista vai para o posto coberto; dias sem alocação
aparecem como `SEM_ALOCACAO`, uma **pendência** a resolver antes de faturar — inclusive dias
depois do fim do contrato com o cliente, se alguém esqueceu de encerrar a alocação. O rateio fecha
no centavo (maior resto), inclusive para descontos.

Regras de cálculo por vínculo:
- **Temporário**: salário-hora equivalente ao da tomadora; direitos do art. 12.
- **Terceirizado**: piso e adicionais da convenção da categoria; insalubridade e
  periculosidade conforme o **local** do posto; benefícios da convenção.
- **Próprio**: convenção e política da empresa.

Encargos e provisões (férias, 13º, rescisão) também são rateados — é o que torna a margem
por contrato verdadeira.

### Faturamento
Três formas, escolhidas por contrato:
1. **Por posto**: preço mensal fixo por posto; faltas não repostas viram **glosa**.
2. **Por hora**: horas aprovadas no ponto × preço-hora da função.
3. **Custo + taxa**: custo apurado da folha rateada + taxa de administração (comum no temporário).

A nota de serviço sai **por tomador e competência**, com as retenções aplicáveis
(ver "Pontos a validar"). Medição aprovada, nota e cobrança ficam ligadas à competência da folha.

### eSocial e obrigações
- **S-2200** do temporário com a categoria 106 e o grupo de trabalho temporário (hipótese
  legal, justificativa, tomadora). Terceirizados e próprios: categoria 101.
- **Lotação tributária por tomador** (tabela S-1020) e remuneração do **S-1200** informada
  por estabelecimento e lotação — é o rateio da folha que alimenta essa segregação.
- **EFD-Reinf**: a prestadora informa os serviços prestados mediante cessão de mão de obra
  e as retenções sofridas, por tomador.
- **DCTFWeb** e **FGTS Digital** fecham a competência.

### Compliance para o tomador
Por tomador e competência, só dos trabalhadores alocados nele: folha analítica, guias e
comprovantes de FGTS e INSS, certidões da empresa (CND, CRF, CNDT), ASO, entrega de EPI,
treinamentos obrigatórios e espelho de ponto. É a defesa do cliente na responsabilidade
subsidiária — e um argumento de venda.

### Comercial
A planilha de custos de um posto usa as **mesmas** tabelas legais e convenções da folha.
Um BID ganho vira `ContratoTomador` + `Postos` sem redigitação. Depois, o sistema compara
o **custo orçado** com o **custo real** rateado — o comercial aprende com cada contrato.

### Fim de contrato (desmobilização)
`planoDeDesmobilizacao` lista quem está alocado no contrato na data de término:
temporários têm o contrato encerrado; terceirizados entram numa fila de **realocação ou
desligamento**, com custo estimado de rescisão para decidir. Nada é desligado automaticamente.

## 5. Exemplos de ponta a ponta

**Temporário.** Supermercado X pede 15 repositores para a Black Friday (demanda
complementar). O comercial cadastra o contrato de trabalho temporário e 15 postos. O
recrutamento seleciona; na admissão, o sistema confere a tabela salarial do supermercado
(R$ 11,00/h para repositor), calcula a data limite e registra o motivo. Uma candidata que
trabalhou 120 dias lá há 40 dias só pode ter contrato de até 60 dias — o sistema mostra a
data exata. No fim, os contratos encerram; a quarentena passa a valer para quem cumpriu o prazo.

**Terceirizado.** Um porteiro está no posto "Portaria 24h – Unidade Centro" do Condomínio Y.
No dia 16 o condomínio reduz o contrato; ele é realocado para a Indústria Z. A folha de
setembro rateia 15 dias para cada cliente, e cada fatura recebe a sua parte. Dois dias de
cobertura que ele fez em outro posto vão para aquele posto.

**Próprio.** A supervisora de campo é do setor Operações. Seu custo não é faturado, mas é
rateado entre os contratos que ela atende no relatório de margem.

## 6. Pontos a validar com jurídico e contador

Antes de ligar folha e faturamento em produção, cada item abaixo precisa de parecer.
Os que dependem de interpretação são parâmetros configuráveis.

1. **Contagem dos 180 dias "consecutivos ou não"**: a lei não diz quando a soma reinicia.
   Padrão adotado: 90 dias sem contrato com a mesma tomadora reiniciam a contagem
   (`temporarioIntervaloQueReiniciaContagem`).
2. **"Mesma tomadora"**: o padrão compara a raiz do CNPJ (filiais somam). Leitura
   conservadora; confirmar.
3. **Início da nova colocação após a quarentena**: o padrão libera no dia seguinte ao 90º
   dia após o término.
4. **Verbas do temporário além do art. 12** (FGTS, 13º proporcional, indenização da alínea
   "f"): confirmar a prática adotada pela empresa e pela jurisprudência atual.
5. **Retenções na nota**: INSS de 11% na cessão de mão de obra (Lei 8.212/1991, art. 31,
   aplicável a temporário e terceirização conforme arts. 10, §7º e 5-A, §5º) — ou percentual
   diferente para prestadora na desoneração; ISS conforme município; retenções federais
   conforme o tipo de serviço; transição para IBS/CBS a partir de 2026.
6. **Códigos do eSocial** (tipo de lotação, hipótese legal do temporário, grupos do S-2200 e
   S-1200): conferir no leiaute vigente e validar contra o XSD antes de transmitir.
7. **Insalubridade e periculosidade por posto**: laudo (LTCAT/PGR) do local define o grau;
   o sistema só aplica o que estiver cadastrado.

## 7. O que precisamos saber da operação de vocês

Estas respostas definem os padrões do primeiro cliente e viram configuração:

1. Quantos CNPJs/filiais emitem folha? Todos os três tipos de vínculo em todas?
2. Quais convenções coletivas e sindicatos (categoria e base territorial) se aplicam?
3. Forma de faturamento de cada contrato hoje: por posto, por hora ou custo + taxa?
4. Há tomadores com regras próprias (aprovação de ponto, medição, portal, prazos)?
5. Existem folguistas/feristas fixos, cobrindo vários postos?
6. Como os custos dos próprios (supervisão, DP) são rateados hoje, se são?
7. Qual sistema de folha e contabilidade usam agora — para migração e operação em paralelo?
