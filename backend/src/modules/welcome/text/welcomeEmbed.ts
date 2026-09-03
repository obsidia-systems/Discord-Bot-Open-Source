import type { WelcomeTemplateContext } from "@adobos/shared";
import type { GuildMember } from "discord.js";

export { applyWelcomeVariables } from "@adobos/shared";
export type { WelcomeTemplateContext };

export function contextFromMember(member: GuildMember): WelcomeTemplateContext {
  return {
    userMention: `<@${member.id}>`,
    username: member.user.username,
    displayName: member.displayName,
    serverName: member.guild.name,
    memberCount: member.guild.memberCount,
  };
}
