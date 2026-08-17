import cron, { type ScheduledTask } from "node-cron";
import {
  ChannelType,
  EmbedBuilder,
  type AttachmentBuilder,
  type Client,
  type TextChannel,
} from "discord.js";
import type { ScheduledEmbedData, ScheduledMessage } from "@adobos/shared";
import { normalizeScheduledTimezone } from "@adobos/shared";
import { resolveEmbedMedia } from "../../lib/embedMedia.js";
import {
  isValidIanaTimezone,
  timeAndDaysToCron,
  timeAndMonthDayToCron,
} from "../../lib/schedulerTimezone.js";
import { listAllActiveScheduledMessages, getScheduledMessage } from "./service.js";

/** Jobs en memoria: id del mensaje → task de node-cron. */
const jobs = new Map<number, ScheduledTask>();

let botClient: Client | null = null;

export function bindScheduledMessagesScheduler(client: Client): void {
  botClient = client;
}

function embedColorInt(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(n) ? n : 0x5865f2;
}

function frequencyToCronExpression(message: ScheduledMessage): string | null {
  const { frequency } = message;
  if (frequency.type === "monthly") {
    return timeAndMonthDayToCron(frequency.time, frequency.dayOfMonth);
  }
  if (frequency.type === "weekly") {
    return timeAndDaysToCron(frequency.time, frequency.days);
  }
  return timeAndDaysToCron(frequency.time, []);
}

async function sendScheduledMessage(
  client: Client,
  message: ScheduledMessage,
): Promise<void> {
  try {
    const guild =
      client.guilds.cache.get(message.guildId) ??
      (await client.guilds.fetch(message.guildId).catch(() => null));
    if (!guild) return;

    const channel = await guild.channels
      .fetch(message.channelId)
      .catch(() => null);
    if (
      !channel ||
      (channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement)
    ) {
      return;
    }

    const textChannel = channel as TextChannel;
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
        console.warn(
          `[adobos] scheduled-messages: media inválida (id=${message.id}):`,
          error,
        );
      }
    }

    const embed = new EmbedBuilder()
      .setColor(embedColorInt(data.color))
      .setTitle(data.title || "Mensaje programado")
      .setDescription(data.description || "\u200b");
    if (imageUrl) embed.setImage(imageUrl);

    await textChannel.send({
      embeds: [embed],
      files: files.length > 0 ? files : undefined,
    });
  } catch (error) {
    console.warn(
      `[adobos] scheduled-messages: envío falló (id=${message.id}):`,
      error,
    );
  }
}

export function stopScheduledJob(messageId: number): void {
  const job = jobs.get(messageId);
  if (!job) return;
  try {
    job.stop();
  } catch {
    /* ignore */
  }
  jobs.delete(messageId);
}

export function stopAllScheduledJobs(): void {
  for (const id of [...jobs.keys()]) {
    stopScheduledJob(id);
  }
}

/**
 * Registra o actualiza el cron de un mensaje.
 * Si `isActive` es false, solo detiene el job.
 */
export function syncScheduledJob(message: ScheduledMessage | null): void {
  const client = botClient;
  if (!message) return;

  stopScheduledJob(message.id);
  if (!client || !message.isActive) return;

  const expression = frequencyToCronExpression(message);
  if (!expression || !cron.validate(expression)) {
    console.warn(
      `[adobos] scheduled-messages: cron inválido (id=${message.id}):`,
      expression,
    );
    return;
  }

  const timezone = normalizeScheduledTimezone(message.timezone);
  if (!isValidIanaTimezone(timezone)) {
    console.warn(
      `[adobos] scheduled-messages: timezone inválida (id=${message.id}):`,
      message.timezone,
    );
    return;
  }

  const messageId = message.id;

  const task = cron.schedule(
    expression,
    () => {
      void (async () => {
        try {
          const fresh = getScheduledMessage(messageId, message.guildId);
          if (!fresh.isActive) {
            stopScheduledJob(messageId);
            return;
          }
          await sendScheduledMessage(client, fresh);
        } catch (error) {
          console.warn(
            `[adobos] scheduled-messages: tick falló (id=${messageId}):`,
            error,
          );
        }
      })();
    },
    { timezone },
  );
  jobs.set(message.id, task);
}

/** Tras eliminar: detener job por id. */
export function onScheduledMessageRemoved(messageId: number): void {
  stopScheduledJob(messageId);
}

/** Rehidrata todos los crons activos desde SQLite. */
export function rehydrateAllScheduledJobs(): void {
  stopAllScheduledJobs();
  try {
    const messages = listAllActiveScheduledMessages();
    for (const message of messages) {
      syncScheduledJob(message);
    }
  } catch (error) {
    console.warn("[adobos] scheduled-messages: rehydrate cron falló:", error);
  }
}
