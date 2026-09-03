import "zod/compile";
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import type { Client } from "discord.js";
import { initDatabase, closeDatabase } from "./db/client.js";
import { loadModules } from "./core/modules/index.js";
import { createBotClient } from "./core/bot/createClient.js";
import { createApp, createHealthApp } from "./core/http/createApp.js";
import { ENABLED_MODULES } from "./modules/index.js";
import { wireCustomCommandsBuiltinSync } from "./modules/custom-commands/index.js";
import { logger } from "./core/log.js";
import { loadEnv } from "./core/env.js";
import {
  roleRunsGateway,
  roleRunsHttp,
  roleRunsWorker,
  setRuntimeRole,
  setWorkerLeader,
} from "./core/runtime/index.js";
import { acquireWorkerLock, releaseWorkerLock } from "./core/runtime/workerLock.js";
import { startSessionPruneJob, stopSessionPruneJob } from "./core/auth/sessionStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let httpServer: Server | null = null;
let botClient: Client | null = null;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "apagando");
  stopSessionPruneJob();
  await new Promise<void>((resolve) => {
    if (!httpServer) {
      resolve();
      return;
    }
    httpServer.close(() => resolve());
    setTimeout(resolve, 8_000).unref();
  });
  botClient?.destroy();
  await releaseWorkerLock();
  await closeDatabase();
  process.exit(0);
}

async function main(): Promise<void> {
  const cfg = loadEnv();
  setRuntimeRole(cfg.ADOBO_ROLE);

  await initDatabase();

  if (roleRunsWorker(cfg.ADOBO_ROLE)) {
    const leader = await acquireWorkerLock(cfg.DATABASE_URL);
    setWorkerLeader(leader);
  }

  if (roleRunsHttp(cfg.ADOBO_ROLE)) {
    startSessionPruneJob();
  }

  const registry = loadModules(ENABLED_MODULES);
  wireCustomCommandsBuiltinSync();
  const bot = createBotClient(registry);
  botClient = bot;

  const app = roleRunsHttp(cfg.ADOBO_ROLE)
    ? createApp({
        bot,
        registry,
        staticDir: cfg.STATIC_DIR ?? path.resolve(__dirname, "../public"),
      })
    : createHealthApp(bot);

  if (roleRunsGateway(cfg.ADOBO_ROLE)) {
    if (cfg.DISCORD_TOKEN) {
      await bot.login(cfg.DISCORD_TOKEN);
    } else {
      logger.warn(
        "DISCORD_TOKEN not defined — the process starts without the Discord gateway.",
      );
    }
  } else {
    logger.info("ADOBO_ROLE=api — sin login Discord ni crons");
  }

  httpServer = app.listen(cfg.PORT, cfg.HOST, () => {
    const kind = roleRunsHttp(cfg.ADOBO_ROLE)
      ? cfg.SERVE_STATIC
        ? "Panel + API"
        : "API"
      : "health";
    logger.info(
      `${kind} (${cfg.ADOBO_ROLE}) en http://${cfg.HOST}:${cfg.PORT}`,
    );
  });

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "Fallo al iniciar:");
  process.exit(1);
});
