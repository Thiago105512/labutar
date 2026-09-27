export function carregarConfig(ambiente = {}) {
  const driver = ambiente.LABUTAR_DB_DRIVER ?? "memoria";
  if (!["memoria", "firestore"].includes(driver)) {
    throw new Error(`LABUTAR_DB_DRIVER inválido: "${driver}" (use "memoria" ou "firestore")`);
  }

  return {
    porta: Number(ambiente.PORT ?? 8080),
    ambiente: ambiente.NODE_ENV ?? "development",
    driver,

    /**
     * `databaseId` e `prefixoColecao` são as duas formas de isolar o Labutar
     * dentro de um projeto que já hospeda outro produto:
     *
     *   - banco nomeado ("labutar")  → isolamento total, regras próprias,
     *     não toca no (default) do PedTudo. Exige plano Blaze.
     *   - prefixo de coleção          → funciona no Spark, mas compartilha
     *     UM ruleset e UMA cota com o PedTudo.
     *
     * O código aceita os dois; a escolha é de configuração, não de código.
     */
    projetoFirebase: ambiente.LABUTAR_FIREBASE_PROJECT ?? "pedtudo-app",
    databaseId: ambiente.LABUTAR_FIREBASE_DATABASE ?? "(default)",
    prefixoColecao: ambiente.LABUTAR_COLECAO_PREFIXO ?? "labutar_",
    credenciais: ambiente.LABUTAR_SERVICE_ACCOUNT ?? null,
  };
}

/**
 * Rodar contra o (default) de um projeto que hospeda outro produto em
 * produção exige ruleset mesclado. Este aviso existe para aparecer no log de
 * subida, não para impedir — impedir quebraria o desenvolvimento local.
 */
export function avisosDeRisco(config) {
  const avisos = [];

  if (config.driver !== "firestore") return avisos;

  if (config.databaseId === "(default)") {
    avisos.push(
      `LABUTAR está configurado para o banco (default) do projeto "${config.projetoFirebase}". ` +
        "Se esse projeto hospeda outro produto em produção, o ruleset do Firestore é UM SÓ por banco: " +
        "publicar regras do Labutar substitui as do outro produto. Use LABUTAR_FIREBASE_DATABASE=labutar " +
        "(banco nomeado, exige Blaze) ou um projeto separado."
    );
  }
  if (!config.prefixoColecao) {
    avisos.push("LABUTAR_COLECAO_PREFIXO vazio: as coleções do Labutar colidiriam com as de outro produto no mesmo banco.");
  }

  return avisos;
}
