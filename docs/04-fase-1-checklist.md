# Fase 1 — Checklist de Entregáveis (ATS MVP)

**Status**: 🚧 Em Construção  
**Prioridade**: 🔴 Máxima — isto é o que se vende  
**Tempo estimado**: 6–8 semanas (com 1 eng full-time)  

Ordem recomendada de execução: **1 → 2 → 3 → 4 → 5 → 6** (mas 5 pode rodar paralelo com 4).

---

## ✅ Bloco 1: Vagas (CRUD + Portal)

### 1.1 Backend: CRUD de Vagas
- [ ] **Modelo**: `Vaga` com campos obrigatórios (título, descrição, etapas, deadline, salário)
- [ ] **Criar vaga** (`POST /api/vagas`): validar; gerar slug único; inserir em Firestore
- [ ] **Listar vagas** (`GET /api/vagas`): paginação; filtro por status; filtro por template
- [ ] **Obter vaga** (`GET /api/vagas/:id`): com contagem de candidaturas por etapa (funil)
- [ ] **Editar vaga** (`PATCH /api/vagas/:id`): validar mudanças de status; auditoria
- [ ] **Deletar/Arquivar vaga** (`DELETE /api/vagas/:id`): soft delete; cancelar entrevistas pendentes
- [ ] **Etapas configuráveis**: `Vaga.etapas = [{ nome, tipo, sla }]` — permite customização por template
- [ ] **Testes**: 100% das rotas com dados válidos/inválidos; multi-tenant isolado

**Issues GitHub associadas**:
- `vaga-crud-backend`
- `vaga-etapas-configuravel`
- `vaga-slug-unico`
- `vaga-testes-integracao`

**Dependências**: `@labutar/core` (validações), `@labutar/ats` (modelo)

---

### 1.2 Frontend: Painel de Vagas (Recrutador)
- [ ] **Layout**: lista com cards (título, status, vagas abertas, candidatos em triagem)
- [ ] **Criar vaga**: form com template pre-preenchido; preview de descrição
- [ ] **Editar vaga**: inline; com histórico de mudanças
- [ ] **Status visual**: cores por estado (rascunho, aberta, preenchida, arquivada)
- [ ] **Relatório rápido**: funil na tela (quantos em triagem? em entrevista? aprovados?)
- [ ] **Autenticação**: x-labutar-tenant no header; validar papel = recrutador
- [ ] **Testes**: componentes isolados; sem mock de HTTP (import map do core)

**Dependências**: `@labutar/core`, `@labutar/ats`

**Issues GitHub associadas**:
- `web-painel-vagas-lista`
- `web-painel-vagas-criar`
- `web-painel-vagas-editar`
- `web-painel-vaga-funil`

---

### 1.3 Portal Público de Vagas
- [ ] **Rota**: `/vagas/{tenantSlug}/{vagaSlug}` (no `web/vagas/`)
- [ ] **Dados**: título, descrição (HTML sanitizado), salário, localização, requisitos
- [ ] **Botão "Candidatar"**: redireciona para formulário
- [ ] **SEO**: `<title>`, `<meta name>`, `<meta og:>`, schema.org `JobPosting`
- [ ] **Responsivo**: mobile first; sem JavaScript até carregar (progressivo)
- [ ] **Candidaturas antigos**: acompanhamento: "você se candidatou em X" + status
- [ ] **Testes**: Lighthouse performance ≥ 90; SEO ≥ 90

**Issues GitHub associadas**:
- `web-vagas-portal-seo`
- `web-vagas-portal-responsive`
- `web-vagas-portal-candidatura-acompanhamento`

**Dependências**: `@labutar/core`, `@labutar/ats`

---

## ✅ Bloco 2: Candidatos & Banco de Talentos

### 2.1 Backend: Modelo & Deduplicação
- [ ] **Modelo**: `Candidato` com CPF, e-mail, telefone, nome, data de nasc., endereço
- [ ] **Deduplicação**: busca por CPF → e-mail → telefone; mescla de perfis
- [ ] **Consentimento LGPD**: registrar versão do termo, data, IP
- [ ] **Máscara de dados**: `mascararCPF()`, `mascararEmail()`, `mascararTelefone()` em logs/exports
- [ ] **CRUD**: criar, obter, listar (só do tenant), não deletar — anonimizar
- [ ] **Histórico**: quem acessou quando; quais dados foram editados
- [ ] **Testes**: dedup com CPF/email/fone duplicados; LGPD mascaramento funciona

**Issues GitHub associadas**:
- `candidato-modelo-completo`
- `candidato-deduplicacao`
- `candidato-lgpd-mascaramento`
- `candidato-historico-auditoria`

**Dependências**: `@labutar/core` (validações de CPF, e-mail, telefone), `@labutar/ats`

---

### 2.2 Frontend: Banco de Talentos (Recrutador)
- [ ] **Lista**: todos os candidatos do tenant (paginado)
- [ ] **Busca**: por nome, CPF (mascarado visualmente), e-mail, telefone
- [ ] **Cartão**: nome, foto (se fornecido), últimas vagas em que se candidatou
- [ ] **Ação rápida**: "Convidar para vaga X" (cria candidatura, envia e-mail)
- [ ] **Filtros**: status (ativo, bloqueado, anonimizado), origem (portal, LinkedIn, importação)
- [ ] **Bloqueio de LGPD**: mostrar quando candidato pediu eliminação (anonimizado não pode ser contato)

**Issues GitHub associadas**:
- `web-painel-banco-talentos-lista`
- `web-painel-banco-talentos-convite-rapido`
- `web-painel-banco-talentos-filtros`

---

## ✅ Bloco 3: Candidatura + Pipeline (Coração do ATS)

### 3.1 Backend: Máquina de Estados
- [ ] **Modelo**: `Candidatura` com candidatoId, vagaId, etapa, histórico, SLA
- [ ] **Estados**: `triagem` → `entrevista_agendada` → `entrevista_realizada` → `avaliacao` → `proposta` → `admissao` → `contratado` / `reprovado`
- [ ] **Transições**: validar regras (ex: não volta de `reprovado`, só avança com feedback)
- [ ] **SLA por etapa**: registrar quando entrou; alertar se estorou
- [ ] **Histórico completo**: quem fez o quê, quando, por quê (auditoria)
- [ ] **Cria candidatura**: se candidato não existe, cria também
- [ ] **Testes**: todas as transições válidas; recusa as inválidas; SLA dispara corretamente

**Issues GitHub associadas**:
- `candidatura-maquina-estados`
- `candidatura-historico-auditoria`
- `candidatura-sla-alertas`
- `candidatura-testes-integracao`

**Dependências**: `@labutar/core`, `@labutar/ats`

---

### 3.2 Frontend: Painel de Pipeline (Recrutador + Gestor)
- [ ] **Kanban**: colunas por etapa (triagem, agendada, realizada, avaliação, proposta, etc.)
- [ ] **Cards**: nome do candidato, resumo do perfil, data de entrada, SLA (cor vermelha se estourou)
- [ ] **Drag-drop**: mover candidato entre etapas → atualiza no servidor
- [ ] **Click no card**: abre modal com histórico, notas, próximas ações
- [ ] **Filtros rápidos**: por vaga, por status de SLA, por recrutador responsável
- [ ] **Bulk actions**: marcar como reprovado em lote; enviar e-mail em lote
- [ ] **Responsividade**: em mobile, abas por etapa em vez de kanban
- [ ] **Testes**: drag-drop funciona; transição inválida é recusada; SLA visual está correto

**Issues GitHub associadas**:
- `web-painel-pipeline-kanban`
- `web-painel-pipeline-modal-detalhes`
- `web-painel-pipeline-bulk-actions`
- `web-painel-pipeline-mobile`

---

## ✅ Bloco 4: Triagem Automatizada

### 4.1 Backend: Motor de Triagem
- [ ] **Modelo**: `Triagem` com regras (escolaridade, experiência, skills, localização)
- [ ] **Score**: aderência ponderada (ex: 40% skills, 30% experiência, 20% localização, 10% escolaridade)
- [ ] **Regra de corte**: teto mínimo (ex: ≥ 60 pontos = passa)
- [ ] **Reprovação automática**: se score < 30 ou critério obrigatório falha → candidatura passa direto para `reprovado`
- [ ] **Matching simples**: substring no CV (rascunho: sem IA ainda)
- [ ] **Aplicação**: ao candidato se inscrever → triagem roda automaticamente → status atualizado
- [ ] **Testes**: score calcula corretamente; corte funciona; matching não é falso positivo

**Issues GitHub associadas**:
- `triagem-motor-score`
- `triagem-regras-corte`
- `triagem-matching-substring`
- `triagem-automacao-ao-candidatar`

**Dependências**: `@labutar/core`, `@labutar/ats`

---

### 4.2 Frontend: Configuração de Triagem (Admin)
- [ ] **Tela de configuração**: definir pesos, cortes, critérios obrigatórios por vaga
- [ ] **Preview**: "se candidato tiver X skills e Y anos, pontuaria Z"
- [ ] **Histórico**: quem mudou, quando, valores antigos
- [ ] **Salvar template**: reusar em próximas vagas

**Issues GitHub associadas**:
- `web-painel-triagem-config`
- `web-painel-triagem-preview`

---

## ✅ Bloco 5: Portal de Candidatura (Public)

### 5.1 Frontend + Backend: Formulário de Candidatura
- [ ] **Rota**: `POST /api/candidaturas` (sem autenticação, só tenant via slug)
- [ ] **Campos obrigatórios**: nome, e-mail, telefone, CV (upload ou texto), CPF (validado)
- [ ] **Campos opcionais**: LinkedIn, portfólio, pretensão salarial, localização desejada
- [ ] **Validações**: CPF válido (core), e-mail válido, telefone ANATEL, tamanho de arquivo
- [ ] **Upload de CV**: salvar em Firestore + extrair texto para triagem
- [ ] **Consentimento LGPD**: checkbox + versão do termo; registrar IP, data
- [ ] **Recibo**: exibir "sua candidatura foi recebida" + token de acompanhamento
- [ ] **E-mail de confirmação**: enviar para candidato (template simples)
- [ ] **Testes**: validações de campo; dedup (detecta se já se candidatou); LGPD registra

**Issues GitHub associadas**:
- `candidatura-portal-form`
- `candidatura-upload-cv`
- `candidatura-validacao-campos`
- `candidatura-email-confirmacao`
- `candidatura-lgpd-consentimento`

**Dependências**: `@labutar/core`, `@labutar/ats`, `@labutar/comunica` (templates de e-mail)

---

### 5.2 Backend: Acompanhamento por Candidato
- [ ] **Rota**: `GET /api/candidaturas/acompanhamento?token=ABC` (sem autenticação)
- [ ] **Dados**: status atual, etapa, data de entrada, próximas etapas, data estimada
- [ ] **Sem dados sensíveis**: só mostra o que é público
- [ ] **Notificações**: "você passou para entrevista!" (via e-mail)

**Issues GitHub associadas**:
- `candidatura-acompanhamento-publico`

---

## ✅ Bloco 6: Entrevistas (Agendamento + Entrevistador)

### 6.1 Backend: Agendamento
- [ ] **Modelo**: `Entrevista` com candidatoId, vagaId, entrevistadorId, data/hora, link de vídeo, resultado
- [ ] **Criar entrevista**: gerar link de vídeo (mock: `meet.google.com/xxx` ou similar)
- [ ] **Enviar convite**: e-mail para candidato (com link, horário, instruções)
- [ ] **Lembretes**: 24h antes, 1h antes (via email; opcional: WhatsApp)
- [ ] **Resultado**: scorecard com critérios (comunicação, técnica, cultural fit); nota final
- [ ] **Testes**: agendamento não conflita; e-mail é enviado; scorecard salva

**Issues GitHub associadas**:
- `entrevista-agendamento`
- `entrevista-email-convite`
- `entrevista-lembrete`
- `entrevista-scorecard`

**Dependências**: `@labutar/core`, `@labutar/ats`, `@labutar/comunica` (templates de e-mail)

---

### 6.2 Frontend: Calendário de Entrevistas (Recrutador + Entrevistador)
- [ ] **Calendário**: ver horários disponíveis; agendar candidato
- [ ] **Envio de convite**: com 1 clique
- [ ] **Link de vídeo**: clicável direto da tela
- [ ] **Scorecard**: formulário simples (campos customizáveis); salva ao submit
- [ ] **Status visual**: agendada (azul), realizada (verde), cancelada (cinza)
- [ ] **Bulk invite**: marcar vários candidatos → enviar convite em lote

**Issues GitHub associadas**:
- `web-painel-entrevista-calendario`
- `web-painel-entrevista-scorecard`
- `web-painel-entrevista-bulk-convite`

---

## 🔍 Testes Horizontais (Todas as Fases)

Não são um bloco separado, mas executados em paralelo:

- [ ] **Testes unitários**: `npm run test:core` passa (49 testes já passando ✅)
- [ ] **Testes de integração**: backend + banco (driver de memória primeiro)
- [ ] **Testes de isolamento multi-tenant**: tenant A não vê dados de tenant B
- [ ] **Testes de LGPD**: mascaramento, anonimização, consentimento
- [ ] **Testes E2E (opcionais para MVP)**: candidato → inscrição → triagem → pipeline → entrevista
- [ ] **Cobertura**: aim para ≥ 80% nos pacotes core + ats
- [ ] **CI**: `.github/workflows/test.yml` roda em todo push

**Issues GitHub associadas**:
- `testes-integracao-backend`
- `testes-isolamento-multitenant`
- `testes-lgpd-compliance`
- `ci-setup-github-actions`

---

## 📊 Critério de Aceitação (DoD)

Fase 1 está completa quando:

1. ✅ Todas as rotas HTTP retornam status correto (200, 201, 400, 403, 404, 409)
2. ✅ Multi-tenant funciona: tenant A + tenant B = sem vazamento de dados
3. ✅ Candidato consegue se candidatar, acompanhar status, receber e-mails
4. ✅ Recrutador consegue ver vagas, candidatos, pipeline em kanban, agendar entrevistas
5. ✅ Triagem automatizada roda ao candidatar; score calcula; corte aplica
6. ✅ Banco de talentos dedup funciona (detecta CPF/email duplicados)
7. ✅ LGPD: consentimento registrado, mascaramento funciona, anonimização anonimiza
8. ✅ CI passa 100%: testes + linting + build
9. ✅ README atualizado com:
   - Como subir localmente (`npm install && npm run dev`)
   - Como rodar testes (`npm run test`)
   - Como invocar uma API de exemplo (`curl`)
10. ✅ Deploy fake em staging (Firebase ou outro) para validar fluxo real

---

## 🎯 Próximos Passos

1. **Abrir issues** baseadas neste checklist
2. **Atribuir**: quem faz o quê? Qual a ordem exata?
3. **Estimar**: cada issue recebe T-shirt (S/M/L/XL)
4. **Board**: criar Project v2 com coluna "To do", "In progress", "Done"
5. **Daily**: 15 min no async (comentários) ou síncrono (se houver bloqueio)
6. **Retrospectiva**: após Fase 1, revisar erros e aprendizados antes de Fase 2

---

## 📚 Referências

- `docs/01-arquitetura.md` — decisões e estrutura de pacotes
- `docs/02-modelo-de-dados.md` — esquema Firestore (assumo que existe)
- `packages/core/src/` — validações prontas
- `packages/ats/src/` — model.js (assume que existe)
- `server/src/rotas.js` — endpoints parcialmente implementados
