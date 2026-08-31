import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { autoDeleteRoutes } from "./api/routes.js";
import { registerAutoDeleteListeners } from "./events.js";
import {
  bindAutoDeleteScheduler,
  rehydrateAllAutoDeleteJobs,
  syncAutoDeleteJobsForConfig,
} from "./scheduler.js";
import { setAutoDeleteConfigChangeListener } from "./service.js";
import { logger } from "../../core/log.js";
import { isWorkerLeader } from "../../core/runtime/index.js";

export const autoDeleteModule: AdobosModule = {
  id: "auto-delete",
  name: "Auto-delete",
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

    ctx.route("/api/auto-delete", autoDeleteRoutes(ctx.client), {
      feature: "auto-delete",
    });
    registerAutoDeleteListeners(ctx);

    ctx.once("ready", async () => {
      if (!isWorkerLeader()) return;
      await rehydrateAllAutoDeleteJobs();
      logger.info("auto-delete: crons rehidratados");
    });
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
