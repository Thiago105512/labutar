# Labutar — Roadmap

Status em 2026-09-27. ✅ pronto · 🚧 em construção · ⏸ adiado de propósito · ⬜ não iniciado

## Fase 0 — Fundação ✅

- `packages/core`: validações (CPF, CNPJ, PIS, CNH, e-mail, telefone ANATEL, CEP, data),
  datas civis com aviso prévio da Lei 12.506/2011, IDs (incluindo o `Id` de 36 chars do
  eSocial), dinheiro em centavos com cálculo por faixas progressivas, texto com máscaras LGPD
- **49 testes passando** (`npm run test:core`)

## Fase 1 — ATS (o produto) 🚧

Prioridade absoluta. É o que o Selecty/Gupy/Recrutei vendem.

1. **Vagas** — CRUD, slug, status, etapas configuráveis, templates de processo, knockout
2. **Candidatos / banco de talentos** — dedup por CPF → e-mail → telefone
3. **Candidatura + pipeline** — máquina de estados com histórico e SLA por etapa
4. **Triagem automatizada** — score de aderência ponderado + corte + reprovação automática
5. **Portal público de vagas** — SEO, candidatura, acompanhamento pelo candidato
6. **Entrevistas** — agendamento, link de vídeo, lembretes, scorecard por critério

## Fase 2 — O que torna "mais completo"

7. **Avaliações** — DISC, comportamental, técnico, redação; laudo automático
8. **Cursos e trilhas** — aula, progresso, certificado
9. **Avisos e mural** — público-alvo, confirmação de leitura
10. **Comunicação** — templates de e-mail e WhatsApp com variáveis
11. **Relatórios** — funil, tempo de contratação, origem, diversidade

## Fase 3 — Multi-canal e IA

12. **Publicação multicanal** — LinkedIn, Indeed, Catho, InfoJobs, Facebook.
    ⚠️ Depende de API de terceiros; Catho **não tem API pública** (verificado em
    2026-09-27: `developers.catho.com.br` não resolve). Começar por feed XML/RSS
    próprio + Google for Jobs (`JobPosting` schema.org), que não depende de ninguém.
13. **Matching por IA** — embeddings de vaga × currículo
14. **Bot conversacional** — triagem por WhatsApp

## Fase 4 — Admissão ⏸ **ADIADA DE PROPÓSITO**

Decisão do usuário em 2026-09-27: eSocial fica para depois, **mas já preparado**.

O que "preparado" significa — está feito:

- Modelo de dados completo: `Admissao` e `EventoESocial` (`docs/02-modelo-de-dados.md`)
- Contrato do pacote em `packages/esocial/README.md`
- `idEventoESocial()` no core, testado (36 chars no padrão oficial)
- Inventário dos defeitos do código herdado em `docs/05-compliance.md`

O que **não** está feito (e não deve ser tentado antes da Fase 1 terminar):

- Assinatura ICP-Brasil corrigida
- Envio SOAP real
- S-2200 / S-2240 (só o S-2220 existe no código herdado, e com leiaute divergente)

Bloqueios externos, independentes de código:

- Certificado digital A1 válido
- Habilitação no **ambiente de produção restrita** do eSocial
- XSD oficial do leiaute vigente para validação

## Fase 5 — Operação ⬜

15. Firebase provisionado + regras de segurança por tenant e papel
16. CI (testes em todo push)
17. Billing — assinatura por tenant, planos, limites de vagas
18. LGPD operacional — exportação, eliminação, registro de tratamento

## Ordem de execução

```
Fase 0 ✅ → Fase 1 (1→6) → Fase 2 → Fase 3 → Fase 5 → Fase 4
```

A Fase 4 vem por último de propósito: é a que tem mais dependência externa e menos
valor imediato. A Fase 5 (operação) antecede a 4 porque enviar evento ao governo sem
CI, sem backup e sem regras de segurança é pedir multa.
