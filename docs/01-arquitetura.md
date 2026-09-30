# Labutar — Arquitetura

> SaaS multiempresa para empresas de **recrutamento e seleção e de mão de obra temporária
> e terceirizada**: do anúncio da vaga à admissão, ponto, folha, eSocial, faturamento ao
> tomador e gestão da própria empresa (comercial, financeiro, contábil, jurídico, estoque,
> compras, treinamentos). Mapa completo em [`09-modulos.md`](09-modulos.md).
>
> Inspiração no recrutamento: [Selecty](https://selecty.com.br) (Selecty 4.0), Gupy, Recrutei, Bizneo HR.
> Diferencial: ninguém junta ATS, gestão de temporários/terceirizados e folha no mesmo
> cadastro. O Labutar junta.

## 1. Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Linguagem | JavaScript (ESM) em toda a stack | Um só idioma do banco ao navegador; sem transpilação |
| Domínio | JS puro, **zero dependências** | Roda igual no Node e no browser. Regra de negócio testável sem mock de framework |
| Front-end | SPA estática + **import maps** + PWA | Sem bundler. Entregável como "app" instalável (Android/iOS/Windows) sem toolchain mobile |
| API | Node + Express | Simples, onipresente, fácil de hospedar |
| Dados | **PostgreSQL** (decidido em 2026-09-30; antes Firestore) | Folha, faturamento e contabilidade exigem transação, junção e histórico — ver [`10-decisao-postgresql.md`](10-decisao-postgresql.md) |
| Testes | `node --test` (nativo) | Sem dependência externa, sem configuração |
| Multi-tenant | Documento raiz `tenants/{tenantId}` + subdomínio | Mesmo modelo do Selecty (`actionrh.selecty.com.br`) |

## 2. Estrutura do repositório

```
labutar/
├── packages/            regra de negócio, uma pasta por módulo (✅ existe · ⏸ reservado · ⬜ previsto)
│   ├── core/            ✅ validações, datas, IDs, dinheiro, texto/LGPD
│   ├── plataforma/      ⬜ tenants, usuários, perfis, auditoria, planos do SaaS
│   ├── tabelas-legais/  ⬜ INSS, IRRF, feriados, convenções (versionadas por vigência)
│   ├── comunica/        ✅ templates de e-mail/WhatsApp, avisos, lembretes
│   ├── ia/              ✅ prompts, desidentificação, rubricas
│   ├── ats/             ✅ vagas, candidaturas, pipeline, triagem, matching
│   ├── avaliacoes/      ✅ DISC, testes comportamentais/técnicos, cursos
│   ├── admissao/        ⏸ checklist documental, ASO, contrato, prazos do temporário
│   ├── mao-de-obra/     ✅ núcleo: vínculos, prazos legais, alocação, rateio (docs/11)
│   ├── colaboradores/   ⬜ cadastro, dependentes, férias, afastamentos, benefícios
│   ├── tomadores/       ⬜ clientes, contratos, postos, preços, medição
│   ├── alocacao/        ⬜ escala, reposição de faltas
│   ├── ponto/           ⬜ REP-P, banco de horas, espelho, AFD/AEJ
│   ├── folha/           ⬜ rubricas, cálculo, holerite, férias, 13º
│   ├── rescisao/        ⬜ verbas, TRCT
│   ├── esocial/         ⏸ NODE — XML, assinatura ICP-Brasil, envio SOAP
│   ├── compliance/      ⬜ certidões e guias para o tomador
│   ├── faturamento/     ⬜ fatura, NFS-e, retenções
│   ├── financeiro/      ⬜ pagar/receber, conciliação, centros de custo
│   ├── contabil/        ⬜ plano de contas, lançamentos, DRE
│   ├── comercial/       ⬜ clientes, prospects, concorrentes, BIDs, planilha de custos
│   ├── sst/             ⬜ PGR, PCMSO, CAT, EPI
│   ├── juridico/        ⬜ contratos, processos, prazos
│   ├── estoque/         ⬜ EPI, uniformes, ferramentas
│   └── compras/         ⬜ requisição, cotação, pedido
├── server/              API + repositórios (PostgreSQL; memória em teste e dev)
├── web/
│   ├── index.html       site institucional (marketing)
│   ├── app/             painel da empresa (recrutador, DP, financeiro, comercial, admin)
│   ├── vagas/           portal público de vagas + candidatura
│   ├── tomador/         portal do cliente tomador
│   ├── trabalhador/     app PWA do trabalhador (ponto, holerite, documentos)
│   ├── backoffice/      painel do SaaS (clientes do Labutar, planos, suporte)
│   └── manifest.webmanifest
├── docs/
├── .github/workflows/   CI
└── tests/               integração ponta a ponta
```

Módulo novo entra como mais uma pasta em `packages/` e é ativado por plano do tenant.
Um módulo não lê os dados de outro diretamente: usa a interface pública do pacote ou
reage a eventos (`admissao.concluida`, `folha.fechada`, `medicao.aprovada`).

### Regra de ouro dos pacotes

- Todo pacote exceto `esocial` → **sem `import` de Node** (`fs`, `crypto`, `soap`).
  Só podem importar `@labutar/core`. Isso permite calcular triagem, score e DISC no navegador.
- `esocial` → **único** pacote com dependências (`node-forge`, `xml-crypto`, `soap`, `pem`).
  Nunca é importado pelo front-end.
- `server` → orquestra. Não contém regra de negócio: delega aos pacotes.

## 3. Multi-tenant e isolamento

```
Firestore:  tenants/{tenantId}/vagas/{vagaId}/candidaturas/{candidaturaId}
Roteamento: {subdominio}.labutar.com.br  →  tenantId
Portal:     vagas.labutar.com.br/{tenantSlug}/{vagaSlug}
```

Os caminhos acima são do driver Firestore atual. No PostgreSQL o equivalente é a coluna
`tenant_id` em toda tabela com Row-Level Security; a regra abaixo não muda.

Toda leitura no server passa por `resolverTenant(req)` e **nenhuma** query pode sair sem
`tenantId`. `server/src/db/guard.js` centraliza isso para que o esquecimento seja impossível
em vez de improvável.

Papéis: `admin` (dono da conta) · `recrutador` · `gestor` (requisitante, só as próprias vagas) ·
`entrevistador` (feedback pontual) · `candidato` (portal, sem acesso ao painel).

## 4. LGPD

Currículo é dado pessoal; saúde (ASO, exames) é **dado sensível** (art. 5º, II e art. 11).

- Consentimento registrado com versão do termo, data e IP (`candidato.consentimento`)
- Base legal do ASO: art. 7º, II (obrigação legal) + NR-7 — **não** depende de consentimento
- `@labutar/core` expõe `mascararCPF/mascararEmail/mascararTelefone/mascararNome` para
  qualquer tela compartilhada, log ou export
- Direito de eliminação: `apagarCandidato(tenantId, candidatoId)` anonimiza em vez de
  apenas deletar, preservando a trilha de auditoria exigida em processo trabalhista
- Retenção configurável por tenant; padrão 24 meses para banco de talentos

## 5. O diferencial: ATS → eSocial

```
Vaga aberta
   └─ Candidatura → triagem → entrevistas → avaliações
        └─ Aprovado
             └─ Admissão Digital: checklist documental
                  ├─ ASO admissional (aso.js)  ──→ S-2220
                  ├─ Dados do trabalhador      ──→ S-2200
                  └─ Agentes nocivos (PGR)     ──→ S-2240
```

O código já existente na home do usuário (`aso.js`, `esocial.js`,
`certificado-digital.js`, `agendamento.js`) é a semente de `packages/esocial`.
Ele tem defeitos conhecidos — ver `docs/05-compliance.md`.

## 6. O que ainda não existe

Nada aqui está em produção. Sem CI, sem Firebase provisionado, sem certificado digital
configurado, sem envio real ao eSocial (ambiente de produção restrita exige habilitação
prévia no portal). Ver `docs/03-roadmap.md`.
