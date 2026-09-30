# 18. Convenções e acordos coletivos

Pacote `packages/convencoes`. Cada instrumento (CCT ou ACT) é um objeto de dados com o registro no
MTE (Mediador), os sindicatos, a vigência, a abrangência e só as cláusulas que mudam cálculo, custo
ou prazo. As demais ficam listadas para consulta.

## 1. Qual instrumento vale

- A empresa declara o **enquadramento sindical**: a convenção da categoria dela e para quais tipos
  de vínculo (`folhaParametros.enquadramentoSindical`).
- **Acordo coletivo prevalece sobre a convenção** (CLT, art. 620): o do posto, depois o do tomador,
  depois o da empresa. O que o acordo não trata continua pela convenção.
- Só vale o que está em vigência na competência.

## 2. CCT AM000038/2026 — Asseio, Conservação e Serviços Terceirizados (AM)

Registro no MTE em 23/01/2026, vigência de 01/01 a 31/12/2026, data-base em janeiro.
SEEACEAM (laboral, CNPJ 23.006.562/0001-48) e SEAC-AM (patronal, CNPJ 34.501.213/0001-19).

| Assunto | Regra | No Labutar |
|---|---|---|
| Piso (cl. 3ª) | 144 funções em 116 faixas; piso geral R$ 1.655,25; reajuste mínimo de 6,79% | Piso pela função enquadrada no posto; conformidade na folha |
| Insalubridade (cl. 6ª) | Mínimo de 20% em hospitais; banheirista 40% | Vale o maior entre o laudo do posto e a CCT |
| Piloto fluvial (cl. 3ª § 4º) | Gratificações de 40% (comando e praticagem) + 20% de insalubridade | Registrado; lançamento quando houver o posto |
| 13º (cl. 5ª) | 30/11 e 20/12 | Igual ao motor (lei) |
| Vale-refeição (cl. 7ª) | R$ 24,50 por dia, desconto até 10%, falta desconta o dia, dispensado com refeitório | Custo do tomador; desconto pela política da empresa (`descontoVRPercentual`) |
| Cesta básica (cl. 8ª) | R$ 180,00, só associados, com condições | Custo quando cumpre as condições; aviso quando perde |
| Vale-transporte (cl. 9ª) | 6% (3% na 12x36) | Percentual pela escala do posto |
| Custos por colaborador (cl. 10, 12, 13, 18) | Odontológico R$ 16, assistência social R$ 20, seguro R$ 5, qualificação R$ 10 | Somados ao custo do tomador |
| Banco de horas (cl. 19ª) | 20 h pagas com 50% acima de 192 h; compensação em 90 dias | Depende do ponto |
| 12x36 (cl. 21ª) | Divisor 192, noturno 20% (22h–5h), intervalo indenizado com 50% | Divisor e VT aplicados |
| Rescisão (cl. 16ª e 17ª) | Pagamento em 10 dias; homologação no sindicato acima de 12 meses; documentos em 20 dias; PPP; sucessão de contrato = acordo (20% do FGTS e metade do aviso) | Lista de obrigações por rescisão |
| Contribuições (cl. 28 a 31) | Mensalidade associativa 2% (mín. R$ 33,11) com oposição; assistencial em fevereiro (R$ 20/40); negocial patronal por faixa | Descontos no holerite; negocial no resumo |
| Encargos (cl. 45ª) | Mínimos de 81,98% / 81,86% / 82,27% por jornada | Tabela para a planilha de custo (faturamento) |

## 3. Pendências

- **Temporários:** a CCT está aplicada a terceirizados e próprios. Falta confirmar se os
  temporários da empresa também são desta categoria ou têm outra (a remuneração deles segue a
  equivalência com o tomador, Lei 6.019/1974, art. 12).
- **Enquadramento das funções dos postos** que não estão na tabela (porteiro, operador de
  empilhadeira, eletricista de manutenção, cargos administrativos): enquanto isso vale o piso geral.
- **Naturezas do eSocial** dos descontos sindicais e do VR (9220, 9231, 9232) marcadas "a conferir".
- **Acordos coletivos** dos tomadores: a regra de prevalência já está pronta.
