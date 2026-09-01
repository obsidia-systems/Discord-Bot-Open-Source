import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { autoModRoutes } from "./api/routes.js";
import { registerAutoModListeners } from "./events.js";

export const autoModModule: AdobosModule = {
  id: "auto-mod",
  name: "Auto Mod",
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.AutoModerationExecution,
    GatewayIntentBits.AutoModerationConfiguration,
  ],
  register(ctx) {
    ctx.route("/api/auto-mod", autoModRoutes(ctx.client), { feature: "automod" });
    registerAutoModListeners(ctx);
  },
};

export {
  AutoModError,
  getAutoModConfig,
  getAutoModConfigCached,
  invalidateAutoModConfigCache,
  resolveAutoModLogChannelId,
  updateAutoModConfig,
} from "./service.js";
