# Firebase — onde o Labutar guarda dado e quanto isso custa

Decisão do produto em 2026-09-27: usar o projeto já existente **`pedtudo-app`**
(nº 1006551778801), que hoje hospeda o **PedTudo em produção** — app clínico
pediátrico da Dra. Catarina (CRM/AM 10.677), com dado de saúde de crianças.

## A pergunta econômica, respondida com a documentação oficial

A intenção era concentrar tudo num Firestore só **para economizar**. Verificado em
`firebase.google.com/pricing` e `firebase.google.com/docs/firestore/quotas` em 2026-09-27:

| Fato | Fonte |
|---|---|
| **Não existe tarifa por projeto nem por banco.** Cobra-se por leitura, gravação, exclusão, armazenamento e saída de rede. | /pricing |
| **Criar um segundo projeto Firebase não custa nada.** | /pricing |
| **Cota e nível gratuito são POR PROJETO.** Todos os bancos do mesmo projeto compartilham a cota do projeto. | /quotas |
| **Só existe UM banco sem custo por projeto.** Banco adicional no mesmo projeto é cobrado. | /quotas |
| Nível gratuito (Spark, por projeto, edição Standard): 1 GiB armazenado, 50 mil leituras/dia, 20 mil gravações/dia, 20 mil exclusões/dia, 10 GiB/mês de saída. | /quotas |

### Conclusão — concentrar não economiza, custa

- **Se ficar no Spark (gratuito):** dois projetos = **duas** cotas gratuitas.
  Um projeto = **uma** cota dividida entre PedTudo e Labutar. Concentrar **corta
  o espaço gratuito pela metade** e um pico de uso do Labutar estoura a cota do
  PedTudo em produção.
- **Se migrar para Blaze (pago):** a cobrança é por operação. Dois projetos custam
  **exatamente o mesmo** que um. Concentrar economiza **R$ 0,00**.
- **Banco nomeado `labutar` dentro de `pedtudo-app`:** é o pior dos três — o
  segundo banco do projeto **não** é gratuito, e ainda assim compartilha a cota
  do projeto e a mesma chave de service account.

> **Recomendação: projeto Firebase separado para o Labutar.** É gratuito no
> Spark, leva ~2 minutos, dá cota própria e — o que importa mais — isola o
> alcance da credencial. O código não muda: é `LABUTAR_FIREBASE_PROJECT`.

## O layout de "pastas e subpastas" (implementado nos dois drivers)

Firestore não tem pasta: a hierarquia é **coleção → documento → subcoleção**.
O que parece pasta é essa alternância. Tudo do Labutar vive sob uma raiz única:

```
labutar/tenants/{tenantId}/vagas/{vagaId}
labutar/tenants/{tenantId}/vagas/{vagaId}/candidaturas/{candidaturaId}
labutar/tenants/{tenantId}/candidatos/{candidatoId}
labutar/tenants/{tenantId}/candidatos/{candidatoId}/curriculos/{curriculoId}
labutar/tenants/{tenantId}/admissoes/{admissaoId}/documentos/{documentoId}
```

Duas propriedades que vêm de graça:

1. **Um só bloco de regras cobre o produto inteiro** (`match /labutar/{document=**}`),
   sem esbarrar no ruleset de outro produto que divida o banco.
2. **Nenhum caminho existe sem o tenant no meio.** Vazar dado de uma empresa
   para outra exige construir o caminho errado — não basta esquecer um filtro.

Implementação em `server/src/db/caminho.js`, usada pelos dois drivers. Caminho de
coleção tem número **ímpar** de segmentos; `segmentosDeColecao` recusa
`"vagas/VAGA_1"` (isso é caminho de documento, erro comum e silencioso).

## Por que NÃO é preciso publicar regras

`pedtudo-app/app/firestore.rules` (527 linhas) termina com:

```
match /{document=**} {
  allow read, write: if false;
}
```

Negação genérica. **Toda coleção sem `match` explícito é negada a qualquer
cliente Firebase.** `labutar/**` não tem `match` — logo nenhum cliente lê ou
escreve dado do Labutar, e o servidor usa o **Admin SDK, que passa por fora das
regras**. Nenhum deploy de regras é necessário e o ruleset do PedTudo não é tocado.

> ⚠ **Não "corrigir" isso adicionando um `match /labutar/{document=**}` permissivo.**
> Publicar regras substitui o arquivo inteiro do banco. Enquanto o Labutar só for
> acessado pelo servidor, a negação genérica é a postura correta.

## ⚠ O risco que o layout de pastas NÃO resolve

Separação por caminho é separação **de organização**, não **de permissão**.

O Admin SDK ignora regras de segurança, e **Firestore não tem IAM por coleção**.
Uma chave de service account de `pedtudo-app` alcança o banco inteiro — incluindo
`noteped_children`, `noteped_symptoms` e `conversas/*/mensagens`.

Consequência: o servidor do Labutar, e qualquer vulnerabilidade nele, passa a ter
alcance sobre prontuário pediátrico. Sob a LGPD isso é tratamento de dado sensível
(art. 5º, II e art. 11) por sistema cuja finalidade declarada é recrutamento — sem
base legal que ampare e sem ciência do responsável legal pela criança.

Não há como escopar a chave por coleção. As saídas reais:

1. **Projeto separado** — recomendado. Gratuito, isola cota e credencial.
2. **Banco nomeado** — isola regras, cota e backup, mas a chave ainda alcança o
   projeto inteiro, e o segundo banco é cobrado.
3. **Aceitar e documentar** como decisão do controlador.

`server/src/config.js` emite as três consequências no log de subida quando o
driver é `firestore` mirando `(default)`. Não bloqueia — bloquear quebraria o
desenvolvimento local.

## Para ligar de verdade

- [ ] Decidir entre projeto separado ou `pedtudo-app` (item acima)
- [ ] Chave de service account (Console → Configurações do projeto → Contas de
      serviço → Gerar nova chave privada) em `LABUTAR_SERVICE_ACCOUNT`.
      **Nunca** no git — `.gitignore` já cobre `serviceAccount*.json` e
      `*credentials*.json`
- [ ] `npm install firebase-admin` em `server/`
- [ ] Validar o driver Firestore contra projeto real — está **escrito mas não
      exercitado por teste**, porque `firebase-admin` não está instalado
- [ ] Se um dia o front-end acessar o Firestore direto (kanban em tempo real),
      aí sim escrever regras — **mescladas** às 527 linhas, nunca substituindo

Enquanto não houver chave, nada disso importa: o driver padrão é memória e o
servidor sobe sem dependência nenhuma.
