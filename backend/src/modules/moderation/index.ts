import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { moderationRoutes } from "./api/routes.js";
import {
  banCommandOptions,
  handleBanCommand,
  handleKickCommand,
  handleTimeoutCommand,
  kickCommandOptions,
  timeoutCommandOptions,
} from "./commands/slash.js";

export const moderationModule: AdobosModule = {
  id: "moderation",
  name: "Moderación",
  intents: [
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  register(ctx) {
    ctx.route("/api/mod", moderationRoutes(ctx.client));

    ctx.command({
      name: "ban",
      description: "Banea a un miembro del servidor.",
      options: banCommandOptions,
      handle: handleBanCommand,
    });
    ctx.command({
      name: "kick",
      description: "Expulsa a un miembro del servidor.",
      options: kickCommandOptions,
      handle: handleKickCommand,
    });
    ctx.command({
      name: "timeout",
      description: "Aplica un timeout (silencio temporal) a un miembro.",
      options: timeoutCommandOptions,
      handle: handleTimeoutCommand,
    });
  },
};
