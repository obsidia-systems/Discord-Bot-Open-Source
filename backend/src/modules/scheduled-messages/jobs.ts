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
import { defineQueue } from "#core/queue/index.js";
import { resolveEmbedMedia } from "#lib/embedMedia.js";
import {
  applyScheduledMessageTick,
  backfillScheduledNextRuns,
  claimDueScheduledMessages,
  getScheduledMessage,
  nextRunAfterSend,
  ScheduledMessagesError,
} from "./domain/scheduled-messages.js";

let botClient: Client | null = null;

interface DueJob {
  id: number;
  guildId: string;
}

const queue = defineQueue<DueJob>("scheduled-messages");

export function bindScheduledMessagesScheduler(client: Client): void {
  botClient = client;
  queue.process((job) => processScheduledMessage(job.id, job.guildId));
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

/**
 * Consumidor: entrega un mensaje reclamado. En fallo NO libera el lease —
 * BullMQ reintenta dentro de la ventana de 2 min y, si agota, el lease expira
 * y el productor lo vuelve a reclamar.
 */
export async function processScheduledMessage(
  id: number,
  guildId: string,
): Promise<void> {
  const client = botClient;
  if (!client) throw new Error("scheduled-messages: bot no listo");

  const fresh = await getScheduledMessage(id, guildId);
  if (!fresh.isActive) {
    await applyScheduledMessageTick(id, guildId, { claimedUntil: null });
    return;
  }

  const now = new Date();
  const lastSent = fresh.lastSentAt ? new Date(fresh.lastSentAt) : null;
  const computed = computeNextRunAt(
    fresh.frequency,
    fresh.timezone,
    now,
    lastSent,
  );
  if (computed && computed.getTime() > now.getTime()) {
    await applyScheduledMessageTick(id, guildId, {
      nextRunAt: computed,
      claimedUntil: null,
    });
    return;
  }
  if (!computed) {
    await applyScheduledMessageTick(id, guildId, {
      isActive: false,
      nextRunAt: null,
      claimedUntil: null,
    });
    return;
  }

  const result = await deliverScheduledMessage(client, fresh);
  if (result === "invalid_channel") {
    await applyScheduledMessageTick(id, guildId, {
      isActive: false,
      nextRunAt: null,
      claimedUntil: null,
    });
    return;
  }
  if (result !== "sent") {
    throw new Error(`scheduled-messages: envío falló (id=${id})`);
  }

  const sentAt = new Date();
  const after = nextRunAfterSend(fresh, sentAt);
  await applyScheduledMessageTick(id, guildId, {
    lastSentAt: sentAt,
    isActive: after.isActive,
    nextRunAt: after.nextRunAt,
    claimedUntil: null,
  });
  if (isScheduledOneShot(fresh.frequency)) {
    logger.info(`scheduled-messages: one-shot enviado y pausado (id=${id})`);
  }
}

/** Productor (líder): reclama filas vencidas y las encola. */
export async function processDueScheduledMessages(): Promise<number> {
  if (!botClient) return 0;
  const claimed = await claimDueScheduledMessages();
  for (const job of claimed) {
    await queue.add(job);
  }
  return claimed.length;
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
