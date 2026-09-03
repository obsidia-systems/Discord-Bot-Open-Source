import type {
  AutoDeleteConfig,
  AutoDeleteFilterType,
  AutoDeleteRule,
} from "@adobos/shared";
import {
  isOlderThanBulkWindow,
  messageMatchesAutoDeleteFilter,
  normalizeScheduledTimezone,
} from "@adobos/shared";
import {
  type Channel,
  ChannelType,
  type Client,
  type GuildTextBasedChannel,
  type Message,
} from "discord.js";
import { logger } from "#core/log.js";
import {
  clockPartsInZone,
  isDailyScheduleDue,
} from "#lib/schedulerTimezone.js";
import { rememberBotMessageDeletes } from "#modules/action-logs/audit.js";
import { listAllAutoDeleteConfigs } from "./domain/auto-delete.js";

const MAX_PAGES = 25;
const PAUSE_MS = 350;

interface ScheduledEntry {
  guildId: string;
  rule: AutoDeleteRule;
  timezone: string;
}

/** guildId → reglas SCHEDULED activas (reemplaza los cron tasks de node-cron). */
const scheduledRules = new Map<string, ScheduledEntry[]>();
/** `${guildId}:${channelId}` → último minuto (stamp de su zona) ya disparado. */
const lastFired = new Map<string, string>();

let botClient: Client | null = null;

export function bindAutoDeleteScheduler(client: Client): void {
  botClient = client;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toSnapshot(message: Message) {
  return {
    pinned: message.pinned,
    authorIsBot: Boolean(message.author?.bot),
    hasAttachments: message.attachments.size > 0,
    createdTimestamp: message.createdTimestamp,
  };
}

async function sweepTextChannel(
  channel: GuildTextBasedChannel,
  filterType: AutoDeleteFilterType,
): Promise<void> {
  if (!("bulkDelete" in channel)) return;
  let before: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const fetched = await channel.messages
      .fetch({ limit: 100, before })
      .catch(() => null);
    if (!fetched || fetched.size === 0) break;

    const oldest = [...fetched.values()].sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp,
    )[0];
    before = oldest?.id;

    const matching = fetched.filter((msg) =>
      messageMatchesAutoDeleteFilter(toSnapshot(msg), filterType),
    );
    const young = matching.filter(
      (msg) => !isOlderThanBulkWindow(msg.createdTimestamp),
    );
    const old = matching.filter((msg) =>
      isOlderThanBulkWindow(msg.createdTimestamp),
    );

    if (young.size > 0) {
      rememberBotMessageDeletes(channel.client, channel.guild.id, young.keys());
      await channel.bulkDelete(young, true).catch((error: unknown) => {
        logger.warn(
          { err: error },
          `auto-delete: bulkDelete failed (${channel.id}):`,
        );
      });
      await sleep(PAUSE_MS);
    }

    for (const msg of old.values()) {
      rememberBotMessageDeletes(channel.client, channel.guild.id, [msg.id]);
      await msg.delete().catch(() => undefined);
    }
    if (old.size > 0) await sleep(PAUSE_MS);

    if (fetched.size < 100) break;
  }
}

async function sweepChannelAndThreads(
  channel: Channel,
  filterType: AutoDeleteFilterType,
): Promise<void> {
  if (
    (channel.type === ChannelType.GuildText ||
      channel.type === ChannelType.GuildAnnouncement) &&
    channel.isTextBased() &&
    "bulkDelete" in channel
  ) {
    await sweepTextChannel(channel, filterType);
  }

  if (
    !("threads" in channel) ||
    !channel.threads ||
    typeof channel.threads.fetchActive !== "function"
  ) {
    return;
  }
  const active = await channel.threads.fetchActive().catch(() => null);
  if (!active) return;
  for (const thread of active.threads.values()) {
    if (thread.isTextBased() && "bulkDelete" in thread) {
      await sweepTextChannel(thread, filterType);
      await sleep(PAUSE_MS);
    }
  }
}

async function runScheduledCleanup(
  client: Client,
  guildId: string,
  rule: AutoDeleteRule,
): Promise<void> {
  try {
    const guild =
      client.guilds.cache.get(guildId) ??
      (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) return;

    const channel = await guild.channels
      .fetch(rule.channelId)
      .catch(() => null);
    if (!channel) return;

    const allowed =
      channel.type === ChannelType.GuildText ||
      channel.type === ChannelType.GuildAnnouncement ||
      channel.type === ChannelType.GuildForum ||
      channel.type === ChannelType.GuildMedia;
    if (!allowed) return;

    await sweepChannelAndThreads(channel, rule.filterType);
  } catch (error) {
    logger.warn(
      { err: error },
      `auto-delete: scheduled cleanup failed (${guildId}/${rule.channelId}):`,
    );
  }
}

export function stopAutoDeleteJobsForGuild(guildId: string): void {
  scheduledRules.delete(guildId);
  for (const key of [...lastFired.keys()]) {
    if (key.startsWith(`${guildId}:`)) lastFired.delete(key);
  }
}

export function stopAllAutoDeleteJobs(): void {
  scheduledRules.clear();
  lastFired.clear();
}

/**
 * Reemplaza las reglas SCHEDULED en memoria para el guild. Si el módulo está
 * desactivado, solo limpia. El tick (`processDueScheduledCleanups`) las ejecuta.
 */
export function syncAutoDeleteJobsForConfig(config: AutoDeleteConfig): void {
  stopAutoDeleteJobsForGuild(config.guildId);
  if (!botClient || !config.enabled) return;

  const timezone = normalizeScheduledTimezone(config.timezone);
  const entries = config.rules
    .filter((rule) => rule.mode === "SCHEDULED")
    .map((rule) => ({ guildId: config.guildId, rule, timezone }));

  if (entries.length > 0) {
    scheduledRules.set(config.guildId, entries);
  }
}

/**
 * Tick del scheduler interno: ejecuta las reglas SCHEDULED cuyo `HH:mm` (+ días)
 * coincide con el minuto actual de su zona. De-dup por minuto/regla.
 */
export async function processDueScheduledCleanups(
  client: Client,
  at: Date = new Date(),
): Promise<number> {
  let fired = 0;
  for (const entries of scheduledRules.values()) {
    for (const { guildId, rule, timezone } of entries) {
      const clock = clockPartsInZone(timezone, at);
      if (
        !isDailyScheduleDue(rule.scheduledTime, rule.scheduledDays ?? [], clock)
      ) {
        continue;
      }
      const key = `${guildId}:${rule.channelId}`;
      if (lastFired.get(key) === clock.stamp) continue;
      lastFired.set(key, clock.stamp);
      fired += 1;
      void runScheduledCleanup(client, guildId, rule);
    }
  }
  if (lastFired.size > 5_000) lastFired.clear();
  return fired;
}

/** Rehidrata las reglas SCHEDULED desde Postgres (arranque del bot). */
export async function rehydrateAllAutoDeleteJobs(): Promise<void> {
  stopAllAutoDeleteJobs();
  try {
    const configs = await listAllAutoDeleteConfigs();
    for (const config of configs) {
      syncAutoDeleteJobsForConfig(config);
    }
  } catch (error) {
    logger.warn(
      { err: error },
      "auto-delete: rehydrate scheduled rules failed:",
    );
  }
}
