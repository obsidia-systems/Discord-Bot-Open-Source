import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import { getSystemCommandDefinition } from "@adobos/shared";
import { getCommandPermission } from "./service.js";
import { setInteractionEphemeral } from "./ephemeral.js";

export type SystemCommandGuardResult =
  | { ok: true; ephemeral: boolean }
  | { ok: false; message: string };

function memberHasAnyRole(
  member: GuildMember,
  roleIds: string[],
): boolean {
  if (roleIds.length === 0) return true;
  return roleIds.some((id) => member.roles.cache.has(id));
}

function memberHasModPermission(
  member: GuildMember,
  commandName: string,
): boolean {
  const perms = member.permissions;
  if (perms.has(PermissionFlagsBits.Administrator)) return true;

  switch (commandName) {
    case "ban":
      return perms.has(PermissionFlagsBits.BanMembers);
    case "kick":
      return perms.has(PermissionFlagsBits.KickMembers);
    case "timeout":
    case "untimeout":
    case "warn":
    case "warns":
    case "clearwarns":
      return perms.has(PermissionFlagsBits.ModerateMembers);
    case "purge":
    case "slowmode":
    case "lock":
    case "unlock":
      return perms.has(PermissionFlagsBits.ManageChannels);
    case "givexp":
    case "removexp":
    case "setlevel":
    case "addmoney":
    case "removemoney":
      return (
        perms.has(PermissionFlagsBits.ManageGuild) ||
        perms.has(PermissionFlagsBits.Administrator)
      );
    default:
      return (
        perms.has(PermissionFlagsBits.ManageGuild) ||
        perms.has(PermissionFlagsBits.ModerateMembers)
      );
  }
}

/**
 * Valida enabled / roles / admin-by-default antes de ejecutar un slash nativo.
 * Guarda la preferencia ephemeral en el mapa de interacción.
 */
export function assertSystemCommandAllowed(
  interaction: ChatInputCommandInteraction,
): SystemCommandGuardResult {
  const def = getSystemCommandDefinition(interaction.commandName);
  if (!def) {
    // No está en el catálogo (custom u otro) — no bloquear aquí.
    return { ok: true, ephemeral: false };
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    return {
      ok: false,
      message: "Este comando solo funciona en un servidor.",
    };
  }

  const perm = getCommandPermission(guildId, interaction.commandName);
  const ephemeral = def.supportsEphemeral
    ? perm.ephemeral
    : def.defaultEphemeral;

  if (!perm.enabled) {
    return {
      ok: false,
      message: "❌ Este comando ha sido desactivado por los administradores.",
    };
  }

  const member = interaction.member;
  if (!member || typeof member === "string" || !("roles" in member)) {
    return {
      ok: false,
      message: "No se pudo verificar tus roles en este servidor.",
    };
  }

  const guildMember = member as GuildMember;

  if (perm.allowedRoles.length > 0) {
    if (!memberHasAnyRole(guildMember, perm.allowedRoles)) {
      return {
        ok: false,
        message: "🚫 No tienes el rol requerido para usar este comando.",
      };
    }
  } else if (def.requiresAdminByDefault) {
    if (!memberHasModPermission(guildMember, interaction.commandName)) {
      return {
        ok: false,
        message:
          "🚫 Necesitas permisos de moderación de Discord para usar este comando.",
      };
    }
  }

  setInteractionEphemeral(interaction.id, ephemeral);
  return { ok: true, ephemeral };
}
