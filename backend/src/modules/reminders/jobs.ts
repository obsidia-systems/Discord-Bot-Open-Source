import type { Reminder } from "@adobos/shared";
import { ChannelType, type Client, type TextBasedChannel } from "discord.js";
import { logger } from "#core/log.js";
import { defineQueue } from "#core/queue/index.js";
import {
  bumpReminderAttempt,
  claimDueReminders,
  clearReminderClaim,
  deleteReminderById,
  getReminder,
} from "./domain/reminders.js";

let botClient: Client | null = null;

interface DueJob {
  id: number;
  guildId: string;
}

const queue = defineQueue<DueJob>("reminders");

export function bindRemindersScheduler(client: Client): void {
  botClient = client;
  queue.process((job) => processReminder(job.id, job.guildId));
}

async function tryDm(client: Client, reminder: Reminder): Promise<boolean> {
  try {
    const user = await client.users.fetch(reminder.userId);
    await user.send(`⏰ Reminder: ${reminder.message}`);
    return true;
  } catch {
    return false;
  }
}

function asSendable(channel: unknown): TextBasedChannel | null {
  if (
    !channel ||
    typeof channel !== "object" ||
    !("isTextBased" in channel) ||
    typeof (channel as { isTextBased?: () => boolean }).isTextBased !==
      "function"
  ) {
    return null;
  }
  const text = channel as {
    isTextBased: () => boolean;
    isDMBased?: () => boolean;
    type?: number;
  };
  if (!text.isTextBased()) return null;
  if (text.type === ChannelType.GuildVoice) return null;
  return channel as TextBasedChannel;
}

async function tryChannel(
  client: Client,
  reminder: Reminder,
): Promise<boolean> {
  try {
    const guild =
      client.guilds.cache.get(reminder.guildId) ??
      (await client.guilds.fetch(reminder.guildId).catch(() => null));
    if (!guild) return false;
    const channel = await guild.channels
      .fetch(reminder.channelId)
      .catch(() => null);
    const text = asSendable(channel);
    if (!text || !("send" in text)) return false;
    await text.send({
      content: `<@${reminder.userId}> reminder: ${reminder.message}`,
      allowedMentions: { users: [reminder.userId] },
    });
    return true;
  } catch (error: unknown) {
    logger.warn(
      { err: error },
      `reminders: channel failed (id=${reminder.id})`,
    );
    return false;
  }
}

export async function deliverReminder(
  client: Client,
  reminder: Reminder,
): Promise<boolean> {
  const dm = await tryDm(client, reminder);
  if (dm) {
    await deleteReminderById(reminder.id);
    return true;
  }
  const channel = await tryChannel(client, reminder);
  if (channel) {
    await deleteReminderById(reminder.id);
    return true;
  }
  await bumpReminderAttempt(reminder.id);
  return false;
}

/**
 * Consumidor: entrega un recordatorio. `deliverReminder` ya gestiona el estado
 * terminal (borra al entregar, o incrementa `attempts`). Si el bot no está
 * listo lanza → BullMQ reintenta. Si no, libera el lease para el siguiente ciclo.
 */
export async function processReminder(
  id: number,
  guildId: string,
): Promise<void> {
  const client = botClient;
  if (!client?.isReady()) throw new Error("reminders: bot no listo");
  const fresh = await getReminder(id, guildId).catch(() => null);
  if (!fresh) return;
  await deliverReminder(client, fresh);
  await clearReminderClaim(id).catch(() => undefined);
}

/** Productor (líder): reclama recordatorios vencidos y los encola. */
export async function processDueReminders(): Promise<number> {
  if (!botClient?.isReady()) return 0;
  const claimed = await claimDueReminders();
  for (const job of claimed) {
    await queue.add(job);
  }
  return claimed.length;
}
