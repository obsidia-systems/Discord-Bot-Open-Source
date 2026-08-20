import type { AdobosModule } from "../../core/modules/types.js";
import { economyRoutes } from "./api/routes.js";

/** Módulo Economía — banco, saldos y leaderboard. */
export const economyModule: AdobosModule = {
  id: "economy",
  name: "Economía",
  register(ctx) {
    ctx.route("/api/economy", economyRoutes(ctx.client));
  },
};

export {
  EconomyError,
  adjustEconomyFunds,
  getEconomyConfig,
  getEconomyLeaderboardTotal,
  listEconomyLeaderboardRows,
  updateEconomyConfig,
} from "./service.js";
