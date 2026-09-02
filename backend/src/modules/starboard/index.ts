import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { starboardRoutes } from "./api/routes.js";
import { registerStarboardListeners } from "./events.js";

export const starboardModule: AdobosModule = {
  id: "starboard",
  name: "Starboard",
  intents: [GatewayIntentBits.GuildMessageReactions],
  register(ctx) {
    ctx.route("/api/starboard", starboardRoutes(ctx.client), {
      feature: "starboard",
    });
    registerStarboardListeners(ctx);
  },
};

export {
  StarboardError,
  getStarboardConfig,
  updateStarboardSettings,
} from "./service.js";
