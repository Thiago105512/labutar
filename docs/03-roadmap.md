# Labutar — Roadmap

Status em 2026-09-30. ✅ pronto · 🚧 em construção · ⏸ contrato reservado · ⬜ não iniciado

Revisado em 2026-09-30, quando o escopo passou de "ATS até o eSocial" para SaaS completo
de R&S, mão de obra temporária/terceirizada e gestão da empresa (`docs/09-modulos.md`).
Duas mudanças em relação ao roadmap anterior:

- **eSocial deixou de ser a última fase.** Com folha própria, ele é obrigatório.
- **Ponto vem antes da folha**, porque a folha calcula a partir das marcações.

Cada fase termina num produto utilizável e vendável sozinho. Primeiro cliente piloto:
100 colaboradores ativos. Cenário padrão de teste: 1.000 colaboradores (600 temporários,
300 terceirizados, 100 próprios) em 4 tomadores (`docs/14-cenario-de-teste.md`).

## Fase 0 — Fundação 🚧

- ✅ `packages/core` — validações, datas, dinheiro, IDs, máscaras LGPD
- ✅ Estrutura multi-tenant no `server` com fronteira de escopo (`db/guard.js`)
- ✅ CI rodando todos os testes em cada push (`.github/workflows/testes.yml`)
- ✅ Driver PostgreSQL + migrações + Row-Level Security (`docs/10-decisao-postgresql.md`)
- ✅ `packages/acesso` — login com senha (scrypt), sessões, escolha de módulo, 5 níveis por
  módulo, 10 perfis padrão com Administrador geral de acesso total, ajustes por usuário,
  proteção contra escalada, auditoria (`docs/12-acesso.md`)
- ⬜ `packages/plataforma` — planos do SaaS, onboarding de empresas, 2FA, recuperação de senha
- ⬜ Backoffice do SaaS — clientes, planos, cobrança, suporte

## Fase 1 — Recrutamento e seleção 🚧

- ✅ `ats` — vagas, pipeline, triagem com score, banco de talentos, canais
- ✅ `avaliacoes` — DISC, testes, cursos, laudos
- ✅ `comunica` — templates, avisos, lembretes (entrega real ⬜)
- 🚧 Painel do recrutador (`web/app`)
- ✅ Portal do candidato — cadastro, candidatura, acompanhamento; acessos de colaborador e
  de cliente (tomador) com dados isolados (`docs/12-acesso.md`, seção 7)
- ⬜ Entrevistas — agenda, vídeo ao vivo e gravado, scorecard
- ⬜ Área do psicólogo — testes homologados SATEPSI, laudo restrito

Detalhe dos entregáveis em `docs/04-fase-1-checklist.md`.

## Fase 2 — Admissão e operação

- ✅ `mao-de-obra` — núcleo de regras: vínculos, 180+90 dias e quarentena do temporário,
  quarentena de 18 meses da terceirização, alocação por dia, rateio por centro de custo,
  desmobilização (`docs/11-dominio-mao-de-obra.md`)
- ⏸ `admissao` — documentos, ASO, contrato eletrônico
- ⬜ `colaboradores` — cadastro único, dependentes, benefícios
- ⬜ `tomadores` — clientes, contratos, postos, preços
- ⬜ `alocacao` — escala, reposição de faltas
- ⬜ Importação de dados de outros sistemas (implantação de clientes)

## Fase 3 — Ponto e app do colaborador

- ⬜ `ponto` — importação do AFD dos relógios instalados nos tomadores (REP-C, caso principal),
  tratamento e AEJ; REP-P (Portaria MTP 671/2021), foto, geolocalização, offline,
  banco de horas, espelho, AFD/AEJ, atestado técnico do desenvolvedor
- ⬜ App do colaborador (PWA) — marcação alternativa ao relógio, holerite, documentos, férias, chamados

## Fase 4 — Folha e eSocial

Escopo completo, status item a item e ordem interna de construção (motor → cadastro e
convenções → eSocial → ponto, contábil e portal → SST, benefícios e analytics):
[`docs/13-escopo-folha.md`](13-escopo-folha.md). O motor de cálculo e as tabelas com
vigência começam antes, logo depois do recrutamento, porque a folha é o módulo de maior
risco e precisa da suíte de regressão com casos reais o quanto antes.

- ⬜ `tabelas-legais` — INSS, IRRF, feriados, convenções, versionadas por vigência
- ⬜ `folha` — cálculo, férias, 13º, encargos, holerite, pagamento em lote
- ⏸ `esocial` — tabelas, S-2200/2206/2230/2299, S-1200/1210/1299, SST; FGTS Digital, DCTFWeb
- ⬜ `rescisao` — verbas por modalidade, TRCT, prazos
- Rodar em paralelo com o sistema atual do cliente por 2–3 competências antes de virar

Bloqueios externos: certificado digital A1, habilitação na produção restrita do eSocial,
revisão por especialista em DP e contador.
XSD oficial do leiaute S-1.3 ✅ obtido e versionado em `packages/esocial/xsd/` (2026-09-30).
Defeitos do código herdado: `docs/05-compliance.md`.

## Fase 5 — Faturamento e financeiro

- ⬜ `faturamento` — medição aprovada pelo tomador, NFS-e, retenções, glosas
- ⬜ `financeiro` — pagar/receber, boleto/PIX, conciliação, centros de custo
- ⬜ Portal do tomador — presença, aprovação de ponto, faturas
- ⬜ `compliance` — certidões e guias exibidas ao tomador

## Fase 6 — Gestão da empresa

- ⬜ `comercial` — clientes, prospects, concorrentes, BIDs, planilha de custos, propostas
- ⬜ `sst` e `estoque` (EPI, uniformes)
- ⬜ Treinamentos com validade e bloqueio de alocação (estende `avaliacoes/cursos`)

O `comercial` pode ser antecipado: a planilha de custos só depende de `tabelas-legais`.

## Fase 7 — Gestão avançada

- ⬜ `contabil` — plano de contas, lançamentos automáticos, DRE, exportação ao contador
- ⬜ `juridico`, `compras`
- ⬜ BI e relatórios gerenciais

## Fase 8 — Inteligência e ecossistema

- ⬜ Match por IA, previsão de faltas e turnover, assistente de DP
- ⬜ API pública, webhooks, integrações com ERPs e contabilidade

## Ordem de execução

```
Fase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
```

Operação (backup, regras de segurança, monitoramento) acompanha cada fase: nenhum
módulo que envia dado ao governo ou mexe com dinheiro sobe sem ela.
