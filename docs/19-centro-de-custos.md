# 19. Centro de custos e resultado por contrato

Pacote `packages/custos`. **Cada contrato com o tomador é um centro de custo.** A gestão vê, por
competência, quanto cada contrato fatura, quanto custa e se dá lucro.

## 1. O que entra no custo do contrato

| Custo | De onde vem |
|---|---|
| Salários e adicionais | Holerite de quem está alocado no contrato (sem salário-família, que o INSS reembolsa) |
| Encargos e FGTS | INSS patronal, RAT × FAP e terceiros sobre a base do INSS + FGTS do mês |
| Provisões | 1/12 de 13º e 1/12 de férias + 1/3, com encargos e FGTS |
| Benefícios da convenção | VR, cesta básica, odontológico, seguro, assistência social, qualificação (docs/18) |
| Preposto e supervisão | Colaborador próprio com **rateio entre contratos** (percentual): o custo total dele vai para os contratos que atende |
| Custos lançados | Uniforme, EPI (bota, luva, protetor), crachá, exames, treinamento, despesas do contrato — pelo colaborador (vai para o contrato dele na data) ou direto no contrato |
| Estrutura (indiretos) | Próprios sem rateio, despesas gerais (aluguel, sistemas) e a contribuição negocial patronal, **rateados** pelo número de colaboradores (ou pelo custo direto) |

- **Kit de admissão:** crachá, 2 uniformes, bota e exame admissional são lançados sozinhos na admissão
  (`folhaParametros.kitAdmissao`).
- **Amortização:** material de vida útil longa (uniforme e bota: 6 meses, cláusula 24ª da CCT) entra no
  contrato em parcelas mensais, sem perder centavo.
- Nada se perde: a soma dos contratos é tudo o que entrou (teste de conservação).

## 2. Receita, tributos e resultado

- **Preço do contrato:** valor por colaborador, custo da mão de obra + taxa de administração, ou valor fixo.
- **Tributos sobre a receita:** percentual da empresa (`tributosFaturamentoPercentual`; no demo, ISS 5% +
  PIS 1,65% + COFINS 7,6% — conferir com a contabilidade).
- **Margem de contribuição** = receita − tributos − custo direto: o que o contrato deixa para pagar a estrutura.
- **Resultado** = margem de contribuição − estrutura rateada.
- **Ponto de equilíbrio:** o preço (por colaborador ou taxa) que cobre custo e tributos.

## 3. Quem faz o quê

- **Estoque** (DP, supervisão, almoxarifado): lança entregas e custos, mantém o catálogo de itens.
- **Financeiro:** vê o resultado, define o preço dos contratos e o rateio dos próprios; exclui lançamentos.

## 4. Pendências

- Exames lançados automaticamente quando a clínica registrar o ASO (hoje: kit de admissão e lançamento manual).
- Receita pela fatura real (módulo de faturamento) em vez do preço cadastrado.
- Estoque com saldo e validade de CA; ponto (horas extras e faltas) alimentando a folha do contrato.
- No demo há 4 administrativos para 18 alocados: a estrutura pesa ~R$ 2.290 por cabeça; no cenário de
  1.000 colaboradores (docs/14) ela se dilui.
