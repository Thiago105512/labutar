# Labutar — Arquitetura

> ATS B2B brasileiro: publicação multicanal de vagas, triagem automatizada, pipeline
> configurável, entrevistas, avaliações, cursos, avisos e **admissão integrada ao eSocial**.
>
> Inspiração declarada: [Selecty](https://selecty.com.br) (Selecty 4.0), Gupy, Recrutei, Bizneo HR.
> Diferencial: nenhum ATS nacional fecha o ciclo até o eSocial. O Labutar fecha.

## 1. Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Linguagem | JavaScript (ESM) em toda a stack | Um só idioma do banco ao navegador; sem transpilação |
| Domínio | JS puro, **zero dependências** | Roda igual no Node e no browser. Regra de negócio testável sem mock de framework |
| Front-end | SPA estática + **import maps** + PWA | Sem bundler. Entregável como "app" instalável (Android/iOS/Windows) sem toolchain mobile |
| API | Node + Express | Simples, onipresente, fácil de hospedar |
| Dados | Firestore + Firebase Auth | Conta e projetos já conectados; realtime grátis para o pipeline |
| Testes | `node --test` (nativo) | Sem dependência externa, sem configuração |
| Multi-tenant | Documento raiz `tenants/{tenantId}` + subdomínio | Mesmo modelo do Selecty (`actionrh.selecty.com.br`) |

## 2. Estrutura do repositório

```
labutar/
├── packages/
│   ├── core/          puro — validações, datas, IDs, dinheiro, texto          ✅ pronto
│   ├── ats/           puro — vagas, candidaturas, pipeline, triagem, matching
│   ├── avaliacoes/    puro — DISC, testes comportamentais/técnicos, cursos
│   ├── comunica/      puro — templates de e-mail/WhatsApp, avisos, notificações
│   ├── admissao/      puro — checklist documental, dados para S-2200/S-2220
│   └── esocial/       NODE — XML, assinatura ICP-Brasil, envio SOAP
├── server/            API Express + repositórios Firestore
├── web/
│   ├── index.html     site institucional (marketing)
│   ├── app/           painel B2B (recrutador, gestor, admin)
│   ├── vagas/         portal público de vagas + candidatura
│   └── manifest.webmanifest
├── docs/
└── tests/             integração ponta a ponta
```

### Regra de ouro dos pacotes

- `core`, `ats`, `avaliacoes`, `comunica`, `admissao` → **sem `import` de Node** (`fs`, `crypto`, `soap`).
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
