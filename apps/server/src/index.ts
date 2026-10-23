import { randomBytes } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import pino, { type Logger } from "pino";
import { createApp } from "./app.js";
import { closeDatabase, openDatabase } from "./db.js";
import type { Keystore } from "./keystore.js";

export interface StartServerOptions {
  dbPath: string;
  keystore: Keystore;
  version: string;
  port?: number;
  token?: string;
  logger?: Logger;
}

export interface RunningServer {
  apiBase: string;
  port: number;
  token: string;
  close(): Promise<void>;
}

export async function startServer(options: StartServerOptions): Promise<RunningServer> {
  const db = openDatabase(options.dbPath);
  const token = options.token ?? randomBytes(32).toString("hex");
  const logger =
    options.logger ??
    pino({
      level: process.env.LOG_LEVEL ?? "info",
      base: { service: "iwakura-server" },
    });

  const app = createApp({
    db,
    keystore: options.keystore,
    token,
    version: options.version,
    logger,
  });

  const server = serve({
    fetch: app.fetch,
    hostname: "127.0.0.1",
    port: options.port ?? 0,
  });

  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const port = address.port;
  const apiBase = `http://127.0.0.1:${port}`;
  logger.info({ apiBase }, "local server listening");

  return {
    apiBase,
    port,
    token,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      closeDatabase(db);
      logger.info("local server stopped");
    },
  };
}

export { createApp } from "./app.js";
export type { KeySource, Keystore } from "./keystore.js";
export { createEnvironmentKeystore } from "./keystore.js";
