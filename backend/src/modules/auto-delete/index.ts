import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { autoDeleteRoutes } from "./api/routes.js";
import { registerAutoDeleteListeners } from "./events.js";

export const autoDeleteModule: AdobosModule = {
  id: "auto-delete",
  name: "Auto-delete",
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  register(ctx) {
    ctx.route("/api/auto-delete", autoDeleteRoutes(ctx.client));
    registerAutoDeleteListeners(ctx);
  },
};

export {
  AutoDeleteError,
  getAutoDeleteConfig,
  getAutoDeleteConfigCached,
  invalidateAutoDeleteConfigCache,
  updateAutoDeleteConfig,
} from "./service.js";
