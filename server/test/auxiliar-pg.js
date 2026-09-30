/**
 * `node --test` roda os arquivos em paralelo. Cada arquivo que usa o banco de
 * teste ganha um schema próprio, para um não apagar os dados do outro.
 */
export async function urlDeTeste(esquema) {
  const base = process.env.LABUTAR_TESTE_PG_URL;
  if (!base) return null;

  const pg = (await import("pg")).default;
  const cliente = new pg.Client({ connectionString: base });
  await cliente.connect();
  try {
    await cliente.query(`CREATE SCHEMA IF NOT EXISTS ${cliente.escapeIdentifier(esquema)}`);
  } finally {
    await cliente.end();
  }

  const url = new URL(base);
  url.searchParams.set("options", `-c search_path=${esquema}`);
  return url.toString();
}
