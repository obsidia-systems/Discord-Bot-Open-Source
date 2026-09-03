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
import cron, { type ScheduledTask } from "node-cron";
import { logger } from "#core/log.js";
import { timeAndDaysToCron } from "#lib/schedulerTimezone.js";
import { rememberBotMessageDeletes } from "#modules/action-logs/audit.js";
import { listAllAutoDeleteConfigs } from "./service.js";

const MAX_PAGES = 25;
const PAUSE_MS = 350;

/** Tasks por guildId → lista de jobs activos. */
const guildJobs = new Map<string, ScheduledTask[]>();

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

/** Convierte hora + días a cron `m h * * dow`. */
export function scheduledTimeToCron(
  time: string,
  days: number[] = [],
): string | null {
  return timeAndDaysToCron(time, days);
}

export function stopAutoDeleteJobsForGuild(guildId: string): void {
  const jobs = guildJobs.get(guildId);
  if (!jobs) return;
  for (const job of jobs) {
    try {
      job.stop();
    } catch {
      /* ignore */
    }
  }
  guildJobs.delete(guildId);
}

export function stopAllAutoDeleteJobs(): void {
  for (const guildId of [...guildJobs.keys()]) {
    stopAutoDeleteJobsForGuild(guildId);
  }
}

/**
 * Destruye jobs previos del guild y registra crons de reglas SCHEDULED.
 * Si el módulo está desactivado, solo limpia.
 */
export async function syncAutoDeleteJobsForConfig(
  config: AutoDeleteConfig,
): Promise<void> {
  const client = botClient;
  stopAutoDeleteJobsForGuild(config.guildId);
  if (!client || !config.enabled) return;

  const timezone = normalizeScheduledTimezone(config.timezone);

  const jobs: ScheduledTask[] = [];
  for (const rule of config.rules) {
    if (rule.mode !== "SCHEDULED") continue;
    const expression = scheduledTimeToCron(
      rule.scheduledTime,
      rule.scheduledDays ?? [],
    );
    if (!expression || !cron.validate(expression)) continue;

    const task = cron.schedule(
      expression,
      () => {
        void runScheduledCleanup(client, config.guildId, rule);
      },
      { timezone },
    );
    jobs.push(task);
  }

  if (jobs.length > 0) {
    guildJobs.set(config.guildId, jobs);
  }
}

/** Rehidrata todos los crons desde Postgres (arranque del bot). */
export async function rehydrateAllAutoDeleteJobs(): Promise<void> {
  stopAllAutoDeleteJobs();
  try {
    const configs = await listAllAutoDeleteConfigs();
    for (const config of configs) {
      await syncAutoDeleteJobsForConfig(config);
    }
  } catch (error) {
    logger.warn({ err: error }, "auto-delete: rehydrate cron failed:");
  }
}
