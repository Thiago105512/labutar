# Labutar

SaaS multiempresa para empresas de **recrutamento e seleção e de mão de obra temporária e
terceirizada**. Cobre o ciclo do trabalhador (vaga → seleção → admissão → ponto → folha →
rescisão, com eSocial), o ciclo do cliente tomador (proposta → contrato → medição → fatura)
e a gestão da própria empresa: comercial, financeiro, contábil, jurídico, estoque, compras
e treinamentos.

Inspiração no recrutamento: [Selecty](https://selecty.com.br) 4.0, Gupy, Recrutei, Bizneo HR.
Diferencial: **ATS, gestão de temporários/terceirizados e folha no mesmo cadastro**.

**Comece por [`docs/11-dominio-mao-de-obra.md`](docs/11-dominio-mao-de-obra.md)** — o domínio que
diferencia o produto. Mapa de módulos em [`docs/09-modulos.md`](docs/09-modulos.md) ·
roadmap em [`docs/03-roadmap.md`](docs/03-roadmap.md) ·
escopo da folha, item a item, em [`docs/13-escopo-folha.md`](docs/13-escopo-folha.md) ·
cenário de teste (1.000 colaboradores) em [`docs/14-cenario-de-teste.md`](docs/14-cenario-de-teste.md) ·
**padrões de nomes, formatos e telas** em [`docs/15-padroes.md`](docs/15-padroes.md). ·
o que entra do **eSocial** em [`docs/16-esocial.md`](docs/16-esocial.md).

## Estado atual

| Pacote | O que é | Estado |
|---|---|---|
| `@labutar/core` | validações fiscais, datas, IDs, dinheiro, texto/LGPD | ✅ |
| `@labutar/ats` | vagas, pipeline, triagem, candidatos, canais | ✅ |
| `@labutar/avaliacoes` | DISC, testes, cursos, laudos, benchmark com guardrails | ✅ |
| `@labutar/comunica` | templates, canais, avisos, lembretes (sem entrega) | ✅ |
| `@labutar/ia` | prompts, desidentificação, rubricas | ✅ |
| `@labutar/acesso` | login, módulos, níveis, perfis, permissões, política de senha e contas de candidato, colaborador e cliente ([`docs/12-acesso.md`](docs/12-acesso.md)) | ✅ |
| `@labutar/mao-de-obra` | **núcleo do domínio**: vínculos, prazos legais, alocação, rateio | ✅ |
| `@labutar/folha` | motor da folha: tabelas com vigência, INSS, IRRF 2026, FGTS, adicionais, encargos por tomador | 🚧 |
| `@labutar/admissao` | checklist, ASO, contrato, prazos do temporário | ⏸ contrato reservado |
| `@labutar/esocial` | eventos eSocial | ⏸ contrato reservado |
| `server` | API + repositório multi-tenant com fronteira de escopo | 🚧 |
| `web/app` | painel do recrutador | 🚧 |
| ponto, folha, tomadores, faturamento, comercial e demais | ver `docs/09-modulos.md` | ⬜ |

**589 testes passando** (1 pulado sem `firebase-admin`), e mais 14 com PostgreSQL; o CI roda os dois modos em todo push.
Nada em produção.

O backend roda **sem `npm install`**: o driver padrão é memória. O banco principal passa a
ser **PostgreSQL** ([`docs/10-decisao-postgresql.md`](docs/10-decisao-postgresql.md));
o driver Firestore ([`docs/06-firebase.md`](docs/06-firebase.md)) fica até a troca.

## Rodando

```bash
npm test                                   # todos os testes (pacotes + server)
npm run test:core                          # só o núcleo
```

Não há `npm install` obrigatório: os pacotes de domínio não têm dependência externa
e se importam por caminho relativo. Node >= 22.

### Com PostgreSQL

`pg` é dependência opcional: `npm install` na raiz. O usuário do banco **não pode** ser
superusuário nem ter `BYPASSRLS` (ignorariam o isolamento por tenant); o servidor se
recusa a subir nesse caso. As migrações de `server/src/db/migracoes/` rodam na subida.

```sql
CREATE ROLE labutar_app LOGIN PASSWORD '...' NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE labutar OWNER labutar_app;
```

```bash
LABUTAR_DB_DRIVER=postgres LABUTAR_DATABASE_URL=postgres://labutar_app:...@host/labutar npm start

# testes sobre PostgreSQL (banco descartável; cada arquivo usa um schema próprio)
LABUTAR_TESTE_PG_URL=postgres://labutar_app:...@localhost/labutar_teste npm test
```

> Em Windows/cmd.exe o padrão precisa ir entre aspas — o shell não expande glob,
> quem expande é o Node. E `node --test <diretorio>` falha neste ambiente; use o glob.

## Arquitetura

Regra que segura o projeto: **domínio é JavaScript puro**. `core`, `ats`, `avaliacoes`,
`comunica` e `admissao` não importam nada do Node — rodam iguais no servidor e no
navegador, então a triagem é calculada e testada sem mock de framework, e o front-end
não precisa de bundler (usa import maps).

`@labutar/esocial` é a exceção deliberada: é o único pacote com `node-forge`,
`xml-crypto` e `soap`, e nunca é importado pelo front-end.

Detalhes em [`docs/01-arquitetura.md`](docs/01-arquitetura.md) ·
modelo de dados em [`docs/02-modelo-de-dados.md`](docs/02-modelo-de-dados.md).

## O motor de triagem

`triagemAutomatica({ vaga, candidato, respostas })` combina:

1. **Knockout** — perguntas eliminatórias (SIM_NAO, MULTIPLA, NUMERICA, TEXTO, DATA).
   Ausência de resposta **não** reprova: vira pendência e vai para análise manual.
2. **Score de aderência** (0–100) — média ponderada de competências (40), experiência (25),
   formação (15), idiomas (10) e localização (10). Pesos e corte são configuráveis por vaga.

Decisões possíveis: `APROVADO_AUTOMATICO`, `ANALISE_MANUAL`, `REPROVADO_AUTOMATICO`,
`REPROVADO_KNOCKOUT`. Por padrão `reprovacaoAutomatica` é **false**: o sistema nunca
descarta candidato sozinho. Descarte automático é decisão do cliente, configurada por vaga.

Três escolhas que valem revisão:

- Currículo sem nível declarado na competência **presume que atende** o mínimo exigido.
  Presumir zero reprovaria em massa quem não preencheu o campo.
- Curso em andamento vale **um degrau abaixo** (superior incompleto não é superior).
- `experienciaRegra` padrão é `"todas"`. `"relacionadas"` só conta experiência com
  competência tageada em comum — subestima currículo não tageado, por isso não é padrão.

## Compliance

- [`docs/05-compliance.md`](docs/05-compliance.md) — inventário de **14 defeitos** nos
  scripts herdados (`aso.js`, `esocial.js`, `certificado-digital.js`, `agendamento.js`),
  3 deles confirmados lendo o fonte instalado de `xml-crypto@6.3.2` e `node-forge@1.4.0`.
- `auditarAnuncio(vaga)` sinaliza termo potencialmente discriminatório antes de publicar
  (art. 373-A da CLT, Lei 9.029/1995).
- LGPD: máscaras de dado pessoal no core, consentimento com validade verificável,
  fusão de duplicados em que **revogação nunca é ressuscitada**, e anonimização em vez
  de exclusão para preservar trilha de auditoria.
- `packages/comunica` não divulga vaga por WhatsApp: exige opt-in e template aprovado.

## O que não está pronto

- Nada persiste ainda: não há banco conectado.
- Não há UI. O motor existe e é testado; ninguém clica nele.
- Publicação em job board é **manual** na maioria dos canais — ver
  `planoDePublicacao()` em `packages/ats/src/canais.js`, que diz a verdade sobre cada um
  (a Catho, por exemplo, não tem API pública; verificado em 2026-09-27).
- O leiaute do eSocial no código herdado **diverge do oficial** e não foi validado contra XSD.
- DISC e demais avaliações psicológicas têm validade jurídica limitada e não podem ser
  usadas como filtro eliminatório.
