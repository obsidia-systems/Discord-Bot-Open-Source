import type { AdobosModule } from "../../core/modules/types.js";
import { economyRoutes } from "./api/routes.js";
import { startShopExpirationSweeper } from "./shopExpiration.js";

/** Módulo Economía — banco, ingresos, saldos y leaderboard. */
export const economyModule: AdobosModule = {
  id: "economy",
  name: "Economía",
  register(ctx) {
    ctx.route("/api/economy", economyRoutes(ctx.client));
    ctx.once("ready", () => {
      startShopExpirationSweeper(ctx.client);
      console.log("[adobos] economy: sweeper de grants temporales activo");
    });
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

export {
  getEconomyIncomeConfig,
  updateEconomyIncomeConfig,
} from "./incomeService.js";

export {
  createShopItem,
  deleteShopItem,
  getShopItem,
  listShopItems,
  updateShopItem,
} from "./shopService.js";

export { purchaseShopItem } from "./purchaseService.js";
