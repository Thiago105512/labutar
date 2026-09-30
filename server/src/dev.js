import { iniciar } from "./index.js";
import { semearFolha } from "./seed/folha.js";
import { semear, semearUsuarios, SENHA_DEMO, USUARIOS_DEMO, CONTAS_EXTERNAS_DEMO, TENANT_DEMO } from "./seed/dados.js";

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
  const folha = await semearFolha(contexto.repo, TENANT_DEMO);
  if (folha.semeado) console.log(`  folha de setembro/2026: ${folha.colaboradores} colaboradores de demonstração`);
  const usuarios = await semearUsuarios(contexto.acesso, { repo: contexto.repo });
  if (usuarios.semeado) {
    console.log(`\n  Usuários de demonstração (senha "${SENHA_DEMO}", empresa "${TENANT_DEMO}"):`);
    for (const u of USUARIOS_DEMO) console.log(`    ${u.email.padEnd(34)} ${u.perfilId}`);
    for (const c of CONTAS_EXTERNAS_DEMO) console.log(`    ${c.email.padEnd(34)} portal ${c.tipo}`);
  }
  console.log(`\n  Painel da empresa: ${contexto.url}/web/app/index.html`);
  console.log(`  Portal (candidato, colaborador, tomador): ${contexto.url}/web/portal/index.html`);
  console.log(`
  API: POST ${contexto.url}/api/auth/entrar {"empresa":"${TENANT_DEMO}","email":"admin@demo.com.br","senha":"${SENHA_DEMO}"}
`);
}

principal().catch((erro) => {
  console.error("Falha no dev:", erro);
  process.exit(1);
});
