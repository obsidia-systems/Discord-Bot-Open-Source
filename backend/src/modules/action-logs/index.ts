import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { actionLogsRoutes } from "./api/routes.js";
import { registerActionLogListeners } from "./events.js";
import { purgeAllExpiredActionLogs } from "./service.js";

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
      try {
        const n = await purgeAllExpiredActionLogs();
        if (n > 0) {
          console.log(`[adobos] action-logs: purge inicial eliminó ${n} filas`);
        }
      } catch (error) {
        console.warn("[adobos] action-logs: purge inicial falló:", error);
      }
    });

    const timer = setInterval(async () => {
      try {
        const n = await purgeAllExpiredActionLogs();
        if (n > 0) {
          console.log(`[adobos] action-logs: purge periódico eliminó ${n} filas`);
        }
      } catch (error) {
        console.warn("[adobos] action-logs: purge periódico falló:", error);
      }
    }, RETENTION_PURGE_MS);
    timer.unref?.();
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
} from "./service.js";
