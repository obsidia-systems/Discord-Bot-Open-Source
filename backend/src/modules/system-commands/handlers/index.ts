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
  handleKickCommand,
  handleTimeoutCommand,
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
import { handleBestsetsCommand } from "../../pokemon/commands/bestsets.js";
import { handleCoverageCommand } from "../../pokemon/commands/coverage.js";
import { handleLocationCommand } from "../../pokemon/commands/location.js";
import { handleMovesetCommand } from "../../pokemon/commands/moveset.js";
import { handlePokeinfoCommand } from "../../pokemon/commands/pokeinfo.js";
import { handleWeaknessCommand } from "../../pokemon/commands/weakness.js";
import {
  handleBreedingCommand,
  handleCountersCommand,
  handleSandwichCommand,
  handleTeambuilderCommand,
} from "../../pokemon/commands/stubs.js";
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
  untimeout: (i) => stubCommand(i, "Moderación"),
  warn: (i) => stubCommand(i, "Moderación"),
  warns: (i) => stubCommand(i, "Moderación"),
  clearwarns: (i) => stubCommand(i, "Moderación"),
  purge: (i) => stubCommand(i, "Moderación"),
  slowmode: (i) => stubCommand(i, "Moderación"),
  lock: (i) => stubCommand(i, "Moderación"),
  unlock: (i) => stubCommand(i, "Moderación"),

  // Rangos y XP
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

  // Pokémon
  pokeinfo: handlePokeinfoCommand,
  teambuilder: handleTeambuilderCommand,
  weakness: handleWeaknessCommand,
  coverage: handleCoverageCommand,
  breeding: handleBreedingCommand,
  location: handleLocationCommand,
  moveset: handleMovesetCommand,
  bestsets: handleBestsetsCommand,
  counters: handleCountersCommand,
  sandwich: handleSandwichCommand,

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
    const economy = getEconomyConfig(interaction.guildId);
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
