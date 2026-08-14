import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { actionLogsRoutes } from "./api/routes.js";
import { registerActionLogListeners } from "./events.js";

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
  ],
  register(ctx) {
    ctx.route("/api/logs", actionLogsRoutes(ctx.client));
    registerActionLogListeners(ctx);
  },
};

export {
  ActionLogsError,
  getActionLogsConfig,
  listActionLogsHistory,
  recordActionLog,
  sendActionLogsTestEmbed,
  updateActionLogsConfig,
} from "./service.js";
