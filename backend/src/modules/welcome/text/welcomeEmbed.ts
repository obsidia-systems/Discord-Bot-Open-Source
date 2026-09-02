import { type GuildMember } from "discord.js";
import type { WelcomeTemplateContext } from "@adobos/shared";

export type { WelcomeTemplateContext };
export { applyWelcomeVariables } from "@adobos/shared";

export function contextFromMember(member: GuildMember): WelcomeTemplateContext {
  return {
    userMention: `<@${member.id}>`,
    username: member.user.username,
    displayName: member.displayName,
    serverName: member.guild.name,
    memberCount: member.guild.memberCount,
  };
}
