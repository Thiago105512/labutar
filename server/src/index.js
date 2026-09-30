import { createServer } from "node:http";
import { carregarConfig, avisosDeRisco } from "./config.js";
import { criarRepositorio } from "./db/index.js";
import { criarAplicacao } from "./app.js";
import { avisosDeSeguranca } from "./middleware/contexto.js";

export async function iniciar({ config = carregarConfig(process.env), log = console.error } = {}) {
  const repo = await criarRepositorio(config);
  const app = await criarAplicacao({ config, repo, log });
  const servidor = createServer(app.handler);

  await new Promise((resolver) => servidor.listen(config.porta, resolver));
  const endereco = servidor.address();

  const avisos = [...avisosDeRisco(config), ...avisosDeSeguranca()];
  for (const aviso of avisos) log(`[labutar] AVISO: ${aviso}`);

  return {
    servidor,
    repo,
    config,
    url: `http://localhost:${endereco.port}`,
    porta: endereco.port,
    avisos,
    async encerrar() {
      await new Promise((resolver) => servidor.close(resolver));
      await repo.encerrar?.();
    },
  };
}

const ehEntradaDireta = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());

if (ehEntradaDireta) {
  iniciar().then(({ url, repo, config }) => {
    console.log(`Labutar no ar: ${url}`);
    console.log(`  driver:  ${repo.nome} (persistente: ${repo.persistente})`);
    if (config.driver === "firestore") {
      console.log(`  projeto: ${config.projetoFirebase}/${config.databaseId}  raiz: ${config.raizColecao}`);
    }
    console.log(`  ⚠ autenticação por cabeçalho é STUB de desenvolvimento`);
  }).catch((erro) => {
    console.error("Falha ao subir o Labutar:", erro);
    process.exit(1);
  });
}
