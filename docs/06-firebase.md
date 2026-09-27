# Firebase — isolamento do Labutar dentro de `pedtudo-app`

Decisão do produto em 2026-09-27: usar o projeto já existente **`pedtudo-app`**
(nº 1006551778801), com os dados do Labutar separados por prefixo de coleção.

O projeto já hospeda o **PedTudo em produção** — app clínico pediátrico da
Dra. Catarina (CRM/AM 10.677), com dados de saúde de crianças. Isso muda o
cálculo de risco de qualquer alteração.

## Por que NÃO é preciso publicar regras

`pedtudo-app/app/firestore.rules` (527 linhas) termina com:

```
match /{document=**} {
  allow read, write: if false;
}
```

Negação genérica. **Toda coleção que não tenha um `match` explícito é negada a
qualquer cliente Firebase.** As coleções `labutar_*` não têm `match` — logo:

- nenhum cliente (web, Android, iOS) consegue ler ou escrever dado do Labutar;
- o servidor do Labutar usa o **Admin SDK, que passa por fora das regras**;
- **nenhum deploy de regras é necessário**, e o ruleset do PedTudo não é tocado.

> ⚠ **Não "corrigir" isso adicionando um `match /labutar_{...}` permissivo.**
> Publicar regras substitui o arquivo inteiro do banco. Um erro ali derruba ou
> expõe o PedTudo em produção. Enquanto o Labutar só for acessado pelo servidor,
> a negação genérica é a postura correta e não deve ser alterada.

Se um dia o front-end do Labutar precisar de acesso direto (tempo real do
kanban, por exemplo), aí sim haverá regras — e elas deverão ser **mescladas**
às 527 linhas existentes, nunca substituí-las.

## Configuração

```bash
LABUTAR_DB_DRIVER=memoria          # padrão: roda sem Firebase, sem npm install
LABUTAR_DB_DRIVER=firestore        # opt-in
LABUTAR_FIREBASE_PROJECT=pedtudo-app
LABUTAR_FIREBASE_DATABASE=(default)
LABUTAR_COLECAO_PREFIXO=labutar_
LABUTAR_SERVICE_ACCOUNT=<JSON da chave>
```

`server/src/config.js` emite um aviso no log se o driver for `firestore` mirando
`(default)` de projeto compartilhado. O aviso não bloqueia — bloquear quebraria
o desenvolvimento local.

As duas formas de isolamento continuam disponíveis no código:

| Estratégia | Isolamento | Exige |
|---|---|---|
| Prefixo `labutar_` em `(default)` | regras: total (negação genérica). Cota e faturamento: **compartilhados** | nada |
| Banco nomeado `labutar` | regras, cota e backup separados | plano **Blaze** |

## ⚠ Risco que esta decisão não elimina

**Firestore não tem permissão por coleção.** Uma chave de service account de
`pedtudo-app` tem acesso a **todo** o banco — incluindo `noteped_children`,
`noteped_symptoms` e `conversas/*/mensagens`, que são dados de saúde de crianças.

Consequência prática: o servidor do Labutar, e qualquer vulnerabilidade nele,
passa a ter alcance sobre prontuário pediátrico. Sob a LGPD isso é tratamento de
dado sensível (art. 5º, II e art. 11) por um sistema cuja finalidade declarada é
recrutamento — sem base legal que o ampare e sem que o titular (ou o responsável
legal da criança) saiba.

Não há como escopar a chave por coleção no Firestore. As saídas reais são:

1. **Projeto Firebase separado** para o Labutar (plano Spark, gratuito, ~2 min).
   Mantém o isolamento que o prefixo dá, sem o alcance sobre dado clínico.
2. **Banco nomeado `labutar`** em `pedtudo-app` (Blaze). Isola regras, cota e
   backup, mas a chave do service account ainda alcança o projeto inteiro.
3. Aceitar o risco e documentá-lo como decisão do controlador.

O código já aceita as três — é configuração, não refactor. A escolha é do
controlador dos dados, não minha. **Enquanto não houver chave configurada, nada
disso importa: o driver padrão é memória.**

## O que falta para ligar de verdade

- [ ] Chave de service account (Console → Configurações do projeto →
      Contas de serviço → Gerar nova chave privada). Arquivo vai para
      `LABUTAR_SERVICE_ACCOUNT` ou caminho em `.env` — **nunca** no git
      (`.gitignore` já cobre `serviceAccount*.json` e `*credentials*.json`)
- [ ] `npm install firebase-admin` em `server/`
- [ ] Validar o driver Firestore contra o projeto real — ele está **escrito mas
      não exercitado por teste**, porque `firebase-admin` não está instalado
- [ ] Decidir entre as três opções acima antes de gravar o primeiro currículo
