import { logger } from "#core/log.js";
import type { AdobosModule } from "#core/modules/types.js";
import { isWorkerLeader } from "#core/runtime/index.js";
import { handleBuyButton } from "./commands/buy.js";
import {
  BJ_BUTTON_PREFIX,
  CF_BUTTON_PREFIX,
  handleBlackjackButton,
  handleCoinflipButton,
  handleRouletteButton,
  handleRouletteSelect,
  handleSlotsButton,
  RL_BUTTON_PREFIX,
  RL_SELECT_PREFIX,
  SL_BUTTON_PREFIX,
} from "./commands/casino.js";
import {
  CR_SELECT_PREFIX,
  handleCrimeSelect,
  handleWorkSelect,
  WK_SELECT_PREFIX,
} from "./commands/income.js";
import {
  BUY_BUTTON_PREFIX,
  handleShopPageButton,
  SHOP_PAGE_PREFIX,
} from "./commands/shop.js";
import { refundAbandonedBlackjackStakes } from "./domain/funds.js";
import { economyRoutes } from "./http/routes.js";
import { startShopExpirationSweeper } from "./shopExpiration.js";

/** Módulo Economy — banco, ingresos, tienda y casino. */
export const economyModule: AdobosModule = {
  id: "economy",
  name: "Economy",
  register(ctx) {
    ctx.route("/api/economy", economyRoutes(ctx.botGateway), {
      feature: "economy",
    });
    ctx.button(BUY_BUTTON_PREFIX, (interaction) =>
      handleBuyButton(interaction),
    );
    ctx.button(SHOP_PAGE_PREFIX, (interaction) =>
      handleShopPageButton(interaction),
    );
    ctx.button(BJ_BUTTON_PREFIX, (interaction) =>
      handleBlackjackButton(interaction),
    );
    ctx.button(CF_BUTTON_PREFIX, (interaction) =>
      handleCoinflipButton(interaction),
    );
    ctx.button(RL_BUTTON_PREFIX, (interaction) =>
      handleRouletteButton(interaction),
    );
    ctx.button(SL_BUTTON_PREFIX, (interaction) =>
      handleSlotsButton(interaction),
    );
    ctx.select(RL_SELECT_PREFIX, (interaction) =>
      handleRouletteSelect(interaction),
    );
    ctx.select(WK_SELECT_PREFIX, (interaction) =>
      handleWorkSelect(interaction),
    );
    ctx.select(CR_SELECT_PREFIX, (interaction) =>
      handleCrimeSelect(interaction),
    );
    ctx.once("ready", async () => {
      if (!isWorkerLeader()) return;
      await startShopExpirationSweeper(ctx.client);
      const refunded = await refundAbandonedBlackjackStakes();
      logger.info({ refunded }, "economy: temporary grants sweeper active");
    });
  },
};

export {
  assertCasinoBetAllowed,
  getEconomyCasinoConfig,
  updateEconomyCasinoConfig,
} from "./domain/casinoService.js";
export {
  EconomyError,
  getEconomyConfig,
  getEconomyLeaderboardTotal,
  listEconomyLeaderboardRows,
  updateEconomyConfig,
} from "./domain/economy.js";
export { adjustEconomyFunds } from "./domain/funds.js";
export {
  getEconomyIncomeConfig,
  updateEconomyIncomeConfig,
} from "./domain/incomeService.js";
export {
  createShopItem,
  deleteShopItem,
  getShopItem,
  listShopItems,
  updateShopItem,
} from "./domain/shopService.js";
export { purchaseShopItem } from "./purchaseService.js";
