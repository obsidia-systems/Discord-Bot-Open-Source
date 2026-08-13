import type { GuildMember } from "discord.js";
import { getAutoJoinRoles } from "../autoJoin.js";

/** Asigna roles automáticos al unirse (humanos vs bots). */
export async function onGuildMemberAddAutoRoles(
  member: GuildMember,
): Promise<void> {
  try {
    const { config } = getAutoJoinRoles(member.guild.id);
    const roleIds = member.user.bot ? config.botRoles : config.humanRoles;
    if (roleIds.length === 0) return;

    const assignable = roleIds.filter(
      (roleId) =>
        member.guild.roles.cache.has(roleId) &&
        !member.roles.cache.has(roleId),
    );
    if (assignable.length === 0) return;

    await member.roles.add(assignable, "Adobos auto-roles al unirse");
  } catch (error: unknown) {
    console.warn(
      "[adobos] Auto-roles al unirse falló:",
      error instanceof Error ? error.message : error,
    );
  }
}
