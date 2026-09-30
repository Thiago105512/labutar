import { iniciar } from "./index.js";
import { semear, semearUsuarios, SENHA_DEMO, USUARIOS_DEMO, TENANT_DEMO } from "./seed/dados.js";

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
  const usuarios = await semearUsuarios(contexto.acesso);
  if (usuarios.semeado) {
    console.log(`\n  Usuários de demonstração (senha "${SENHA_DEMO}", empresa "${TENANT_DEMO}"):`);
    for (const u of USUARIOS_DEMO) console.log(`    ${u.email.padEnd(26)} ${u.perfilId}`);
  }
  console.log(`\n  Painel: ${contexto.url}/web/app/index.html`);
  console.log(`
  API: POST ${contexto.url}/api/auth/entrar {"empresa":"${TENANT_DEMO}","email":"admin@demo.com.br","senha":"${SENHA_DEMO}"}
`);
}

principal().catch((erro) => {
  console.error("Falha no dev:", erro);
  process.exit(1);
});
