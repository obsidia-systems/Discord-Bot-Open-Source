import type { Client, GuildMember } from "discord.js";
import type { AutoModConfig, AutoModPunishment } from "@adobos/shared";
import {
  deductUserXp,
  freezeUserXp,
  getLevelsConfigCached,
} from "../levels/service.js";
import {
  executeModAction,
  ModerationError,
} from "../moderation/service.js";
import { countActiveWarns } from "./service.js";
import {
  findPunishmentForWarnCount,
  timeoutMsToSeconds,
} from "./punishmentMatch.js";
import { logger } from "../../core/log.js";

const AUDIT = "Sanción automática de Auto-Mod";

/**
 * Tras registrar un Warn: si el total activo coincide con una regla,
 * ejecuta la sanción correspondiente.
 */
export async function applyAutoModPunishments(input: {
  client: Client;
  guildId: string;
  member: GuildMember;
  config: AutoModConfig;
}): Promise<void> {
  const { client, guildId, member, config } = input;
  if (!config.punishments.length) return;

  const activeWarns = await countActiveWarns(
    guildId,
    member.id,
    config.warnDecayDays,
  );

  const match = findPunishmentForWarnCount(config.punishments, activeWarns);
  if (!match) return;

  await executePunishment(client, member, match, guildId);
}

async function executePunishment(
  client: Client,
  member: GuildMember,
  punishment: AutoModPunishment,
  guildId: string,
): Promise<void> {
  const reason = `${AUDIT} (${punishment.warnThreshold} warns → ${punishment.actionType})`;

  switch (punishment.actionType) {
    case "TIMEOUT": {
      const seconds = timeoutMsToSeconds(punishment.actionParam);
      if (seconds === null) return;
      await runDiscordAction(client, {
        action: "timeout",
        guildId,
        userId: member.id,
        reason,
        durationSeconds: seconds,
        dmMode: "none",
      });
      return;
    }
    case "KICK": {
      await runDiscordAction(client, {
        action: "kick",
        guildId,
        userId: member.id,
        reason,
        dmMode: "none",
      });
      return;
    }
    case "BAN": {
      await runDiscordAction(client, {
        action: "ban",
        guildId,
        userId: member.id,
        reason,
        dmMode: "none",
      });
      return;
    }
    case "REMOVE_XP": {
      const levels = await getLevelsConfigCached(guildId);
      if (!levels.enabled) {
        logger.warn("auto-mod REMOVE_XP ignorado: Rangos y XP desactivado.");
        return;
      }
      const amount = Math.max(
        1,
        Math.round(Number(punishment.actionParam) || 0),
      );
      try {
        await deductUserXp(guildId, member.id, amount);
      } catch (error) {
        logger.warn({ err: error }, "auto-mod REMOVE_XP falló:");
      }
      return;
    }
    case "XP_FREEZE": {
      const levels = await getLevelsConfigCached(guildId);
      if (!levels.enabled) {
        logger.warn("auto-mod XP_FREEZE ignorado: Rangos y XP desactivado.");
        return;
      }
      const ms = Math.max(0, Number(punishment.actionParam) || 0);
      if (ms <= 0) return;
      try {
        await freezeUserXp(guildId, member.id, new Date(Date.now() + ms));
      } catch (error) {
        logger.warn({ err: error }, "auto-mod XP_FREEZE falló:");
      }
      return;
    }
    default:
      return;
  }
}

async function runDiscordAction(
  client: Client,
  input: Parameters<typeof executeModAction>[1],
): Promise<void> {
  try {
    await executeModAction(client, input);
  } catch (error) {
    if (error instanceof ModerationError) {
      logger.warn(
        { code: error.code, err: error },
        "auto-mod sanción Discord rechazada:",
      );
      return;
    }
    logger.warn({ err: error }, "auto-mod sanción Discord falló:");
  }
}
