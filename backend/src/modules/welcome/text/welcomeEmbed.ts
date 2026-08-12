import {
  ChannelType,
  type GuildMember,
  type SendableChannels,
  type TextChannel,
} from "discord.js";

export interface WelcomeTemplateContext {
  userMention: string;
  username: string;
  displayName: string;
  serverName: string;
  memberCount: number;
}

export function contextFromMember(member: GuildMember): WelcomeTemplateContext {
  return {
    userMention: `<@${member.id}>`,
    username: member.user.username,
    displayName: member.displayName,
    serverName: member.guild.name,
    memberCount: member.guild.memberCount,
  };
}

/** Sustituye placeholders `{user}`, `{username}`, `{server}`, etc. */
export function applyWelcomeVariables(
  text: string,
  ctx: WelcomeTemplateContext,
): string {
  return text
    .replaceAll("{user}", ctx.userMention)
    .replaceAll("{username}", ctx.username)
    .replaceAll("{displayname}", ctx.displayName)
    .replaceAll("{displayName}", ctx.displayName)
    .replaceAll("{server}", ctx.serverName)
    .replaceAll("{membercount}", String(ctx.memberCount))
    .replaceAll("{memberCount}", String(ctx.memberCount));
}

export function isSendableTextChannel(
  channel: unknown,
): channel is SendableChannels & TextChannel {
  if (!channel || typeof channel !== "object") return false;
  const typed = channel as { type?: ChannelType; send?: unknown };
  if (
    typed.type === ChannelType.GuildCategory ||
    typed.type === ChannelType.GuildVoice ||
    typed.type === ChannelType.GuildStageVoice
  ) {
    return false;
  }
  return typeof typed.send === "function";
}
