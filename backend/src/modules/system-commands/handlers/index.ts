import type { ChatInputCommandInteraction } from "discord.js";
import { getSystemCommandDefinition } from "@adobos/shared";
import { handleRankCommand } from "../../levels/commands/rank.js";
import { handleLeaderboardCommand } from "../../levels/commands/leaderboard.js";
import {
  handleBanCommand,
  handleKickCommand,
  handleTimeoutCommand,
} from "../../moderation/commands/slash.js";
import { handleBuyCommand } from "../../economy/commands/buy.js";
import {
  handleAddMoneyCommand,
  handleBalanceCommand,
  handleBaltopCommand,
  handleCrimeCommand,
  handleDailyCommand,
  handlePayCommand,
  handleRemoveMoneyCommand,
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
  givexp: (i) => stubCommand(i, "Rangos y XP"),
  removexp: (i) => stubCommand(i, "Rangos y XP"),
  setlevel: (i) => stubCommand(i, "Rangos y XP"),

  // Economía
  balance: handleBalanceCommand,
  work: handleWorkCommand,
  crime: handleCrimeCommand,
  daily: handleDailyCommand,
  pay: handlePayCommand,
  baltop: handleBaltopCommand,
  addmoney: handleAddMoneyCommand,
  removemoney: handleRemoveMoneyCommand,
  shop: handleShopCommand,
  buy: handleBuyCommand,

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
