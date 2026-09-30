export function carregarConfig(ambiente = {}) {
  const driver = ambiente.LABUTAR_DB_DRIVER ?? "memoria";
  if (!["memoria", "postgres", "firestore"].includes(driver)) {
    throw new Error(`LABUTAR_DB_DRIVER inválido: "${driver}" (use "memoria", "postgres" ou "firestore")`);
  }
  if (driver === "postgres" && !ambiente.LABUTAR_DATABASE_URL) {
    throw new Error("LABUTAR_DB_DRIVER=postgres exige LABUTAR_DATABASE_URL");
  }

  const nomeAmbiente = ambiente.NODE_ENV ?? "development";
  const flagCabecalho = ambiente.LABUTAR_IDENTIDADE_POR_CABECALHO;
  if (flagCabecalho !== undefined && !["0", "1"].includes(flagCabecalho)) {
    throw new Error('LABUTAR_IDENTIDADE_POR_CABECALHO deve ser "0" ou "1"');
  }

  return {
    porta: Number(ambiente.PORT ?? 8080),
    ambiente: nomeAmbiente,
    driver,

    /**
     * Identidade declarada em cabeçalho (X-Labutar-Usuario/Papel), sem login.
     * Só para desenvolvimento e testes: desligada por padrão em produção.
     */
    permitirIdentidadePorCabecalho: flagCabecalho !== undefined ? flagCabecalho === "1" : nomeAmbiente !== "production",

    /**
     * Coleção raiz do Labutar dentro do banco. Tudo vive sob
     * `<raiz>/tenants/{tenantId}/...`, o que dá um único bloco de regras
     * (`match /<raiz>/{document=**}`) e nenhum caminho sem o tenant no meio.
     */
    raizColecao: ambiente.LABUTAR_COLECAO_RAIZ ?? "labutar",

    /** URL de conexão do driver postgres. Contém senha: nunca logar. */
    urlBanco: ambiente.LABUTAR_DATABASE_URL ?? null,

    projetoFirebase: ambiente.LABUTAR_FIREBASE_PROJECT ?? "labutar",
    databaseId: ambiente.LABUTAR_FIREBASE_DATABASE ?? "(default)",
    credenciais: ambiente.LABUTAR_SERVICE_ACCOUNT ?? null,
  };
}

/**
 * Avisos de risco para o log de subida. Não bloqueiam — bloquear quebraria o
 * desenvolvimento local — mas existem para que a decisão de compartilhar banco
 * nunca seja tomada por omissão.
 */
export function avisosDeRisco(config) {
  const avisos = [];

  if (config.driver !== "firestore") return avisos;

  if (!config.raizColecao) {
    avisos.push("LABUTAR_COLECAO_RAIZ vazia: as coleções do Labutar se misturariam às de outro produto no mesmo banco.");
  }

  if (config.databaseId === "(default)") {
    avisos.push(
      `LABUTAR vai escrever no banco (default) do projeto "${config.projetoFirebase}", sob "${config.raizColecao}/tenants/...". ` +
        "Três consequências verificadas em firebase.google.com/pricing e /docs/firestore/quotas: " +
        "(1) cota e nível gratuito são POR PROJETO — todos os bancos do projeto compartilham os mesmos " +
        "50 mil leituras/dia, 20 mil gravações/dia e 1 GiB; " +
        "(2) só existe UM banco sem custo por projeto, então um banco nomeado adicional é cobrado; " +
        "(3) Admin SDK passa por fora das regras de segurança, logo a chave de service account deste " +
        "projeto alcança TODO o banco, incluindo dado de outro produto que o compartilhe. " +
        "Firestore não tem permissão por coleção — não há como escopar a chave."
    );
  }

  return avisos;
}
