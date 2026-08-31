import type { Channel, Client } from "discord.js";

export class ChannelScopeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ChannelScopeError";
  }
}

export function guildIdOfChannel(channel: Channel): string | null {
  return "guildId" in channel && typeof channel.guildId === "string"
    ? channel.guildId
    : null;
}

export function channelBelongsToGuild(
  channel: Channel,
  expectedGuildId: string,
): boolean {
  const id = guildIdOfChannel(channel);
  return id !== null && id === expectedGuildId;
}

/** Fetch global + exige que el canal pertenezca a `expectedGuildId`. */
export async function fetchChannelInGuild(
  bot: Client,
  channelId: string,
  expectedGuildId: string,
): Promise<Channel> {
  const channel = await bot.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    throw new ChannelScopeError(
      "Canal no encontrado.",
      404,
      "CHANNEL_NOT_FOUND",
    );
  }
  if (!channelBelongsToGuild(channel, expectedGuildId)) {
    throw new ChannelScopeError(
      "El canal no pertenece a este servidor.",
      403,
      "CHANNEL_GUILD_MISMATCH",
    );
  }
  return channel;
}

export function rethrowAsChannelError<E extends Error>(
  error: unknown,
  factory: (message: string, status: number, code: string) => E,
): never {
  if (error instanceof ChannelScopeError) {
    throw factory(error.message, error.status, error.code);
  }
  throw error;
}
