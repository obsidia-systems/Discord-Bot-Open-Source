import "zod/compile";
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  startSessionPruneJob,
  stopSessionPruneJob,
} from "#core/auth/sessionStore.js";
import { createBotClient } from "#core/discord/createClient.js";
import { loadEnv } from "#core/env.js";
import { createApp, createHealthApp } from "#core/http/createApp.js";
import {
  installProcessGuards,
  onShutdown,
  runShutdown,
} from "#core/lifecycle.js";
import { logger } from "#core/log.js";
import { loadModules } from "#core/modules/index.js";
import {
  roleRunsGateway,
  roleRunsHttp,
  roleRunsWorker,
  setRuntimeRole,
  setWorkerLeader,
} from "#core/runtime/index.js";
import {
  acquireWorkerLock,
  releaseWorkerLock,
} from "#core/runtime/workerLock.js";
import { closeDatabase, initDatabase } from "#db/client.js";
import { wireCustomCommandsBuiltinSync } from "#modules/custom-commands/module.js";
import { ENABLED_MODULES } from "#modules/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  installProcessGuards();

  const cfg = loadEnv();
  setRuntimeRole(cfg.ADOBO_ROLE);

  await initDatabase();
  onShutdown("db", () => closeDatabase());

  if (roleRunsWorker(cfg.ADOBO_ROLE)) {
    const leader = await acquireWorkerLock(cfg.DATABASE_URL);
    setWorkerLeader(leader);
    onShutdown("worker-lock", () => releaseWorkerLock());
  }

  if (roleRunsHttp(cfg.ADOBO_ROLE)) {
    startSessionPruneJob();
    onShutdown("session-prune", () => stopSessionPruneJob());
  }

  const registry = loadModules(ENABLED_MODULES);
  wireCustomCommandsBuiltinSync();
  const bot = createBotClient(registry);
  onShutdown("discord", () => bot.destroy());

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
    logger.info("ADOBO_ROLE=api — no Discord login or crons");
  }

  const httpServer = app.listen(cfg.PORT, cfg.HOST, () => {
    const kind = roleRunsHttp(cfg.ADOBO_ROLE)
      ? cfg.SERVE_STATIC
        ? "Panel + API"
        : "API"
      : "health";
    logger.info(
      `${kind} (${cfg.ADOBO_ROLE}) en http://${cfg.HOST}:${cfg.PORT}`,
    );
  });

  // `close()` deja de aceptar conexiones nuevas y espera a las abiertas.
  // Sin timer que compita: el timeout por-hook del lifecycle es la red de seguridad.
  onShutdown(
    "http",
    () =>
      new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      }),
  );
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "Fallo al iniciar:");
  void runShutdown("startup-failure", 1);
});
