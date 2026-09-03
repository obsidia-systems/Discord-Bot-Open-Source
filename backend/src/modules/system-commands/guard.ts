import {
  featureLockedMessage,
  getSystemCommandDefinition,
  tierHasFeature,
} from "@adobos/shared";
import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import { featureForCommandCategory } from "#core/entitlements/features.js";
import { getGuildTier } from "#core/entitlements/service.js";
import { setInteractionEphemeral } from "./ephemeral.js";
import { getCommandPermission } from "./service.js";

export type SystemCommandGuardResult =
  | { ok: true; ephemeral: boolean }
  | { ok: false; message: string };

function memberHasAnyRole(member: GuildMember, roleIds: string[]): boolean {
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
      return perms.has(PermissionFlagsBits.Administrator);
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
 * Valida enabled / canales ignorados / roles / admin-by-default
 * antes de ejecutar un slash nativo.
 */
export async function assertSystemCommandAllowed(
  interaction: ChatInputCommandInteraction,
): Promise<SystemCommandGuardResult> {
  const def = getSystemCommandDefinition(interaction.commandName);
  if (!def) {
    return { ok: true, ephemeral: false };
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    return {
      ok: false,
      message: "This command only works in a server.",
    };
  }

  const perm = await getCommandPermission(guildId, interaction.commandName);
  const ephemeral = def.supportsEphemeral
    ? perm.ephemeral
    : def.defaultEphemeral;

  if (!perm.enabled) {
    return {
      ok: false,
      message: "❌ This command has been disabled by the administrators.",
    };
  }

  const tier = await getGuildTier(guildId);
  const feature = featureForCommandCategory(def.category);
  if (!tierHasFeature(tier, feature)) {
    return {
      ok: false,
      message: `🔒 ${featureLockedMessage(tier, feature)}`,
    };
  }

  if (
    interaction.channelId &&
    perm.ignoredChannels.includes(interaction.channelId)
  ) {
    return {
      ok: false,
      message: "🚫 This command can't be used in this channel.",
    };
  }

  const member = interaction.member;
  if (!member || typeof member === "string" || !("roles" in member)) {
    return {
      ok: false,
      message: "Couldn't verify your roles in this server.",
    };
  }

  const guildMember = member as GuildMember;

  if (perm.allowedRoles.length > 0) {
    if (!memberHasAnyRole(guildMember, perm.allowedRoles)) {
      return {
        ok: false,
        message: "🚫 You don't have the required role to use this command.",
      };
    }
  } else if (def.requiresAdminByDefault) {
    if (!memberHasModPermission(guildMember, interaction.commandName)) {
      return {
        ok: false,
        message:
          "🚫 You need Discord moderation permissions to use this command.",
      };
    }
  }

  setInteractionEphemeral(interaction.id, ephemeral);
  return { ok: true, ephemeral };
}
