import type { Client, GuildMember } from "discord.js";
import type { AutoModConfig, AutoModPunishment } from "@adobos/shared";
import {
  deductUserXp,
  freezeUserXp,
  getLevelsConfigCached,
} from "../levels/service.js";
import { countActiveWarns } from "./service.js";

const AUDIT = "Sanción automática de Auto Mod";

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
  const { guildId, member, config } = input;
  if (!config.punishments.length) return;

  const activeWarns = countActiveWarns(
    guildId,
    member.id,
    config.warnDecayDays,
  );

  const match = config.punishments.find(
    (p) => p.warnThreshold === activeWarns,
  );
  if (!match) return;

  await executePunishment(member, match, guildId);
}

async function executePunishment(
  member: GuildMember,
  punishment: AutoModPunishment,
  guildId: string,
): Promise<void> {
  const reason = `${AUDIT} (${punishment.warnThreshold} warns → ${punishment.actionType})`;

  switch (punishment.actionType) {
    case "TIMEOUT": {
      const ms = Math.max(0, Number(punishment.actionParam) || 0);
      if (ms <= 0) return;
      await member.timeout(ms, reason).catch((error) => {
        console.warn("[adobos] auto-mod TIMEOUT falló:", error);
      });
      return;
    }
    case "KICK": {
      await member.kick(reason).catch((error) => {
        console.warn("[adobos] auto-mod KICK falló:", error);
      });
      return;
    }
    case "BAN": {
      await member.ban({ reason }).catch((error) => {
        console.warn("[adobos] auto-mod BAN falló:", error);
      });
      return;
    }
    case "REMOVE_XP": {
      const levels = getLevelsConfigCached(guildId);
      if (!levels.enabled) {
        console.warn(
          "[adobos] auto-mod REMOVE_XP ignorado: Rangos y XP desactivado.",
        );
        return;
      }
      const amount = Math.max(
        1,
        Math.round(Number(punishment.actionParam) || 0),
      );
      try {
        deductUserXp(guildId, member.id, amount);
      } catch (error) {
        console.warn("[adobos] auto-mod REMOVE_XP falló:", error);
      }
      return;
    }
    case "XP_FREEZE": {
      const levels = getLevelsConfigCached(guildId);
      if (!levels.enabled) {
        console.warn(
          "[adobos] auto-mod XP_FREEZE ignorado: Rangos y XP desactivado.",
        );
        return;
      }
      const ms = Math.max(0, Number(punishment.actionParam) || 0);
      if (ms <= 0) return;
      try {
        freezeUserXp(guildId, member.id, new Date(Date.now() + ms));
      } catch (error) {
        console.warn("[adobos] auto-mod XP_FREEZE falló:", error);
      }
      return;
    }
    default:
      return;
  }
}
