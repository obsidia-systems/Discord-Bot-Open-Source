import type { ChatInputCommandInteraction } from "discord.js";
import { getSystemCommandDefinition } from "@adobos/shared";
import { handleRankCommand } from "../../levels/commands/rank.js";
import { handleLeaderboardCommand } from "../../levels/commands/leaderboard.js";
import {
  handleGiveXpCommand,
  handleRemoveXpCommand,
  handleSetLevelCommand,
} from "../../levels/commands/admin.js";
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
} from "../../moderation/commands/slash.js";
import { handleBuyCommand } from "../../economy/commands/buy.js";
import {
  handleBlackjackCommand,
  handleCoinflipCommand,
  handleRouletteCommand,
} from "../../economy/commands/casino.js";
import {
  handleAddMoneyCommand,
  handleBalanceCommand,
  handleBaltopCommand,
  handleCrimeCommand,
  handleDailyCommand,
  handleDepositCommand,
  handleMonthlyCommand,
  handlePayCommand,
  handleRemoveMoneyCommand,
  handleWeeklyCommand,
  handleWithdrawCommand,
  handleWorkCommand,
} from "../../economy/commands/income.js";
import { handleShopCommand } from "../../economy/commands/shop.js";
import { getEconomyConfig } from "../../economy/service.js";
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
  shop: handleShopCommand,
  buy: handleBuyCommand,
  coinflip: handleCoinflipCommand,
  roulette: handleRouletteCommand,
  blackjack: handleBlackjackCommand,

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
        content: "⛔ La economía está desactivada en este servidor.",
        ephemeral: true,
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
