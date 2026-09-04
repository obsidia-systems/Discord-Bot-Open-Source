import { isWelcomeSendChannelType } from "@adobos/shared";
import type { SendableChannels } from "discord.js";
import type { BotGateway } from "#core/discord/botGateway.js";
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
  gateway: BotGateway,
  guildId: string,
  channelId: string,
): Promise<void> {
  if (!gateway.isReady()) {
    throw new HttpError(
      "The Discord bot is not connected.",
      503,
      "BOT_NOT_READY",
    );
  }

  // `getChannel` ya exige que el canal pertenezca a este guild → `null` cubre
  // "no existe" y "no es de este servidor".
  const channel = await gateway.getChannel(guildId, channelId);
  if (!channel) {
    throw new HttpError(
      "The channel was not found in this server.",
      404,
      "CHANNEL_NOT_FOUND",
    );
  }

  if (!isWelcomeSendChannelType(channel.type)) {
    throw new HttpError(
      "The channel does not support text messages.",
      400,
      "CHANNEL_NOT_TEXT",
    );
  }
}
