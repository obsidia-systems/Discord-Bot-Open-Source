import { getSystemCommandDefinition } from "@adobos/shared";
import { type ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { handleBuyCommand } from "#modules/economy/commands/buy.js";
import {
  handleBlackjackCommand,
  handleCoinflipCommand,
  handleRouletteCommand,
  handleSlotsCommand,
} from "#modules/economy/commands/casino.js";
import {
  handleAddMoneyCommand,
  handleBalanceCommand,
  handleBaltopCommand,
  handleCollectIncomeCommand,
  handleCrimeCommand,
  handleDailyCommand,
  handleDepositCommand,
  handleMonthlyCommand,
  handlePayCommand,
  handleRemoveMoneyCommand,
  handleRobCommand,
  handleSetMoneyCommand,
  handleWeeklyCommand,
  handleWithdrawCommand,
  handleWorkCommand,
} from "#modules/economy/commands/income.js";
import {
  handleInventoryCommand,
  handleUseCommand,
} from "#modules/economy/commands/inventory.js";
import { handleShopCommand } from "#modules/economy/commands/shop.js";
import { getEconomyConfig } from "#modules/economy/service.js";
import {
  handleGiveXpCommand,
  handleRemoveXpCommand,
  handleSetLevelCommand,
} from "#modules/levels/commands/admin.js";
import { handleLeaderboardCommand } from "#modules/levels/commands/leaderboard.js";
import { handleRankCommand } from "#modules/levels/commands/rank.js";
import {
  handleBanCommand,
  handleClearWarnsCommand,
  handleKickCommand,
  handleLockCommand,
  handlePurgeCommand,
  handleSlowmodeCommand,
  handleTimeoutCommand,
  handleUnlockCommand,
  handleUntimeoutCommand,
  handleWarnCommand,
  handleWarnsCommand,
} from "#modules/moderation/commands/slash.js";
import {
  handlePingCommand,
  handleServerInfoCommand,
} from "../commands/utilities.js";
import { stubCommand } from "./stub.js";
import {
  handleAvatarCommand,
  handleHelpCommand,
  handleUserInfoCommand,
} from "./utilities.js";

export type DefaultCommandHandler = (
  interaction: ChatInputCommandInteraction,
) => Promise<void>;

/**
 * Mapa Command Pattern: nombre del slash → handler.
 */
export const DEFAULT_COMMAND_HANDLERS: Record<string, DefaultCommandHandler> = {
  // Moderación
  ban: handleBanCommand,
  kick: handleKickCommand,
  timeout: handleTimeoutCommand,
  untimeout: handleUntimeoutCommand,
  warn: handleWarnCommand,
  warns: handleWarnsCommand,
  clearwarns: handleClearWarnsCommand,
  purge: handlePurgeCommand,
  slowmode: handleSlowmodeCommand,
  lock: handleLockCommand,
  unlock: handleUnlockCommand,

  // Levels
  rank: handleRankCommand,
  leaderboard: handleLeaderboardCommand,
  givexp: handleGiveXpCommand,
  removexp: handleRemoveXpCommand,
  setlevel: handleSetLevelCommand,

  // Economía
  balance: handleBalanceCommand,
  deposit: handleDepositCommand,
  withdraw: handleWithdrawCommand,
  work: handleWorkCommand,
  crime: handleCrimeCommand,
  daily: handleDailyCommand,
  weekly: handleWeeklyCommand,
  monthly: handleMonthlyCommand,
  pay: handlePayCommand,
  baltop: handleBaltopCommand,
  addmoney: handleAddMoneyCommand,
  removemoney: handleRemoveMoneyCommand,
  setmoney: handleSetMoneyCommand,
  shop: handleShopCommand,
  buy: handleBuyCommand,
  coinflip: handleCoinflipCommand,
  roulette: handleRouletteCommand,
  blackjack: handleBlackjackCommand,
  slots: handleSlotsCommand,
  "collect-income": handleCollectIncomeCommand,
  rob: handleRobCommand,
  inventory: handleInventoryCommand,
  use: handleUseCommand,

  // Utilidades
  userinfo: handleUserInfoCommand,
  serverinfo: handleServerInfoCommand,
  avatar: handleAvatarCommand,
  ping: handlePingCommand,
  help: handleHelpCommand,
};

/**
 * Ejecuta un comando nativo del catálogo.
 * @returns true si el nombre pertenece al catálogo (aunque falle el handler).
 */
export async function dispatchDefaultCommand(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  const def = getSystemCommandDefinition(interaction.commandName);
  if (!def) return false;

  if (def.category === "economy" && interaction.guildId) {
    const economy = await getEconomyConfig(interaction.guildId);
    if (!economy.isActive) {
      await interaction.reply({
        content: "⛔ The economy is disabled in this server.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
  }

  const handler =
    DEFAULT_COMMAND_HANDLERS[interaction.commandName] ??
    ((i: ChatInputCommandInteraction) => stubCommand(i, def.category));

  await handler(interaction);
  return true;
}
