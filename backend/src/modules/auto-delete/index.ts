import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { autoDeleteRoutes } from "./api/routes.js";
import { registerAutoDeleteListeners } from "./events.js";
import {
  bindAutoDeleteScheduler,
  rehydrateAllAutoDeleteJobs,
  stopAllAutoDeleteJobs,
  syncAutoDeleteJobsForConfig,
} from "./scheduler.js";
import { processDueCountdownDeletes } from "./pending.js";
import { setAutoDeleteConfigChangeListener } from "./service.js";
import { logger } from "../../core/log.js";
import { isWorkerLeader } from "../../core/runtime/index.js";
import { onShutdown, registerJob } from "../../core/lifecycle.js";

const COUNTDOWN_TICK_MS = 5_000;

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
    setAutoDeleteConfigChangeListener(async (config) => {
      if (!isWorkerLeader()) return;
      await syncAutoDeleteJobsForConfig(config);
    });
    onShutdown("auto-delete:cron", () => stopAllAutoDeleteJobs());

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

    const timer = setInterval(() => {
      if (!isWorkerLeader()) return;
      void processDueCountdownDeletes(ctx.client).catch((error: unknown) => {
        logger.warn({ err: error }, "auto-delete: tick failed:");
      });
    }, COUNTDOWN_TICK_MS);
    registerJob("auto-delete:countdown", timer);
  },
};

export {
  AutoDeleteError,
  getAutoDeleteConfig,
  getAutoDeleteConfigCached,
  invalidateAutoDeleteConfigCache,
  listAllAutoDeleteConfigs,
  updateAutoDeleteConfig,
} from "./service.js";
