import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { levelsRoutes } from "./api/routes.js";
import { handleLeaderboardCommand } from "./commands/leaderboard.js";
import { handleRankCommand, rankCommandOptions } from "./commands/rank.js";
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

    ctx.command({
      name: "rank",
      description: "Consulta tu nivel, XP y posición en el ranking.",
      options: rankCommandOptions,
      handle: handleRankCommand,
    });
    ctx.command({
      name: "nivel",
      description: "Consulta tu nivel, XP y posición en el ranking.",
      options: rankCommandOptions,
      handle: handleRankCommand,
    });
    ctx.command({
      name: "leaderboard",
      description: "Muestra el Top 10 de XP del servidor.",
      handle: handleLeaderboardCommand,
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
