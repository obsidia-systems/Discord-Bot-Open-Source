import { and, eq, lte, notInArray } from "drizzle-orm";
import { DiscordAPIError, type Client } from "discord.js";
import { getDb } from "../../db/client.js";
import { autoDeletePending } from "../../db/schema.js";
import type { AutoDeleteConfig } from "@adobos/shared";
import { logger } from "../../core/log.js";
import { rememberBotMessageDeletes } from "../action-logs/audit.js";

const DUE_BATCH = 50;

export async function enqueueCountdownDelete(input: {
  guildId: string;
  channelId: string;
  messageId: string;
  ruleChannelId: string;
  deleteAt: Date;
}): Promise<void> {
  await getDb()
    .insert(autoDeletePending)
    .values({
      guildId: input.guildId,
      channelId: input.channelId,
      messageId: input.messageId,
      ruleChannelId: input.ruleChannelId,
      deleteAt: input.deleteAt,
    })
    .onConflictDoNothing();
}

export async function prunePendingForConfig(
  config: AutoDeleteConfig,
): Promise<void> {
  const db = getDb();
  if (!config.enabled) {
    await db
      .delete(autoDeletePending)
      .where(eq(autoDeletePending.guildId, config.guildId));
    return;
  }
  const keep = config.rules
    .filter((rule) => rule.mode === "COUNTDOWN")
    .map((rule) => rule.channelId);
  if (keep.length === 0) {
    await db
      .delete(autoDeletePending)
      .where(eq(autoDeletePending.guildId, config.guildId));
    return;
  }
  await db
    .delete(autoDeletePending)
    .where(
      and(
        eq(autoDeletePending.guildId, config.guildId),
        notInArray(autoDeletePending.ruleChannelId, keep),
      ),
    );
}

function shouldDropPending(error: unknown): boolean {
  if (error instanceof DiscordAPIError) {
    const code = Number(error.code);
    // Unknown Message / Missing Access / Missing Permissions
    return code === 10008 || code === 50001 || code === 50013;
  }
  return false;
}

export async function processDueCountdownDeletes(
  client: Client,
): Promise<number> {
  const due = await getDb()
    .select()
    .from(autoDeletePending)
    .where(lte(autoDeletePending.deleteAt, new Date()))
    .limit(DUE_BATCH);

  let processed = 0;
  for (const row of due) {
    processed += 1;
    try {
      const guild =
        client.guilds.cache.get(row.guildId) ??
        (await client.guilds.fetch(row.guildId).catch(() => null));
      if (!guild) {
        await removePending(row.guildId, row.messageId);
        continue;
      }
      const channel = await guild.channels
        .fetch(row.channelId)
        .catch(() => null);
      if (!channel || !channel.isTextBased() || !("messages" in channel)) {
        await removePending(row.guildId, row.messageId);
        continue;
      }
      const message =
        channel.messages.cache.get(row.messageId) ??
        (await channel.messages.fetch(row.messageId).catch(() => null));
      if (!message) {
        await removePending(row.guildId, row.messageId);
        continue;
      }
      if (message.pinned) {
        await removePending(row.guildId, row.messageId);
        continue;
      }
      rememberBotMessageDeletes(client, row.guildId, [row.messageId]);
      await message.delete();
      await removePending(row.guildId, row.messageId);
    } catch (error) {
      if (shouldDropPending(error)) {
        await removePending(row.guildId, row.messageId).catch(() => undefined);
        continue;
      }
      logger.warn(
        { err: error },
        `auto-delete: tick falló (${row.guildId}/${row.messageId}):`,
      );
    }
  }
  return processed;
}

async function removePending(guildId: string, messageId: string): Promise<void> {
  await getDb()
    .delete(autoDeletePending)
    .where(
      and(
        eq(autoDeletePending.guildId, guildId),
        eq(autoDeletePending.messageId, messageId),
      ),
    );
}
