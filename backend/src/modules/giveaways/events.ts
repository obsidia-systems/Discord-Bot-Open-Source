import type {
  DMChannel,
  Message,
  NonThreadGuildBasedChannel,
  PartialMessage,
} from "discord.js";
import { logger } from "../../core/log.js";
import { clearGiveawayMessageByDiscordId } from "./service.js";

export async function onGiveawayMessageDelete(
  message: Message | PartialMessage,
): Promise<void> {
  if (!message.id) return;
  try {
    await clearGiveawayMessageByDiscordId({ messageId: message.id });
  } catch (error: unknown) {
    logger.warn({ err: error }, "giveaways: messageDelete");
  }
}

export async function onGiveawayChannelDelete(
  channel: DMChannel | NonThreadGuildBasedChannel,
): Promise<void> {
  if (!("id" in channel) || !channel.id) return;
  try {
    await clearGiveawayMessageByDiscordId({ channelId: channel.id });
  } catch (error: unknown) {
    logger.warn({ err: error }, "giveaways: channelDelete");
  }
}
