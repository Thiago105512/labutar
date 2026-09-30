# Labutar — Mapa de módulos

Visão aprovada em 2026-09-30. O domínio central — os três vínculos, tomadores, postos e
alocação — está em [`11-dominio-mao-de-obra.md`](11-dominio-mao-de-obra.md). O Labutar é um **SaaS multiempresa para empresas de
recrutamento e seleção e de mão de obra temporária e terceirizada**. Cobre o ciclo do
trabalhador (vaga → admissão → ponto → folha → rescisão), o ciclo do cliente tomador
(proposta → contrato → medição → fatura) e a gestão da própria empresa.

Cada módulo é uma pasta em `packages/`, com regra de negócio em JS puro, e é
ativado por plano do tenant. Um módulo não lê as coleções/tabelas de outro: usa a
interface pública do pacote ou reage a eventos (ex.: `admissao.concluida`).

✅ existe · 🚧 em construção · ⏸ contrato reservado · ⬜ não iniciado

## Plataforma

| Pacote | Conteúdo | Estado |
|---|---|---|
| `core` | Validações fiscais, datas, dinheiro, IDs, máscaras LGPD | ✅ |
| `plataforma` | Tenants, filiais/CNPJs, usuários, perfis por módulo, auditoria, planos e cobrança do SaaS | ⬜ |
| `comunica` | Templates, canais (e-mail, WhatsApp, SMS, push), avisos, lembretes | ✅ (sem entrega) |
| `ia` | Prompts, desidentificação, rubricas. Recomenda, nunca decide | ✅ |
| `tabelas-legais` | INSS, IRRF, salário-família, feriados, convenções coletivas, **versionadas por vigência** | ⬜ |

## Pessoas

| Pacote | Conteúdo | Estado |
|---|---|---|
| `ats` | Vagas, candidatos, pipeline, triagem, publicação | ✅ |
| `avaliacoes` | DISC, testes técnicos e situacionais, cursos, laudos | ✅ |
| `admissao` | Checklist documental, ASO, contrato, prazos do temporário (Lei 6.019/1974) | ⏸ |
| `colaboradores` | Cadastro único, dependentes, férias, afastamentos, benefícios | ⬜ |
| `sst` | PGR, PCMSO, ASO periódico, CAT, entrega de EPI | ⬜ |
| `rescisao` | Verbas por modalidade, TRCT, prazo de 10 dias, exame demissional | ⬜ |

## Operação de mão de obra

| Pacote | Conteúdo | Estado |
|---|---|---|
| `mao-de-obra` | **Núcleo do domínio** ([`11-dominio-mao-de-obra.md`](11-dominio-mao-de-obra.md)): vínculos temporário/terceirizado/próprio, prazos e quarentenas legais, alocação por dia, centro de custo, rateio, desmobilização | ✅ regras |
| `tomadores` | Clientes tomadores, unidades, contratos comerciais, postos, preços, medição (cadastro e telas; regras em `mao-de-obra`) | ⬜ |
| `alocacao` | Escala, quadro de postos descobertos, reposição de faltas (telas; regras em `mao-de-obra`) | ⬜ |
| `ponto` | Marcações (REP-P, Portaria MTP 671/2021), offline, banco de horas, espelho, AFD/AEJ | ⬜ |
| `compliance` | Certidões, guias pagas e documentos exibidos ao tomador (responsabilidade subsidiária) | ⬜ |

## Financeiro

| Pacote | Conteúdo | Estado |
|---|---|---|
| `folha` | Rubricas, cálculo mensal, férias, 13º, encargos, holerite | ⬜ |
| `esocial` | Eventos de tabela, admissão, folha, SST e desligamento | ⏸ |
| `faturamento` | Fatura por medição, NFS-e, retenções, glosas | ⬜ |
| `financeiro` | Contas a pagar e receber, cobrança, conciliação, centros de custo | ⬜ |
| `contabil` | Plano de contas, lançamentos automáticos, DRE, exportação ao contador | ⬜ |

## Gestão da empresa

| Pacote | Conteúdo | Estado |
|---|---|---|
| `comercial` | Ver seção abaixo | ⬜ |
| `juridico` | Contratos e modelos, processos trabalhistas, prazos, provisões | ⬜ |
| `estoque` | EPI, uniformes, ferramentas, entrega com assinatura, validade do CA | ⬜ |
| `compras` | Requisição, cotação, pedido, aprovação, fornecedores | ⬜ |

## Comercial (`packages/comercial`)

O comercial de uma empresa de mão de obra vende **postos de trabalho com preço calculado**,
muitas vezes em concorrência (BID ou licitação). O módulo cobre do mapeamento de mercado
ao contrato assinado, e entrega o contrato pronto para `tomadores`.

### Mapeamento de mercado

- **Clientes ativos**: contratos, postos, faturamento, margem real, data de renovação,
  saúde da conta (faltas, glosas, reclamações).
- **Possíveis clientes (prospects)**: empresa, segmento, porte, CNAE, região, número de
  funcionários, fornecedor atual, decisores e contatos, origem do lead, temperatura.
- **Concorrentes**: quem são, onde atuam, clientes que atendem, preço e taxa praticados
  quando conhecidos, pontos fortes e fracos, histórico de BIDs ganhos e perdidos contra eles.
- **Mapa por região e segmento**: onde estão os clientes, os prospects e os concorrentes.
- Consulta de dados públicos de CNPJ para preencher cadastro; nada de dado pessoal sem
  base legal (LGPD, art. 7º).

### Funil e oportunidades

- Etapas configuráveis: prospecção → qualificação → visita técnica → proposta →
  negociação → ganho/perdido, com motivo de perda.
- Atividades: ligações, reuniões, visitas, tarefas e lembretes por vendedor.
- Previsão de receita por mês (valor × probabilidade).

### Processos BID e licitações

- Cadastro do processo: contratante, objeto, postos e quantidades, local, datas
  (visita técnica, perguntas, entrega, abertura, resultado), documentos do edital.
- **Status**: em análise → em elaboração → entregue → em disputa → ganho | perdido |
  cancelado | desistência. Processos terminados continuam consultáveis.
- Checklist de habilitação (certidões, atestados de capacidade técnica, balanço,
  garantias) reaproveitando os documentos de `compliance`.
- Resultado: vencedor, preços de todos os participantes quando públicos, motivo da
  perda. Alimenta o cadastro de concorrentes automaticamente.
- Prazos com alerta: nenhuma data de entrega pode passar sem aviso.

### Planilha de custos e formação de preço

É o coração do módulo. Para cada posto:

```
Remuneração        salário da convenção + adicionais (noturno, insalubridade,
                   periculosidade), gratificações, horas extras previstas
Encargos           INSS patronal, RAT/FAP, terceiros, FGTS, provisões de férias,
                   1/3, 13º, aviso prévio, multa do FGTS, reflexos
Benefícios         VT, VR/VA, cesta, plano de saúde, seguro de vida, benefícios da convenção
Insumos            uniforme, EPI, equipamentos, materiais (depreciação mensal)
Reposição          cobertura de férias, faltas e afastamentos (efetivo de reserva)
Custos indiretos   supervisão, administração, exames
Tributos           ISS, PIS, COFINS, IRPJ, CSLL (conforme regime) — e IBS/CBS na transição
Margem             lucro ou taxa de administração
= Preço do posto por mês  →  preço por hora, por diária e total do contrato
```

- Parte das tabelas vigentes (`tabelas-legais`) e da convenção coletiva da função e da
  região; o vendedor não digita alíquota de memória.
- Simulações: cenários de margem, escala (12x36, 5x2, 6x1), turno, quantidade de postos.
- Modelos por segmento (limpeza, portaria, logística, indústria, eventos, temporário).
- **Exporta a planilha em Excel e PDF** no formato do cliente ou do edital (incluindo
  o modelo de planilha de custos e formação de preços usado em licitações públicas).
- Versões: cada revisão da proposta guarda a planilha que a gerou.
- Repactuação e reajuste: recalcula o contrato quando a convenção muda.

### Propostas e contratos

- Proposta comercial gerada a partir da planilha, com modelo da empresa e assinatura
  eletrônica.
- Contrato ganho vira contrato em `tomadores` (postos, preços, centro de custo) sem
  redigitação.

### Relatórios

- Funil por etapa, vendedor e período; taxa de conversão; ciclo médio de venda.
- BIDs: participados, ganhos, perdidos, taxa de sucesso, motivos de perda,
  concorrente que mais venceu, diferença de preço para o vencedor.
- Carteira: receita e margem por cliente, contratos a vencer, risco de perda.
- Mercado: participação por segmento e região, comparativo com concorrentes.
- Metas por vendedor e comissões.
- Todos exportáveis em Excel e PDF.
