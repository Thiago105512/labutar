# @labutar/admissao — contrato reservado

**Estado: só constantes.** O pacote existe para o workspace do monorepo ficar íntegro e
para a fase de admissão começar sem retrabalho. Modelo de dados em
[`docs/02-modelo-de-dados.md`](../../docs/02-modelo-de-dados.md#admissão).

JS puro, como `core` e `ats`: pode ser importado pelo navegador.

## Escopo previsto

- Checklist documental por tipo de vaga e regime (CLT, temporário, aprendiz, estágio)
- ASO admissional: validade e bloqueio de início sem ASO apto
- Contrato de trabalho temporário (Lei 6.019/1974): prazo de 180 dias + 90 de prorrogação,
  quarentena para recontratação, alertas de vencimento
- Montagem dos dados que `@labutar/esocial` transforma em S-2200 / S-2220
- Bloqueios explícitos (`bloqueios: [{ campo, motivo }]`) em vez de status silencioso
