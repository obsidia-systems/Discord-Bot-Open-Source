import { GatewayIntentBits } from "discord.js";
import { onShutdown, registerJob } from "#core/lifecycle.js";
import { logger } from "#core/log.js";
import type { AdobosModule } from "#core/modules/types.js";
import { isWorkerLeader } from "#core/runtime/index.js";
import { setAutoDeleteConfigChangeListener } from "./domain/auto-delete.js";
import { registerAutoDeleteListeners } from "./gateway.js";
import { autoDeleteRoutes } from "./http/routes.js";
import {
  bindAutoDeleteScheduler,
  processDueScheduledCleanups,
  rehydrateAllAutoDeleteJobs,
  stopAllAutoDeleteJobs,
  syncAutoDeleteJobsForConfig,
} from "./jobs.js";
import { processDueCountdownDeletes } from "./pending.js";

const COUNTDOWN_TICK_MS = 5_000;
// Las reglas SCHEDULED son de minuto: un tick < 60s no pierde el minuto.
const SCHEDULED_TICK_MS = 20_000;

export const autoDeleteModule: AdobosModule = {
  id: "auto-delete",
  name: "Auto-Delete",
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  register(ctx) {
    bindAutoDeleteScheduler(ctx.client);
    setAutoDeleteConfigChangeListener((config) => {
      if (!isWorkerLeader()) return;
      syncAutoDeleteJobsForConfig(config);
    });
    onShutdown("auto-delete:scheduled-rules", () => stopAllAutoDeleteJobs());

    ctx.route("/api/auto-delete", autoDeleteRoutes(ctx.client), {
      feature: "auto-delete",
    });
    registerAutoDeleteListeners(ctx);

    ctx.once("ready", async () => {
      if (!isWorkerLeader()) return;
      await rehydrateAllAutoDeleteJobs();
      logger.info("auto-delete: crons rehidratados");
      try {
        await processDueCountdownDeletes(ctx.client);
      } catch (error) {
        logger.warn({ err: error }, "auto-delete: initial tick failed:");
      }
    });

    const countdownTimer = setInterval(() => {
      if (!isWorkerLeader()) return;
      void processDueCountdownDeletes(ctx.client).catch((error: unknown) => {
        logger.warn({ err: error }, "auto-delete: tick failed:");
      });
    }, COUNTDOWN_TICK_MS);
    registerJob("auto-delete:countdown", countdownTimer);

    const scheduledTimer = setInterval(() => {
      if (!isWorkerLeader()) return;
      void processDueScheduledCleanups(ctx.client).catch((error: unknown) => {
        logger.warn({ err: error }, "auto-delete: scheduled tick failed:");
      });
    }, SCHEDULED_TICK_MS);
    registerJob("auto-delete:scheduled", scheduledTimer);
  },
};

export {
  AutoDeleteError,
  getAutoDeleteConfig,
  getAutoDeleteConfigCached,
  invalidateAutoDeleteConfigCache,
  listAllAutoDeleteConfigs,
  updateAutoDeleteConfig,
} from "./domain/auto-delete.js";
