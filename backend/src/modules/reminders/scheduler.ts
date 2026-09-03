import type { Reminder } from "@adobos/shared";
import { ChannelType, type Client, type TextBasedChannel } from "discord.js";
import { logger } from "#core/log.js";
import {
  bumpReminderAttempt,
  deleteReminderById,
  getReminder,
  listDueReminders,
} from "./service.js";

let botClient: Client | null = null;
const inFlight = new Set<number>();

export function bindRemindersScheduler(client: Client): void {
  botClient = client;
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

export async function processDueReminders(): Promise<number> {
  const client = botClient;
  if (!client?.isReady()) return 0;
  const due = await listDueReminders();
  let processed = 0;
  for (const snapshot of due) {
    if (inFlight.has(snapshot.id)) continue;
    inFlight.add(snapshot.id);
    try {
      const fresh = await getReminder(snapshot.id, snapshot.guildId).catch(
        () => null,
      );
      if (!fresh) continue;
      processed += 1;
      await deliverReminder(client, fresh);
    } catch (error: unknown) {
      logger.warn({ err: error }, `reminders: tick failed (id=${snapshot.id})`);
    } finally {
      inFlight.delete(snapshot.id);
    }
  }
  return processed;
}
