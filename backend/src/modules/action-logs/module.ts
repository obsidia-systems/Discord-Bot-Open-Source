import { GatewayIntentBits } from "discord.js";
import { registerJob } from "#core/lifecycle.js";
import { logger } from "#core/log.js";
import type { AdobosModule } from "#core/modules/types.js";
import { isWorkerLeader } from "#core/runtime/index.js";
import { purgeAllExpiredActionLogs } from "./discord.js";
import { registerActionLogListeners } from "./gateway.js";
import { actionLogsRoutes } from "./http/routes.js";

const RETENTION_PURGE_MS = 60 * 60 * 1000; // 1h

export const actionLogsModule: AdobosModule = {
  id: "action-logs",
  name: "Action Logs",
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites,
  ],
  register(ctx) {
    ctx.route("/api/logs", actionLogsRoutes(ctx.client), { feature: "logs" });
    registerActionLogListeners(ctx);

    ctx.once("ready", async () => {
      if (!isWorkerLeader()) return;
      try {
        const n = await purgeAllExpiredActionLogs();
        if (n > 0) {
          logger.info(`action-logs: initial purge removed ${n} rows`);
        }
      } catch (error) {
        logger.warn({ err: error }, "action-logs: initial purge failed:");
      }
    });

    const timer = setInterval(async () => {
      if (!isWorkerLeader()) return;
      try {
        const n = await purgeAllExpiredActionLogs();
        if (n > 0) {
          logger.info(`action-logs: periodic purge removed ${n} rows`);
        }
      } catch (error) {
        logger.warn({ err: error }, "action-logs: periodic purge failed:");
      }
    }, RETENTION_PURGE_MS);
    registerJob("action-logs:retention-purge", timer);
  },
};

export {
  ActionLogsError,
  getActionLogsConfig,
  listActionLogsHistory,
  purgeAllExpiredActionLogs,
  purgeExpiredActionLogs,
  recordActionLog,
  sendActionLogsTestEmbed,
  updateActionLogsConfig,
} from "./discord.js";
