import type { AdobosModule } from "#core/modules/types.js";
import { guildAssetsRoutes } from "./http/routes.js";

/** Assets del guild para el panel (canales, roles, emojis). Infra de UI. */
export const guildAssetsModule: AdobosModule = {
  id: "guild-assets",
  name: "Guild Assets",
  register(ctx) {
    ctx.route("/api/guild-assets", guildAssetsRoutes(ctx.client));
  },
};

export { GuildAssetsError, getGuildAssets } from "./http/controller.js";
