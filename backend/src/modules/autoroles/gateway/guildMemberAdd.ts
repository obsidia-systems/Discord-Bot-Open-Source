import type { GuildMember } from "discord.js";
import { logger } from "#core/log.js";
import { isRoleAssignableInGuild } from "../assignable.js";
import { getAutoJoinRoles } from "../autoJoin.js";

/** Asigna roles automáticos al unirse (humanos vs bots). */
export async function onGuildMemberAddAutoRoles(
  member: GuildMember,
): Promise<void> {
  try {
    const { config } = await getAutoJoinRoles(member.guild.id);
    const roleIds = member.user.bot ? config.botRoles : config.humanRoles;
    if (roleIds.length === 0) return;

    if (!member.guild.members.me) {
      await member.guild.members.fetchMe().catch(() => null);
    }

    const assignable = roleIds.filter(
      (roleId) =>
        member.guild.roles.cache.has(roleId) &&
        !member.roles.cache.has(roleId) &&
        isRoleAssignableInGuild(member.guild, roleId),
    );
    if (assignable.length === 0) return;

    await member.roles.add(assignable, "Adobos auto-roles on join");
  } catch (error: unknown) {
    logger.warn(
      { err: error instanceof Error ? error.message : error },
      "Auto-roles on join failed:",
    );
  }
}
