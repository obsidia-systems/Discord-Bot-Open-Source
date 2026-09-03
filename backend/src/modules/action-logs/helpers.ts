import { ChannelType } from "discord.js";

export function userTag(user: {
  username?: string | null;
  discriminator?: string | null;
  tag?: string | null;
  id?: string;
}): string {
  if (typeof user.tag === "string" && user.tag) return user.tag;
  if (user.username) {
    const disc =
      user.discriminator && user.discriminator !== "0"
        ? `#${user.discriminator}`
        : "";
    return `${user.username}${disc}`;
  }
  return user.id ?? "desconocido";
}

export function channelTypeName(type: number): string {
  switch (type) {
    case ChannelType.GuildText:
      return "Texto";
    case ChannelType.GuildVoice:
      return "Voz";
    case ChannelType.GuildCategory:
      return "Category";
    case ChannelType.GuildAnnouncement:
      return "Anuncios";
    case ChannelType.GuildStageVoice:
      return "Escenario";
    case ChannelType.GuildForum:
      return "Foro";
    case ChannelType.GuildMedia:
      return "Media";
    default:
      return "Category/Other";
  }
}

export function safeChannelName(channel: { name?: string | null }): string {
  const name = typeof channel.name === "string" ? channel.name.trim() : "";
  return name || "unnamed-channel";
}
