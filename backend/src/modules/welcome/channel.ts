import { isWelcomeSendChannelType } from "@adobos/shared";
import type { Channel, Client, SendableChannels } from "discord.js";
import { HttpError } from "#core/http/httpError.js";

export function isWelcomeSendChannel(
  channel: unknown,
): channel is SendableChannels {
  if (!channel || typeof channel !== "object") return false;
  const typed = channel as { type?: number; send?: unknown };
  if (typeof typed.type !== "number" || !isWelcomeSendChannelType(typed.type)) {
    return false;
  }
  return typeof typed.send === "function";
}

export async function assertGuildWelcomeChannel(
  bot: Client,
  guildId: string,
  channelId: string,
): Promise<void> {
  if (!bot.isReady()) {
    throw new HttpError(
      "The Discord bot is not connected.",
      503,
      "BOT_NOT_READY",
    );
  }

  let channel: Channel | null;
  try {
    channel = await bot.channels.fetch(channelId);
  } catch {
    throw new HttpError(
      "Couldn't fetch the channel. Check the ID and the bot's permissions.",
      404,
      "CHANNEL_FETCH_FAILED",
    );
  }

  if (!channel) {
    throw new HttpError("Channel not found.", 404, "CHANNEL_NOT_FOUND");
  }

  const channelGuildId =
    "guildId" in channel && typeof channel.guildId === "string"
      ? channel.guildId
      : null;
  if (!channelGuildId || channelGuildId !== guildId) {
    throw new HttpError(
      "The channel does not belong to this server.",
      403,
      "CHANNEL_GUILD_MISMATCH",
    );
  }

  if (!isWelcomeSendChannel(channel)) {
    throw new HttpError(
      "The channel does not support text messages.",
      400,
      "CHANNEL_NOT_TEXT",
    );
  }
}
