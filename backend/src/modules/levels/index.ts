import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { levelsRoutes } from "./api/routes.js";
import { handleRankCommand } from "./commands/rank.js";
import { registerLevelsListeners } from "./events.js";

export const levelsModule: AdobosModule = {
  id: "levels",
  name: "Rangos y XP",
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  register(ctx) {
    ctx.route("/api/levels", levelsRoutes(ctx.client));
    registerLevelsListeners(ctx);

    // Esqueleto slash: /rank y alias /nivel (desplegar en Discord cuando haya sync de comandos).
    ctx.command({
      name: "rank",
      description: "Consulta tu nivel, XP y posición en el ranking.",
      handle: handleRankCommand,
    });
    ctx.command({
      name: "nivel",
      description: "Consulta tu nivel, XP y posición en el ranking.",
      handle: handleRankCommand,
    });
  },
};

export {
  LevelsError,
  getLevelsConfig,
  getLevelsConfigCached,
  invalidateLevelsConfigCache,
  updateLevelsConfig,
  addUserXp,
  getUserRankStats,
  listLeaderboardRows,
} from "./service.js";
