import { iniciar } from "./index.js";
import { semear, TENANT_DEMO } from "./seed/dados.js";

/**
 * Sobe com dados de demonstração e força driver de memória: desenvolvimento
 * local nunca deve escrever num projeto Firebase real por acidente.
 */
async function principal() {
  const forcarMemoria = process.env.LABUTAR_DB_DRIVER === "firestore";
  if (forcarMemoria) {
    console.warn("[labutar] LABUTAR_DB_DRIVER=firestore em modo dev: use sem seed se quiser gravar de verdade.");
  }

  const contexto = await iniciar({
    config: {
      porta: Number(process.env.PORT ?? 8080),
      ambiente: "development",
      driver: forcarMemoria ? "firestore" : "memoria",
      raizColecao: "labutar",
      projetoFirebase: process.env.LABUTAR_FIREBASE_PROJECT ?? "labutar",
      databaseId: process.env.LABUTAR_FIREBASE_DATABASE ?? "(default)",
      credenciais: process.env.LABUTAR_SERVICE_ACCOUNT ?? null,
    },
    log: console.error,
  });

  const resultado = await semear(contexto.repo);
  console.log(`\n  Labutar em ${contexto.url}`);
  console.log(`  tenant de demonstração: ${TENANT_DEMO}`);
  if (resultado.semeado) {
    console.log(`  seed: ${resultado.vagas} vagas, ${resultado.candidatos} candidatos, ${resultado.candidaturas} candidaturas`);
  } else {
    console.log(`  seed pulado: ${resultado.motivo}`);
  }
  console.log(`\n  curl -H "X-Labutar-Tenant: ${TENANT_DEMO}" ${contexto.url}/api/vagas\n`);
}

principal().catch((erro) => {
  console.error("Falha no dev:", erro);
  process.exit(1);
});
