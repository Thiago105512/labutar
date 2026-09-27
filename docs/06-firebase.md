# Firebase — projeto `labutar`

**Projeto dedicado ao Labutar:** `labutar` (nº 209214532041), com banco
`projects/labutar/databases/(default)` confirmado em 2026-09-27 (STANDARD, FIRESTORE_NATIVE).

Não compartilha banco, cota nem credencial com o `pedtudo-app`, que hospeda o
PedTudo em produção (app clínico pediátrico com dado de saúde de crianças).

> ⚠ Existe também um projeto `o-seu-rh` (nº 402003073002) na mesma conta, criado
> no mesmo dia. **Não é o do Labutar.** Uma versão anterior deste documento e do
> `config.js` apontava para ele por engano — corrigido.
>
> Localização: o usuário informou São Paulo (`southamerica-east1`), mas **não foi
> possível confirmar por CLI** — `firebase firestore:databases:describe` não existe
> nesta versão. Conferir no console: a localização é permanente.

## Por que projeto separado, e não tudo no mesmo banco

A intenção original era concentrar tudo num Firestore só para economizar.
Verificado em `firebase.google.com/pricing` e `/docs/firestore/quotas` em 2026-09-27:

| Fato | Consequência |
|---|---|
| Não existe tarifa por projeto nem por banco — cobra-se por leitura, gravação, exclusão, armazenamento e rede | No plano pago, 1 projeto ou 2 custam **o mesmo** |
| Criar um segundo projeto Firebase é grátis | Não havia economia a preservar |
| Cota e nível gratuito são **por projeto**; todos os bancos do projeto compartilham a cota | No plano grátis, concentrar **corta a cota pela metade** |
| Só existe **um** banco sem custo por projeto | Banco nomeado adicional seria **cobrado** |

Nível gratuito (Spark, por projeto, edição Standard): 1 GiB armazenado,
50 mil leituras/dia, 20 mil gravações/dia, 20 mil exclusões/dia, 10 GiB/mês de saída.

Conclusão: concentrar economizava **R$ 0,00** no Blaze e **perdia metade da cota**
no Spark. Projeto separado é grátis e ainda resolve o problema de credencial abaixo.

## O problema que o projeto dedicado resolve

O Admin SDK **ignora as regras de segurança**, e o Firestore **não tem IAM por
coleção**. Uma chave de service account alcança o banco inteiro do projeto.

Se o Labutar dividisse o `pedtudo-app`, o servidor do Labutar — e qualquer
vulnerabilidade nele — teria alcance sobre `noteped_children`, `noteped_symptoms`
e `conversas/*/mensagens`: dado sensível de criança (LGPD art. 5º, II e art. 11)
tratado por sistema cuja finalidade é recrutamento, sem base legal e sem ciência
do responsável.

**Separação por caminho é separação de organização, não de permissão.** Só projeto
separado resolve. Com o projeto `labutar`, uma eventual chave não alcança nada do
PedTudo.

## Layout de "pastas e subpastas"

Firestore não tem pasta: a hierarquia é **coleção → documento → subcoleção**.
Tudo do Labutar vive sob uma raiz única, definida em `server/src/db/caminho.js`
e usada pelos dois drivers (memória e Firestore), para que trocar de driver não
mude o formato de nada:

```
labutar/tenants/{tenantId}/vagas/{vagaId}
labutar/tenants/{tenantId}/vagas/{vagaId}/candidaturas/{candidaturaId}
labutar/tenants/{tenantId}/candidatos/{candidatoId}
labutar/tenants/{tenantId}/candidatos/{candidatoId}/curriculos/{curriculoId}
labutar/tenants/{tenantId}/admissoes/{admissaoId}/documentos/{documentoId}
```

Duas propriedades:

1. **Um só bloco de regras** cobre o produto inteiro — `match /labutar/{document=**}`.
2. **Nenhum caminho existe sem o tenant no meio.** Vazar dado de uma empresa para
   outra exige construir o caminho errado, não esquecer um filtro.

Caminho de coleção tem número **ímpar** de segmentos. `segmentosDeColecao` recusa
`"vagas/VAGA_1"`, que é caminho de documento — erro comum e silencioso.

## Configuração

```bash
LABUTAR_DB_DRIVER=memoria        # padrão: roda sem Firebase e sem npm install
LABUTAR_DB_DRIVER=firestore      # opt-in
LABUTAR_FIREBASE_PROJECT=labutar
LABUTAR_FIREBASE_DATABASE=(default)
LABUTAR_COLECAO_RAIZ=labutar
LABUTAR_SERVICE_ACCOUNT=<JSON da chave>
```

## Pendências para ligar de verdade

- [x] **Projeto criado:** `labutar` (nº 209214532041).
- [x] **Firestore provisionado:** `projects/labutar/databases/(default)`,
      STANDARD, FIRESTORE_NATIVE — confirmado por CLI em 2026-09-27.
- [ ] **Conferir a localização no console.** Informada como São Paulo, não
      confirmada por CLI (`firebase firestore:databases:describe` não existe nesta
      versão). É **permanente**: se estiver em `nam5`, os currículos ficam fora do
      Brasil e entra em jogo o art. 33 da LGPD (transferência internacional).
- [ ] Chave de service account (Console → Configurações do projeto → Contas de
      serviço → Gerar nova chave privada) em `LABUTAR_SERVICE_ACCOUNT`.
      **Nunca** no git — `.gitignore` cobre `serviceAccount*.json` e
      `*credentials*.json`.
- [ ] `npm install firebase-admin` em `server/`.
- [ ] Validar o driver Firestore contra o projeto real — está **escrito mas não
      exercitado por teste**, porque `firebase-admin` não está instalado.
- [ ] Regras de segurança: enquanto só o servidor acessar, o padrão do Firestore
      (negar tudo) já basta. Se o front-end um dia ler direto (kanban em tempo
      real), escrever `match /labutar/{document=**}` com verificação de papel.

Enquanto não houver chave, nada disso bloqueia: o driver padrão é memória e o
servidor sobe sem dependência nenhuma.
