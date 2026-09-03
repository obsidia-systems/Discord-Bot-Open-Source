import type { ScheduledEmbedData, ScheduledMessage } from "@adobos/shared";
import { computeNextRunAt, isScheduledOneShot } from "@adobos/shared";
import {
  type AttachmentBuilder,
  type Channel,
  ChannelType,
  type Client,
  DiscordAPIError,
  EmbedBuilder,
  type TextChannel,
} from "discord.js";
import { logger } from "#core/log.js";
import { resolveEmbedMedia } from "#lib/embedMedia.js";
import {
  applyScheduledMessageTick,
  backfillScheduledNextRuns,
  getScheduledMessage,
  listDueScheduledMessages,
  nextRunAfterSend,
  ScheduledMessagesError,
} from "./domain/scheduled-messages.js";

let botClient: Client | null = null;
const inFlight = new Set<number>();

export function bindScheduledMessagesScheduler(client: Client): void {
  botClient = client;
}

export function isScheduledDestinationChannel(channel: Channel): boolean {
  return (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildAnnouncement
  );
}

function embedColorInt(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(n) ? n : 0x5865f2;
}

export type ScheduledSendResult = "sent" | "invalid_channel" | "failed";

function isUnknownChannel(error: unknown): boolean {
  if (error instanceof DiscordAPIError) {
    const code = Number(error.code);
    return code === 10003 || code === 10004 || code === 50001;
  }
  return false;
}

function buildSendPayload(message: ScheduledMessage): {
  content?: string;
  embeds: EmbedBuilder[];
  files?: AttachmentBuilder[];
  allowedMentions: { parse: [] } | { roles: string[] };
} {
  const files: AttachmentBuilder[] = [];
  const data: ScheduledEmbedData = message.embedData;
  let imageUrl: string | undefined;
  if (data.imageUrl) {
    try {
      const resolved = resolveEmbedMedia(
        data.imageUrl,
        "imageUrl",
        "scheduled-image",
      );
      if (resolved.file) files.push(resolved.file);
      imageUrl = resolved.url;
    } catch (error) {
      logger.warn(
        { err: error },
        `scheduled-messages: invalid media (id=${message.id})`,
      );
    }
  }

  const embed = new EmbedBuilder()
    .setColor(embedColorInt(data.color))
    .setTitle(data.title || "Scheduled Message")
    .setDescription(data.description || "\u200b");
  if (imageUrl) embed.setImage(imageUrl);

  const ping = message.pingRoleId ? `<@&${message.pingRoleId}>` : "";
  const body = message.content.trim();
  const content = [ping, body].filter(Boolean).join("\n").slice(0, 2000);

  return {
    content: content || undefined,
    embeds: [embed],
    files: files.length > 0 ? files : undefined,
    allowedMentions: message.pingRoleId
      ? { roles: [message.pingRoleId] }
      : { parse: [] },
  };
}

async function deliverScheduledMessage(
  client: Client,
  message: ScheduledMessage,
): Promise<ScheduledSendResult> {
  try {
    const guild =
      client.guilds.cache.get(message.guildId) ??
      (await client.guilds.fetch(message.guildId).catch(() => null));
    if (!guild) return "failed";

    const channel = await guild.channels
      .fetch(message.channelId)
      .catch((error: unknown) => {
        if (isUnknownChannel(error)) return null;
        throw error;
      });
    if (!channel) {
      logger.warn(
        `scheduled-messages: missing channel, pausing (id=${message.id} channel=${message.channelId})`,
      );
      return "invalid_channel";
    }
    if (!isScheduledDestinationChannel(channel) || !channel.isTextBased()) {
      logger.warn(
        `scheduled-messages: channel is not text/announcement, pausing (id=${message.id} type=${channel.type})`,
      );
      return "invalid_channel";
    }

    const textChannel = channel as TextChannel;
    await textChannel.send(buildSendPayload(message));
    return "sent";
  } catch (error) {
    if (isUnknownChannel(error)) {
      logger.warn(
        { err: error },
        `scheduled-messages: invalid channel, pausing (id=${message.id})`,
      );
      return "invalid_channel";
    }
    logger.warn(
      { err: error },
      `scheduled-messages: send failed (id=${message.id})`,
    );
    return "failed";
  }
}

async function deactivateInvalid(message: ScheduledMessage): Promise<void> {
  await applyScheduledMessageTick(message.id, message.guildId, {
    isActive: false,
    nextRunAt: null,
  });
}

/**
 * Envío inmediato (panel «Enviar ahora»). No consume el one-shot.
 * Si el canal no sirve, pausa el job y lanza.
 */
export async function sendScheduledMessageNow(
  messageId: number,
  guildId: string,
): Promise<ScheduledMessage> {
  const client = botClient;
  if (!client) {
    throw new ScheduledMessagesError(
      "The bot is not ready.",
      503,
      "BOT_NOT_READY",
    );
  }
  const message = await getScheduledMessage(messageId, guildId);
  const result = await deliverScheduledMessage(client, message);
  if (result === "invalid_channel") {
    await deactivateInvalid(message);
    throw new ScheduledMessagesError(
      "The destination channel is no longer valid. This message was paused.",
      400,
      "INVALID_CHANNEL",
    );
  }
  if (result !== "sent") {
    throw new ScheduledMessagesError(
      "Couldn't send the message.",
      502,
      "SEND_FAILED",
    );
  }
  const sentAt = new Date();
  await applyScheduledMessageTick(message.id, message.guildId, {
    lastSentAt: sentAt,
  });
  return await getScheduledMessage(messageId, guildId);
}

export async function processDueScheduledMessages(): Promise<number> {
  const client = botClient;
  if (!client) return 0;

  const due = await listDueScheduledMessages();
  let processed = 0;
  for (const snapshot of due) {
    if (inFlight.has(snapshot.id)) continue;
    inFlight.add(snapshot.id);
    try {
      processed += 1;
      const fresh = await getScheduledMessage(snapshot.id, snapshot.guildId);
      if (!fresh.isActive) continue;

      const now = new Date();
      const lastSent = fresh.lastSentAt ? new Date(fresh.lastSentAt) : null;
      const computed = computeNextRunAt(
        fresh.frequency,
        fresh.timezone,
        now,
        lastSent,
      );
      if (computed && computed.getTime() > now.getTime()) {
        await applyScheduledMessageTick(fresh.id, fresh.guildId, {
          nextRunAt: computed,
        });
        continue;
      }
      if (!computed) {
        await applyScheduledMessageTick(fresh.id, fresh.guildId, {
          isActive: false,
          nextRunAt: null,
        });
        continue;
      }

      const result = await deliverScheduledMessage(client, fresh);
      if (result === "invalid_channel") {
        await deactivateInvalid(fresh);
        continue;
      }
      if (result !== "sent") continue;

      const sentAt = new Date();
      const after = nextRunAfterSend(fresh, sentAt);
      await applyScheduledMessageTick(fresh.id, fresh.guildId, {
        lastSentAt: sentAt,
        isActive: after.isActive,
        nextRunAt: after.nextRunAt,
      });
      if (isScheduledOneShot(fresh.frequency)) {
        logger.info(
          `scheduled-messages: one-shot enviado y pausado (id=${fresh.id})`,
        );
      }
    } catch (error) {
      logger.warn(
        { err: error },
        `scheduled-messages: tick failed (id=${snapshot.id})`,
      );
    } finally {
      inFlight.delete(snapshot.id);
    }
  }
  return processed;
}

/** Rellena next_run_at de filas activas (migración / restart). */
export async function rehydrateScheduledMessages(): Promise<void> {
  try {
    await backfillScheduledNextRuns();
  } catch (error) {
    logger.warn(
      { err: error },
      "scheduled-messages: backfill next_run_at failed",
    );
  }
}
