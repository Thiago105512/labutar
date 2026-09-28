# Sprint 1 — Implementação do Painel de Recrutador

**Status**: 🚧 Em construção  
**Objetivo**: Expor o fluxo mínimo do ATS em uma interface funcional para recrutadores.

## O que foi criado

### Frontend
- `web/app/index.html` — layout principal do painel de recrutador
- `web/app/styles.css` — estilos do dashboard e kanban
- `web/app/app.js` — lógica de carregamento de vagas, pipeline e candidatos
- `web/app/package.json` — pacote do app

### Fluxo funcional
- Listar vagas
- Criar nova vaga
- Abrir vaga para candidaturas
- Visualizar pipeline por etapa
- Listar candidatos no banco de talentos

## Como testar

1. Inicie o backend:
```bash
npm run dev
```

2. Acesse:
```text
http://localhost:8080/app/
```

Se o app estiver servido por um servidor estático, use:
```bash
python -m http.server 3000 --directory web
```
E acesse: `http://localhost:3000/app/`.

## Observações

- O projeto já possui a lógica central em `packages/ats` e `server/src/rotas.js`; esta tela foi adicionada como camada visual mínima para o Sprint 1.
- O uso de `X-Labutar-Tenant` e `X-Labutar-User` é compatível com a arquitetura existente.
- Ainda há espaço para evoluir com modal de detalhes, drag-and-drop e publicações.
