# Labutar — Contrato da API HTTP

Este documento é a **fonte de verdade** entre `server/` e `web/`. Quem implementa um lado
não muda o contrato sozinho: muda aqui e avisa.

Base: `http://localhost:8080`. Zero dependência — HTTP em `node:http`, sem Express.

## Envelope

Toda resposta é JSON com este formato, sem exceção:

```jsonc
// sucesso
{ "ok": true, "dados": <qualquer> }

// falha
{ "ok": false, "erro": "mensagem legível em pt-BR", "codigo": "NAO_ENCONTRADO", "detalhes": [...] }
```

O front-end **sempre** testa `resposta.ok` antes de usar `dados`.

### Códigos de erro e status HTTP

| HTTP | `codigo` | Quando |
|---|---|---|
| 400 | `VALIDACAO` | corpo inválido, campo faltando, formato errado |
| 400 | `TRANSICAO_INVALIDA` | mudança de status não permitida pela máquina de estados |
| 401 | `NAO_AUTENTICADO` | sem identidade de usuário |
| 403 | `SEM_ESCOPO` | operação sem tenant, ou tenant mal formado |
| 403 | `SEM_PERMISSAO` | papel insuficiente |
| 404 | `NAO_ENCONTRADO` | recurso inexistente **ou de outro tenant** (não distinguir de propósito) |
| 409 | `CONFLITO` | id duplicado |
| 500 | `INTERNO` | exceção não prevista — nunca vaza stack para o cliente |

> Um recurso de outro tenant devolve 404, não 403. Distinguir os dois confirma a
> existência de registro alheio, o que é vazamento de informação.

## Tenant e identidade

Resolvidos por cabeçalho, nesta ordem:

```
X-Labutar-Tenant: acme-rh          # obrigatório nas rotas /api/*
X-Labutar-Usuario: U_123           # obrigatório onde houver escrita
X-Labutar-Papel:   recrutador      # admin | recrutador | gestor | entrevistador
```

Em produção o tenant virá do subdomínio (`acme-rh.labutar.com.br`) e a identidade do
Firebase Auth. **Hoje os cabeçalhos são um stub declarado** — ver `server/src/middleware/`.
Nenhuma rota pode fingir que isso é autenticação de verdade.

`tenantId` válido: 3–64 chars, `[a-z0-9-]`, sem hífen nas pontas. Qualquer outra coisa → 403 `SEM_ESCOPO`.

Páginas públicas (`/api/publico/*`) **não** exigem `X-Labutar-Usuario`, mas exigem tenant
(subdomínio ou `?tenant=`).

## Rotas

### Saúde e metadados

| Método | Rota | Resposta em `dados` |
|---|---|---|
| GET | `/api/saude` | `{ status:"ok", versao, driver, ambiente, esocial:{ habilitado:false, motivo }, ia:{ habilitado:bool } }` |
| GET | `/api/canais` | `[{ canal, metodo, bloqueio, observacao }]` — os 11 canais com a verdade sobre cada um |
| GET | `/api/modelos-processo` | `[{ id, nome, etapas }]` |
| POST | `/api/modelos-processo` | corpo `{ nome, etapas }` → modelo criado |

### Vagas

| Método | Rota | Observação |
|---|---|---|
| GET | `/api/vagas` | query: `status`, `area`, `busca`, `ordenarPor`, `limite`, `iniciarEm`. `dados` = `{ itens, total, retornados }` |
| POST | `/api/vagas` | corpo = vaga parcial. **400 se `validarVaga()` retornar erros**; `dados` inclui `{ vaga, validacao }` |
| GET | `/api/vagas/:id` | `{ vaga, validacao, auditoria, contagens }` |
| PATCH | `/api/vagas/:id` | merge raso; revalida |
| POST | `/api/vagas/:id/status` | corpo `{ para, motivo? }` → usa `mudarStatus()`. Transição inválida = 400 `TRANSICAO_INVALIDA` com as permitidas em `detalhes` |
| GET | `/api/vagas/:id/etapas` | `{ ativas, saidas }` |
| GET | `/api/vagas/:id/candidaturas` | lista paginada |
| GET | `/api/vagas/:id/funil` | saída de `funil()` |
| GET | `/api/vagas/:id/publicacoes` | saída de `publicacaoInicial()` |
| GET | `/api/vagas/:id/job-posting` | o objeto **JobPosting schema.org** pronto |
| GET | `/api/vagas/:id/json-ld` | `text/html` — o `<script type="application/ld+json">` para colar |
| GET | `/api/vagas/:id/anuncio/:canal` | `{ canal, texto, truncado, link }` |
| GET | `/api/vagas/:id/auditoria` | `{ limpo, termosEncontrados, orientacao }` |

### Candidatos

| Método | Rota | Observação |
|---|---|---|
| GET | `/api/candidatos` | query: `busca`, `competencias` (CSV), `cidade`, `uf`. **Nunca** retorna anonimizado |
| POST | `/api/candidatos` | 409 `CONFLITO` se `encontrarDuplicado()` achar alguém; `dados` = `{ candidato, duplicadoDe }` |
| GET | `/api/candidatos/:id` | com `?mascarar=1` aplica as máscaras de LGPD |
| PATCH | `/api/candidatos/:id` | |
| GET | `/api/candidatos/:id/consentimento` | `{ valido, situacao, motivo, dias }` |
| POST | `/api/candidatos/:id/anonimizar` | corpo `{ motivo }` → LGPD art. 18, VI. **Irreversível**: exige `X-Labutar-Papel: admin` |
| POST | `/api/candidatos/:id/fundir` | corpo `{ outroId }` → `mesclarCandidatos()`. Exige `admin` |

### Candidaturas e pipeline

| Método | Rota | Observação |
|---|---|---|
| POST | `/api/candidaturas` | corpo `{ vagaId, candidatoId, respostas?, origem? }`. Roda `criarCandidatura()` — já entra triada. 400 se a vaga não estiver `ABERTA` |
| GET | `/api/candidaturas/:id` | `{ candidatura, sla, pessoa }` |
| POST | `/api/candidaturas/:id/mover` | corpo `{ paraEtapaId, observacao?, reabrir? }` → `moverEtapa()`. `ok:false` do domínio vira **400** `TRANSICAO_INVALIDA` |
| POST | `/api/candidaturas/:id/desistir` | corpo `{ motivo? }` — rota pública equivalente em `/api/publico/` |
| POST | `/api/candidaturas/:id/avaliacao` | corpo `{ nota: 0–5, parecer? }` — uma por avaliador |
| POST | `/api/candidaturas/:id/anexo` | corpo `{ nome, url, tipo? }` |
| GET | `/api/candidaturas/:id/triagem` | o resultado completo de `triagemAutomatica()`, com componentes |

### Métricas

| Método | Rota | Observação |
|---|---|---|
| GET | `/api/metricas/funil?vagaId=` | `funil()` |
| GET | `/api/metricas/origens?vagaId=` | `origensDasCandidaturas()` |
| GET | `/api/metricas/tempos?vagaId=` | `tempoMedioPorEtapa()` |
| GET | `/api/metricas/resumo` | `{ vagas:{abertas,pausadas,rascunho}, candidaturas:{total,emAndamento,aprovados,reprovados}, slaAtrasadas }` |

### Público (portal de vagas — sem autenticação)

| Método | Rota | Observação |
|---|---|---|
| GET | `/api/publico/vagas` | só status `ABERTA`. **Não** expõe `regrasTriagem`, `knockout.eliminatoria` interno, salário se `exibir:false`, nem contagens |
| GET | `/api/publico/vagas/:slug` | detalhe + `jobPosting` embutido para SEO |
| POST | `/api/publico/candidaturas` | corpo `{ vagaSlug, candidato, respostas, consentimento }`. **Exige** `consentimento.aceito === true` com `versaoTermo`; sem isso 400 |
| GET | `/api/publico/candidaturas/:token` | acompanhamento pelo candidato, só com token opaco |
| POST | `/api/publico/candidaturas/:token/desistir` | |

> A projeção pública é deliberada: `regrasTriagem` e `corteMinimo` revelados permitiriam
> a um candidato otimizar o currículo para o algoritmo em vez de para a vaga.

## Convenções

- **Datas**: civil `AAAA-MM-DD`; instantes em ISO-8601 UTC.
- **Dinheiro**: sempre **centavos (inteiro)**. Nunca float no JSON.
- **Ids**: prefixados — `VAGA_`, `CAND_`, `CTDA_`, `MOD_`, `ENTV_`.
- **Paginação**: `?limite=50&iniciarEm=0`; resposta traz `{ itens, total, retornados }`.
- **Ordenação**: `?ordenarPor=campo` ou `campo:desc`.
- ** CORS**: `Access-Control-Allow-Origin` espelha a origem apenas para hosts
  `*.labutar.com.br` e `localhost`. Preflight `OPTIONS` respondido.
- **Nenhum** endpoint devolve stack trace, caminho de arquivo ou mensagem de driver.

## O que ainda não existe

- Autenticação real (Firebase Auth) — hoje é cabeçalho, **stub declarado**
- Autorização por papel além de `admin` nas rotas irreversíveis
- WebSocket/realtime para o kanban
- Upload de arquivo (o `anexo` recebe URL já hospedada)
- `packages/ia` (em construção) e eSocial (adiado)
