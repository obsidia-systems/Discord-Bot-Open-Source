import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { canvasEventSettingsRoutes } from "./api/routes.js";
import { onGuildBanAdd } from "./events/guildBanAdd.js";
import { onGuildMemberRemove } from "./events/guildMemberRemove.js";
import { onGuildMemberUpdate } from "./events/guildMemberUpdate.js";

/**
 * Despedidas, baneos y boosts: misma tarjeta canvas que bienvenidas.
 */
export const canvasEventsModule: AdobosModule = {
  id: "canvas-events",
  name: "Canvas Events",
  intents: [
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
  register(ctx) {
    ctx.on("guildMemberRemove", (member) => {
      void onGuildMemberRemove(member);
    });
    ctx.on("guildBanAdd", (ban) => {
      void onGuildBanAdd(ban);
    });
    ctx.on("guildMemberUpdate", (oldMember, newMember) => {
      void onGuildMemberUpdate(oldMember, newMember);
    });

    ctx.route("/api/bot/leave", canvasEventSettingsRoutes("leave", ctx.client), {
      feature: "welcome",
    });
    ctx.route("/api/bot/ban", canvasEventSettingsRoutes("ban", ctx.client), {
      feature: "welcome",
    });
    ctx.route("/api/bot/boost", canvasEventSettingsRoutes("boost", ctx.client), {
      feature: "welcome",
    });
  },
};
