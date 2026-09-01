import type {
  CreateScheduledMessageRequest,
  ScheduledEmbedData,
  ScheduledFrequency,
  ScheduledMessage,
  UpdateScheduledMessageRequest,
} from "@adobos/shared";
import {
  computeNextRunAt,
  isScheduledOneShot,
  normalizeScheduledContent,
  normalizeScheduledEmbedData,
  normalizeScheduledFrequency,
  normalizeScheduledPingRoleId,
  normalizeScheduledTimezone,
} from "@adobos/shared";
import { and, asc, count, desc, eq, isNotNull, lte } from "drizzle-orm";
import { getDb, one } from "../../db/client.js";
import { guildSettings, scheduledMessages } from "../../db/schema.js";
import { assertWithinLimit } from "../../core/entitlements/service.js";

export class ScheduledMessagesError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ScheduledMessagesError";
  }
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new ScheduledMessagesError(
      "Falta guildId.",
      400,
      "MISSING_GUILD_ID",
    );
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

function normalizeSnowflake(value: unknown): string {
  const id = String(value ?? "").trim();
  if (!/^\d{17,20}$/.test(id)) {
    throw new ScheduledMessagesError(
      "Canal de destino inválido.",
      400,
      "INVALID_CHANNEL",
    );
  }
  return id;
}

function deriveLabel(embed: ScheduledEmbedData): string {
  const title = embed.title.trim();
  if (title) return title.slice(0, 80);
  const desc = embed.description.trim();
  if (desc) return desc.slice(0, 80);
  return "Scheduled Message";
}

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function rowToMessage(
  row: typeof scheduledMessages.$inferSelect,
): ScheduledMessage {
  const frequency = normalizeScheduledFrequency(
    parseJson<Partial<ScheduledFrequency>>(row.frequency, {}),
  );
  const embedData = normalizeScheduledEmbedData(
    parseJson<Partial<ScheduledEmbedData>>(row.embedData, {}),
  );
  return {
    id: row.id,
    guildId: row.guildId,
    channelId: row.channelId,
    label: deriveLabel(embedData),
    timezone: normalizeScheduledTimezone(row.timezone),
    frequency,
    embedData,
    content: normalizeScheduledContent(row.content),
    pingRoleId: row.pingRoleId ?? null,
    isActive: Boolean(row.isActive),
    nextRunAt: toIso(row.nextRunAt),
    lastSentAt: toIso(row.lastSentAt),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function lastSentDate(message: {
  lastSentAt: string | null;
}): Date | null {
  return message.lastSentAt ? new Date(message.lastSentAt) : null;
}

function resolveSchedule(
  isActive: boolean,
  frequency: ScheduledFrequency,
  timezone: string,
  lastSentAt: Date | null,
  from = new Date(),
): { isActive: boolean; nextRunAt: Date | null } {
  if (!isActive) return { isActive: false, nextRunAt: null };
  const nextRunAt = computeNextRunAt(frequency, timezone, from, lastSentAt);
  if (!nextRunAt) {
    return { isActive: false, nextRunAt: null };
  }
  return { isActive: true, nextRunAt };
}

export async function listScheduledMessages(
  guildId?: string,
): Promise<ScheduledMessage[]> {
  const id = resolveGuildId(guildId);
  await ensureGuildRow(id);
  const rows = await getDb()
    .select()
    .from(scheduledMessages)
    .where(eq(scheduledMessages.guildId, id))
    .orderBy(desc(scheduledMessages.updatedAt));
  return rows.map(rowToMessage);
}

/** Activos (backfill de next_run_at al arranque). */
export async function listAllActiveScheduledMessages(): Promise<
  ScheduledMessage[]
> {
  const rows = await getDb()
    .select()
    .from(scheduledMessages)
    .where(eq(scheduledMessages.isActive, true));
  return rows.map(rowToMessage);
}

export async function listDueScheduledMessages(
  limit = 25,
): Promise<ScheduledMessage[]> {
  const rows = await getDb()
    .select()
    .from(scheduledMessages)
    .where(
      and(
        eq(scheduledMessages.isActive, true),
        isNotNull(scheduledMessages.nextRunAt),
        lte(scheduledMessages.nextRunAt, new Date()),
      ),
    )
    .orderBy(asc(scheduledMessages.nextRunAt))
    .limit(limit);
  return rows.map(rowToMessage);
}

export async function getScheduledMessage(
  messageId: number,
  guildId?: string,
): Promise<ScheduledMessage> {
  const id = resolveGuildId(guildId);
  const row = await one(
    getDb()
      .select()
      .from(scheduledMessages)
      .where(
        and(
          eq(scheduledMessages.id, messageId),
          eq(scheduledMessages.guildId, id),
        ),
      )
      .limit(1),
  );
  if (!row) {
    throw new ScheduledMessagesError(
      "Mensaje programado no encontrado.",
      404,
      "NOT_FOUND",
    );
  }
  return rowToMessage(row);
}

export async function createScheduledMessage(
  input: CreateScheduledMessageRequest,
  guildId?: string,
): Promise<ScheduledMessage> {
  const id = resolveGuildId(guildId);
  await ensureGuildRow(id);

  const [usage] = await getDb()
    .select({ n: count() })
    .from(scheduledMessages)
    .where(eq(scheduledMessages.guildId, id));
  await assertWithinLimit(id, "scheduledMessages", usage?.n ?? 0);

  const channelId = normalizeSnowflake(input.channelId);
  const timezone = normalizeScheduledTimezone(input.timezone);
  const frequency = normalizeScheduledFrequency(input.frequency);
  const embedData = normalizeScheduledEmbedData(input.embedData);
  const content = normalizeScheduledContent(input.content);
  const pingRoleId = normalizeScheduledPingRoleId(input.pingRoleId);
  const now = new Date();
  const schedule = resolveSchedule(
    input.isActive !== false,
    frequency,
    timezone,
    null,
    now,
  );

  const [inserted] = await getDb()
    .insert(scheduledMessages)
    .values({
      guildId: id,
      channelId,
      timezone,
      frequency: JSON.stringify(frequency),
      embedData: JSON.stringify(embedData),
      content,
      pingRoleId,
      isActive: schedule.isActive,
      nextRunAt: schedule.nextRunAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: scheduledMessages.id });
  if (!inserted) {
    throw new ScheduledMessagesError(
      "No se pudo crear el mensaje programado.",
      500,
      "INSERT_FAILED",
    );
  }

  return await getScheduledMessage(inserted.id, id);
}

export async function updateScheduledMessage(
  messageId: number,
  input: UpdateScheduledMessageRequest,
  guildId?: string,
): Promise<ScheduledMessage> {
  const id = resolveGuildId(guildId);
  const current = await getScheduledMessage(messageId, id);

  const nextChannelId =
    input.channelId !== undefined
      ? normalizeSnowflake(input.channelId)
      : current.channelId;
  const nextTimezone =
    input.timezone !== undefined
      ? normalizeScheduledTimezone(input.timezone)
      : current.timezone;
  const nextFrequency =
    input.frequency !== undefined
      ? normalizeScheduledFrequency(input.frequency)
      : current.frequency;
  const nextEmbed =
    input.embedData !== undefined
      ? normalizeScheduledEmbedData(input.embedData)
      : current.embedData;
  const nextContent =
    input.content !== undefined
      ? normalizeScheduledContent(input.content)
      : current.content;
  const nextPing =
    input.pingRoleId !== undefined
      ? normalizeScheduledPingRoleId(input.pingRoleId)
      : current.pingRoleId;
  const wantActive =
    input.isActive !== undefined ? Boolean(input.isActive) : current.isActive;
  const schedule = resolveSchedule(
    wantActive,
    nextFrequency,
    nextTimezone,
    lastSentDate(current),
  );

  await getDb()
    .update(scheduledMessages)
    .set({
      channelId: nextChannelId,
      timezone: nextTimezone,
      frequency: JSON.stringify(nextFrequency),
      embedData: JSON.stringify(nextEmbed),
      content: nextContent,
      pingRoleId: nextPing,
      isActive: schedule.isActive,
      nextRunAt: schedule.nextRunAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(scheduledMessages.id, messageId),
        eq(scheduledMessages.guildId, id),
      ),
    );

  return await getScheduledMessage(messageId, id);
}

export async function setScheduledMessageActive(
  messageId: number,
  isActive: boolean,
  guildId?: string,
): Promise<ScheduledMessage> {
  return await updateScheduledMessage(messageId, { isActive }, guildId);
}

export async function applyScheduledMessageTick(
  messageId: number,
  guildId: string,
  patch: {
    isActive?: boolean;
    nextRunAt?: Date | null;
    lastSentAt?: Date | null;
  },
): Promise<void> {
  const id = resolveGuildId(guildId);
  const set: {
    isActive?: boolean;
    nextRunAt?: Date | null;
    lastSentAt?: Date | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  if (patch.nextRunAt !== undefined) set.nextRunAt = patch.nextRunAt;
  if (patch.lastSentAt !== undefined) set.lastSentAt = patch.lastSentAt;

  await getDb()
    .update(scheduledMessages)
    .set(set)
    .where(
      and(
        eq(scheduledMessages.id, messageId),
        eq(scheduledMessages.guildId, id),
      ),
    );
}

export async function backfillScheduledNextRuns(): Promise<void> {
  const active = await listAllActiveScheduledMessages();
  const now = new Date();
  for (const message of active) {
    if (message.nextRunAt) continue;
    const next = computeNextRunAt(
      message.frequency,
      message.timezone,
      now,
      lastSentDate(message),
    );
    if (!next) {
      await applyScheduledMessageTick(message.id, message.guildId, {
        isActive: false,
        nextRunAt: null,
      });
      continue;
    }
    await applyScheduledMessageTick(message.id, message.guildId, {
      nextRunAt: next,
    });
  }
}

export function nextRunAfterSend(
  message: ScheduledMessage,
  sentAt: Date,
): { isActive: boolean; nextRunAt: Date | null } {
  if (isScheduledOneShot(message.frequency)) {
    return { isActive: false, nextRunAt: null };
  }
  const nextRunAt = computeNextRunAt(
    message.frequency,
    message.timezone,
    sentAt,
    sentAt,
  );
  if (!nextRunAt) return { isActive: false, nextRunAt: null };
  return { isActive: true, nextRunAt };
}

export async function deleteScheduledMessage(
  messageId: number,
  guildId?: string,
): Promise<void> {
  const id = resolveGuildId(guildId);
  await getScheduledMessage(messageId, id);
  await getDb()
    .delete(scheduledMessages)
    .where(
      and(
        eq(scheduledMessages.id, messageId),
        eq(scheduledMessages.guildId, id),
      ),
    );
}
