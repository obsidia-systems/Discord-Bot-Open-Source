import type { TextChannel } from "discord.js";
import {
  ChannelType,
  type DMChannel,
  type Message,
  type NonThreadGuildBasedChannel,
} from "discord.js";
import { logger } from "#core/log.js";
import { onTicketChannelDeleted, onTicketChannelMessage } from "./actions.js";

function asGuildText(channel: unknown): TextChannel | null {
  if (
    channel &&
    typeof channel === "object" &&
    "type" in channel &&
    (channel as { type: number }).type === ChannelType.GuildText &&
    "guild" in channel
  ) {
    return channel as TextChannel;
  }
  return null;
}

export async function onTicketsChannelDelete(
  channel: DMChannel | NonThreadGuildBasedChannel,
): Promise<void> {
  if (!("guild" in channel) || !channel.id) return;
  try {
    await onTicketChannelDeleted(channel.id);
  } catch (error: unknown) {
    logger.warn({ err: error, channelId: channel.id }, "Tickets channelDelete");
  }
}

export async function onTicketsMessageCreate(message: Message): Promise<void> {
  const channel = asGuildText(message.channel);
  if (!channel) return;
  try {
    await onTicketChannelMessage({
      channel,
      authorId: message.author.id,
      bot: message.author.bot,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Tickets messageCreate (waiting)");
  }
}
