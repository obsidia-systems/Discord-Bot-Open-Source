import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { levelsRoutes } from "./api/routes.js";
import { registerLevelsListeners } from "./events.js";

export const levelsModule: AdobosModule = {
  id: "levels",
  name: "Levels",
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  register(ctx) {
    ctx.route("/api/levels", levelsRoutes(ctx.client), { feature: "levels" });
    registerLevelsListeners(ctx);
    // Slash nativos (/rank, /leaderboard, …) viven en el catálogo
    // `SYSTEM_COMMAND_CATALOG` + handlers de system-commands.
  },
};

export {
  addUserXp,
  deductUserXp,
  getLevelsConfig,
  getLevelsConfigCached,
  getUserRankStats,
  invalidateLevelsConfigCache,
  LevelsError,
  listLeaderboardRows,
  setUserLevel,
  updateLevelsConfig,
} from "./service.js";
