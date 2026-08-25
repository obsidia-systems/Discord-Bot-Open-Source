import type { AdobosModule } from "../../core/modules/types.js";
import { economyRoutes } from "./api/routes.js";
import { handleBuyButton } from "./commands/buy.js";
import {
  BJ_BUTTON_PREFIX,
  handleBlackjackButton,
} from "./commands/casino.js";
import {
  BUY_BUTTON_PREFIX,
  SHOP_PAGE_PREFIX,
  handleShopPageButton,
} from "./commands/shop.js";
import { startShopExpirationSweeper } from "./shopExpiration.js";

/** Módulo Economía — banco, ingresos, saldos y leaderboard. */
export const economyModule: AdobosModule = {
  id: "economy",
  name: "Economía",
  register(ctx) {
    ctx.route("/api/economy", economyRoutes(ctx.client));
    ctx.button(BUY_BUTTON_PREFIX, (interaction) =>
      handleBuyButton(interaction),
    );
    ctx.button(SHOP_PAGE_PREFIX, (interaction) =>
      handleShopPageButton(interaction),
    );
    ctx.button(BJ_BUTTON_PREFIX, (interaction) =>
      handleBlackjackButton(interaction),
    );
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
  assertCasinoBetAllowed,
  getEconomyCasinoConfig,
  updateEconomyCasinoConfig,
} from "./casinoService.js";

export {
  createShopItem,
  deleteShopItem,
  getShopItem,
  listShopItems,
  updateShopItem,
} from "./shopService.js";

export { purchaseShopItem } from "./purchaseService.js";
