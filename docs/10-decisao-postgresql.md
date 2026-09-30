# Decisão: PostgreSQL como banco principal

**Status:** aprovada em 2026-09-30 · **Substitui:** Firestore como banco principal
(`docs/06-firebase.md`) · **Implementação:** etapa 1 feita (driver de documentos, abaixo).

## Contexto

O Firestore foi escolhido quando o Labutar era só um ATS: vagas e candidatos são
documentos, e o pipeline em tempo real saía de graça.

O escopo agora inclui ponto, folha, rescisão, faturamento, financeiro e contabilidade
(`docs/09-modulos.md`). Esses módulos têm três exigências que o Firestore atende mal:

1. **Fechamento atômico.** Fechar a folha grava holerites, encargos, provisões,
   lançamentos contábeis e eventos eSocial de centenas de trabalhadores de uma vez: tudo
   ou nada. Transações do Firestore têm limite de escritas e de tempo.
2. **Consultas relacionais.** Margem por posto, custo por tomador, DRE e espelho de ponto
   cruzam várias entidades. O Firestore não faz junção nem agregação arbitrária.
3. **Histórico auditável.** Fiscalização e processo trabalhista pedem dados de anos
   atrás, com integridade garantida pelo banco (chaves, restrições, tipos numéricos).

## Decisão

- **PostgreSQL** é o banco principal de todos os módulos.
- Isolamento multi-tenant por coluna `tenant_id` em toda tabela + **Row-Level Security**,
  mantendo a regra atual de que nenhuma consulta sai sem tenant (`server/src/db/guard.js`).
- Dinheiro continua em **centavos inteiros** (`bigint`), como já é no `core`.
- O driver em memória continua existindo para testes e para `npm run dev`.
- Firebase pode continuar para **Auth** e **Storage** de arquivos, se útil. Não guarda
  dado de negócio.
- Hospedagem gerenciada (ex.: Supabase, Neon, AWS RDS, Cloud SQL), com backup diário,
  recuperação pontual e região no Brasil.

## Consequências

- Os pacotes de domínio não mudam: não conhecem o banco.
- `server/src/db/` ganha um driver PostgreSQL com a mesma interface do driver de memória;
  os testes de contrato que hoje valem para memória e Firestore passam a valer para ele.
- Passa a existir migração de esquema versionada no repositório.
- `docs/06-firebase.md` fica como histórico até o driver novo estar pronto.

## Por que agora

Nada está em produção. Trocar hoje custa um driver e um esquema; trocar com clientes
usando folha custa uma migração de dados com risco trabalhista.

## Implementação — etapa 1 (driver de documentos)

- `server/src/db/postgres.js`: mesma interface dos drivers de memória e Firestore,
  guardando cada documento como `jsonb` em `labutar_documentos`
  (`server/src/db/migracoes/001_documentos.sql`). Filtro e ordenação usam o mesmo
  `aplicarFiltro` dos outros drivers, então o resultado é idêntico.
- Isolamento em duas camadas: `WHERE tenant_id` em toda consulta **e** Row-Level Security
  com o tenant declarado por transação. Testado com consulta crua sem filtro.
- Sobe só com usuário sem `SUPERUSER`/`BYPASSRLS` (`verificarPapel`).
- Migrações versionadas, aplicadas na subida, com trava contra duas instâncias migrando juntas.
- A suíte da API inteira roda sobre PostgreSQL no CI (job `testes-postgres`).

Próximas etapas: tabelas relacionais próprias para os módulos de dinheiro e fechamento
(`tabelas-legais`, `ponto`, `folha`, `faturamento`, `contabil`), cada uma em sua migração;
backup e recuperação pontual no provedor escolhido.
