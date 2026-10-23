import { startServer } from "./index.js";
import { createEnvironmentKeystore } from "./keystore.js";

const dbPath = process.env.IWAKURA_DB_PATH ?? ".dev/iwakura.db";
const port = Number(process.env.IWAKURA_PORT ?? 4319);
const server = await startServer({
  dbPath,
  keystore: createEnvironmentKeystore(),
  version: "0.1.0-standalone",
  port,
});

console.log(`Iwakura server: ${server.apiBase}`);
console.log(`Bearer token:    ${server.token}`);
console.log(`DB:              ${dbPath}`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
