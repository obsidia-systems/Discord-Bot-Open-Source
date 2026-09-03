import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "#core/modules/types.js";
import { registerStarboardListeners } from "./gateway.js";
import { starboardRoutes } from "./http/routes.js";

export const starboardModule: AdobosModule = {
  id: "starboard",
  name: "Starboard",
  intents: [GatewayIntentBits.GuildMessageReactions],
  register(ctx) {
    ctx.route("/api/starboard", starboardRoutes(ctx.botGateway), {
      feature: "starboard",
    });
    registerStarboardListeners(ctx);
  },
};

export {
  getStarboardConfig,
  StarboardError,
  updateStarboardSettings,
} from "./domain/starboard.js";
