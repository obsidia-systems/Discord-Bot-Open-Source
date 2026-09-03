import type {
  AutoRepliesConfigResponse,
  AutoReply,
  CreateAutoReplyRequest,
  UpdateAutoReplyRequest,
} from "@adobos/shared";
import {
  clampAutoReplyCooldown,
  clampAutoReplyResponse,
  isAutoReplyMatchMode,
  normalizeAutoReplyChannelIds,
  normalizeAutoReplyTrigger,
} from "@adobos/shared";
import { and, count, eq } from "drizzle-orm";
import { BoundedTtlMap } from "../../core/cache/boundedTtlMap.js";
import { assertWithinLimit } from "../../core/entitlements/service.js";
import { getDb, one } from "../../db/client.js";
import {
  type AutoReplyRow,
  autoReplies,
  guildSettings,
} from "../../db/schema.js";

export class AutoRepliesError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "AutoRepliesError";
  }
}

const listCache = new BoundedTtlMap<string, AutoReply[]>(2_000, 60_000);

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new AutoRepliesError("Missing guildId.", 400, "MISSING_GUILD_ID");
  }
  return id;
}

async function ensureGuildRow(guildId: string): Promise<void> {
  const existing = await one(
    getDb()
      .select({ guildId: guildSettings.guildId })
      .from(guildSettings)
      .where(eq(guildSettings.guildId, guildId))
      .limit(1),
  );
  if (!existing) {
    await getDb().insert(guildSettings).values({
      guildId,
      prefix: "!",
      welcomeEnabled: false,
      updatedAt: new Date(),
    });
  }
}

function parseJsonList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    return normalizeAutoReplyChannelIds(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function mapReply(row: AutoReplyRow): AutoReply {
  return {
    id: row.id,
    guildId: row.guildId,
    trigger: row.trigger,
    matchMode: isAutoReplyMatchMode(row.matchMode) ? row.matchMode : "contains",
    response: row.response,
    enabled: row.enabled,
    caseSensitive: row.caseSensitive,
    wholeWord: row.wholeWord,
    useReply: row.useReply,
    cooldownSeconds: row.cooldownSeconds,
    allowedChannelIds: parseJsonList(row.allowedChannelIds),
    ignoredChannelIds: parseJsonList(row.ignoredChannelIds),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function invalidate(guildId: string): void {
  listCache.delete(guildId);
}

export async function listAutoRepliesCached(
  guildId: string,
): Promise<AutoReply[]> {
  const hit = listCache.get(guildId);
  if (hit) return hit;
  const rows = await getDb()
    .select()
    .from(autoReplies)
    .where(eq(autoReplies.guildId, guildId));
  const list = rows.map(mapReply);
  listCache.set(guildId, list);
  return list;
}

export async function listAutoRepliesConfig(
  guildId?: string,
): Promise<AutoRepliesConfigResponse> {
  const id = resolveGuildId(guildId);
  const replies = await listAutoRepliesCached(id);
  return { replies };
}

async function getReply(alertId: number, guildId: string): Promise<AutoReply> {
  const row = await one(
    getDb()
      .select()
      .from(autoReplies)
      .where(and(eq(autoReplies.id, alertId), eq(autoReplies.guildId, guildId)))
      .limit(1),
  );
  if (!row) {
    throw new AutoRepliesError("Auto-Reply not found.", 404, "NOT_FOUND");
  }
  return mapReply(row);
}

async function assertUniqueTrigger(
  guildId: string,
  trigger: string,
  exceptId?: number,
): Promise<void> {
  const existing = await listAutoRepliesCached(guildId);
  const needle = trigger.toLowerCase();
  const clash = existing.find(
    (row) => row.id !== exceptId && row.trigger.toLowerCase() === needle,
  );
  if (clash) {
    throw new AutoRepliesError(
      "There is already an Auto-Reply with that trigger.",
      409,
      "DUPLICATE_TRIGGER",
    );
  }
}

export async function createAutoReply(
  input: CreateAutoReplyRequest,
  guildId?: string,
): Promise<AutoReply> {
  const id = resolveGuildId(guildId);
  await ensureGuildRow(id);

  const trigger = normalizeAutoReplyTrigger(input.trigger);
  if (!trigger) {
    throw new AutoRepliesError(
      "Enter a trigger of 1 to 200 characters.",
      400,
      "INVALID_TRIGGER",
    );
  }
  const response = clampAutoReplyResponse(input.response);
  if (!response) {
    throw new AutoRepliesError(
      "Enter a response of 1 to 2000 characters.",
      400,
      "INVALID_RESPONSE",
    );
  }
  const matchMode = isAutoReplyMatchMode(input.matchMode)
    ? input.matchMode
    : "contains";

  const [usage] = await getDb()
    .select({ n: count() })
    .from(autoReplies)
    .where(eq(autoReplies.guildId, id));
  await assertWithinLimit(id, "autoReplies", usage?.n ?? 0);
  await assertUniqueTrigger(id, trigger);

  const now = new Date();
  const [inserted] = await getDb()
    .insert(autoReplies)
    .values({
      guildId: id,
      trigger,
      matchMode,
      response,
      enabled: input.enabled !== false,
      caseSensitive: input.caseSensitive === true,
      wholeWord: input.wholeWord === true,
      useReply: input.useReply !== false,
      cooldownSeconds: clampAutoReplyCooldown(input.cooldownSeconds),
      allowedChannelIds: JSON.stringify(
        normalizeAutoReplyChannelIds(input.allowedChannelIds),
      ),
      ignoredChannelIds: JSON.stringify(
        normalizeAutoReplyChannelIds(input.ignoredChannelIds),
      ),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!inserted) {
    throw new AutoRepliesError(
      "Couldn't create the Auto-Reply.",
      500,
      "INSERT_FAILED",
    );
  }
  invalidate(id);
  return mapReply(inserted);
}

export async function updateAutoReply(
  replyId: number,
  input: UpdateAutoReplyRequest,
  guildId?: string,
): Promise<AutoReply> {
  const id = resolveGuildId(guildId);
  const current = await getReply(replyId, id);

  const trigger =
    input.trigger !== undefined
      ? normalizeAutoReplyTrigger(input.trigger)
      : current.trigger;
  if (!trigger) {
    throw new AutoRepliesError(
      "Enter a trigger of 1 to 200 characters.",
      400,
      "INVALID_TRIGGER",
    );
  }
  const response =
    input.response !== undefined
      ? clampAutoReplyResponse(input.response)
      : current.response;
  if (!response) {
    throw new AutoRepliesError(
      "Enter a response of 1 to 2000 characters.",
      400,
      "INVALID_RESPONSE",
    );
  }
  const matchMode =
    input.matchMode !== undefined
      ? isAutoReplyMatchMode(input.matchMode)
        ? input.matchMode
        : current.matchMode
      : current.matchMode;

  if (trigger.toLowerCase() !== current.trigger.toLowerCase()) {
    await assertUniqueTrigger(id, trigger, replyId);
  }

  const [updated] = await getDb()
    .update(autoReplies)
    .set({
      trigger,
      matchMode,
      response,
      enabled: input.enabled ?? current.enabled,
      caseSensitive: input.caseSensitive ?? current.caseSensitive,
      wholeWord: input.wholeWord ?? current.wholeWord,
      useReply: input.useReply ?? current.useReply,
      cooldownSeconds:
        input.cooldownSeconds !== undefined
          ? clampAutoReplyCooldown(input.cooldownSeconds)
          : current.cooldownSeconds,
      allowedChannelIds: JSON.stringify(
        input.allowedChannelIds !== undefined
          ? normalizeAutoReplyChannelIds(input.allowedChannelIds)
          : current.allowedChannelIds,
      ),
      ignoredChannelIds: JSON.stringify(
        input.ignoredChannelIds !== undefined
          ? normalizeAutoReplyChannelIds(input.ignoredChannelIds)
          : current.ignoredChannelIds,
      ),
      updatedAt: new Date(),
    })
    .where(and(eq(autoReplies.id, replyId), eq(autoReplies.guildId, id)))
    .returning();
  if (!updated) {
    throw new AutoRepliesError("Auto-Reply not found.", 404, "NOT_FOUND");
  }
  invalidate(id);
  return mapReply(updated);
}

export async function deleteAutoReply(
  replyId: number,
  guildId?: string,
): Promise<void> {
  const id = resolveGuildId(guildId);
  const deleted = await getDb()
    .delete(autoReplies)
    .where(and(eq(autoReplies.id, replyId), eq(autoReplies.guildId, id)))
    .returning({ id: autoReplies.id });
  if (deleted.length === 0) {
    throw new AutoRepliesError("Auto-Reply not found.", 404, "NOT_FOUND");
  }
  invalidate(id);
}
