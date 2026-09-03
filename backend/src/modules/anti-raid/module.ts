import { antiRaidLockdownSlashCommandBody } from "@adobos/shared";
import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "#core/modules/types.js";
import { handleLockdownCommand } from "./commands.js";
import { registerAntiRaidListeners } from "./gateway.js";
import { antiRaidRoutes } from "./http/routes.js";

const slash = antiRaidLockdownSlashCommandBody();

export const antiRaidModule: AdobosModule = {
  id: "anti-raid",
  name: "Anti-Raid",
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
  register(ctx) {
    ctx.route("/api/anti-raid", antiRaidRoutes(ctx.client), {
      feature: "anti-raid",
    });
    ctx.command({
      name: slash.name,
      description: slash.description,
      handle: (interaction) => handleLockdownCommand(interaction),
    });
    registerAntiRaidListeners(ctx);
  },
};

export {
  AntiRaidError,
  getAntiRaidConfig,
  updateAntiRaidSettings,
} from "./domain/anti-raid.js";
