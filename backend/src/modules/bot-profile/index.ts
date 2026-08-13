import type { AdobosModule } from "../../core/modules/types.js";
import { botProfileRoutes } from "./api/routes.js";
import { restorePersistedPresence } from "./service.js";

export const botProfileModule: AdobosModule = {
  id: "bot-profile",
  name: "Perfil del bot",
  register(ctx) {
    ctx.route("/api/bot/profile", botProfileRoutes(ctx.client));

    ctx.once("ready", () => {
      restorePersistedPresence(ctx.client);
    });
  },
};

export {
  BotProfileError,
  applyPresenceToClient,
  getBotProfile,
  readPersistedPresence,
  restorePersistedPresence,
  savePersistedPresence,
  updateBotProfile,
} from "./service.js";
