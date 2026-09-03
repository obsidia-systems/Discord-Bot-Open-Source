import type { AdobosModule } from "#core/modules/types.js";
import { restorePersistedPresence } from "./discord.js";
import { botProfileRoutes } from "./http/routes.js";

export const botProfileModule: AdobosModule = {
  id: "bot-profile",
  name: "Bot Profile",
  register(ctx) {
    const routes = botProfileRoutes(ctx.client);
    ctx.route("/api/bot/guild-profile", routes);
    // Alias de compatibilidad con el path anterior.
    ctx.route("/api/bot/profile", routes);

    ctx.once("ready", async () => {
      await restorePersistedPresence(ctx.client);
    });
  },
};

export {
  BotProfileError,
  getBotProfile,
  getGuildBotProfile,
  readPersistedPresence,
  restorePersistedPresence,
  updateBotProfile,
  updateGuildBotProfile,
} from "./discord.js";
