import cron, { type ScheduledTask } from "node-cron";
import {
  ChannelType,
  type Client,
  type GuildTextBasedChannel,
  type Message,
} from "discord.js";
import type { AutoDeleteConfig, AutoDeleteRule } from "@adobos/shared";
import {
  resolveSchedulerTimezone,
  timeAndDaysToCron,
} from "../../lib/schedulerTimezone.js";
import { listAllAutoDeleteConfigs } from "./service.js";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/** Tasks por guildId → lista de jobs activos. */
const guildJobs = new Map<string, ScheduledTask[]>();

let botClient: Client | null = null;

export function bindAutoDeleteScheduler(client: Client): void {
  botClient = client;
}

function messageMatchesFilter(
  message: Message,
  filterType: AutoDeleteRule["filterType"],
): boolean {
  if (message.pinned) return false;
  if (filterType === "bots_only" && !message.author.bot) return false;
  if (filterType === "no_attachments" && message.attachments.size > 0) {
    return false;
  }
  if (Date.now() - message.createdTimestamp > FOURTEEN_DAYS_MS) return false;
  return true;
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

    const channel = await guild.channels.fetch(rule.channelId).catch(() => null);
    if (
      !channel ||
      (channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement)
    ) {
      return;
    }

    const textChannel = channel as GuildTextBasedChannel;
    if (!("bulkDelete" in textChannel)) return;

    const fetched = await textChannel.messages
      .fetch({ limit: 100 })
      .catch(() => null);
    if (!fetched || fetched.size === 0) return;

    const toDelete = fetched.filter((msg) =>
      messageMatchesFilter(msg, rule.filterType),
    );
    if (toDelete.size === 0) return;

    await textChannel.bulkDelete(toDelete, true).catch((error: unknown) => {
      console.warn(
        `[adobos] auto-delete: bulkDelete falló (${rule.channelId}):`,
        error,
      );
    });
  } catch (error) {
    console.warn(
      `[adobos] auto-delete: limpieza programada falló (${guildId}/${rule.channelId}):`,
      error,
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
export async function syncAutoDeleteJobsForConfig(config: AutoDeleteConfig): Promise<void> {
  const client = botClient;
  stopAutoDeleteJobsForGuild(config.guildId);
  if (!client || !config.enabled) return;

  const timezone = resolveSchedulerTimezone();

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

/** Rehidrata todos los crons desde SQLite (arranque del bot). */
export async function rehydrateAllAutoDeleteJobs(): Promise<void> {
  stopAllAutoDeleteJobs();
  try {
    const configs = await listAllAutoDeleteConfigs();
    for (const config of configs) {
      await syncAutoDeleteJobsForConfig(config);
    }
  } catch (error) {
    console.warn("[adobos] auto-delete: rehydrate cron falló:", error);
  }
}
