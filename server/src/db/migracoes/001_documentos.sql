-- Armazenamento de documentos do Labutar no PostgreSQL.
--
-- Primeira etapa da troca de banco (docs/10-decisao-postgresql.md): guarda os
-- mesmos documentos que os drivers de memória e Firestore, com a mesma
-- interface. Módulos com dinheiro e fechamento (ponto, folha, faturamento,
-- contábil) ganham tabelas relacionais próprias em migrações seguintes.
--
-- `colecao` é o caminho completo abaixo do tenant, com subcoleções
-- ("vagas" ou "vagas/VAGA_1/candidaturas"), já validado por caminho.js.

CREATE TABLE labutar_documentos (
  tenant_id     text        NOT NULL,
  colecao       text        NOT NULL,
  id            text        NOT NULL,
  dados         jsonb       NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, colecao, id)
);

-- Row-Level Security: o banco só devolve linhas do tenant declarado na
-- transação (`SET LOCAL labutar.tenant_id`). Sem a declaração,
-- current_setting devolve NULL e nenhuma linha passa. FORCE aplica a regra
-- também ao dono da tabela, que é o usuário da aplicação.
ALTER TABLE labutar_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE labutar_documentos FORCE ROW LEVEL SECURITY;

CREATE POLICY isolamento_por_tenant ON labutar_documentos
  USING (tenant_id = current_setting('labutar.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('labutar.tenant_id', true));

-- Registro de quais tenants têm dado gravado, sem conteúdo. Espelha
-- `tenants()` do driver de memória e permite verificar `removerTenant`.
CREATE TABLE labutar_tenants (
  tenant_id text        PRIMARY KEY,
  criado_em timestamptz NOT NULL DEFAULT now()
);
