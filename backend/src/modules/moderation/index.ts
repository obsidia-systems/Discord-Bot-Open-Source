import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "#core/modules/types.js";
import { moderationRoutes } from "./api/routes.js";

export const moderationModule: AdobosModule = {
  id: "moderation",
  name: "Moderation",
  intents: [
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  register(ctx) {
    ctx.route("/api/mod", moderationRoutes(ctx.client), {
      feature: "moderation",
    });
    // Slash nativos (/ban, /kick, …) viven en el catálogo + handlers.
  },
};
