import type {
  CreateScheduledMessageRequest,
  ScheduledEmbedData,
  ScheduledFrequency,
  ScheduledMessage,
  UpdateScheduledMessageRequest,
} from "@adobos/shared";
import {
  normalizeScheduledEmbedData,
  normalizeScheduledFrequency,
  normalizeScheduledTimezone,
} from "@adobos/shared";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { guildSettings, scheduledMessages } from "../../db/schema.js";

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

/** Callback tras crear/editar/toggle/eliminar para sincronizar cron. */
let onMessageChanged:
  | ((message: ScheduledMessage | null, previousId?: number) => void)
  | null = null;

export function setScheduledMessageChangeListener(
  listener:
    | ((message: ScheduledMessage | null, previousId?: number) => void)
    | null,
): void {
  onMessageChanged = listener;
}

function notifyChanged(
  message: ScheduledMessage | null,
  previousId?: number,
): void {
  if (!onMessageChanged) return;
  try {
    onMessageChanged(message, previousId);
  } catch (error) {
    console.warn("[adobos] scheduled-messages: onMessageChanged falló:", error);
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
  const id = (guildId ?? process.env.DISCORD_GUILD_ID ?? "").trim();
  if (!id) {
    throw new ScheduledMessagesError(
      "Falta DISCORD_GUILD_ID (o guildId).",
      400,
      "MISSING_GUILD_ID",
    );
  }
  return id;
}

function ensureGuildRow(guildId: string): void {
  const existing = getDb()
    .select({ guildId: guildSettings.guildId })
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId))
    .get();
  if (!existing) {
    getDb()
      .insert(guildSettings)
      .values({
        guildId,
        prefix: "!",
        welcomeEnabled: false,
        updatedAt: new Date(),
      })
      .run();
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
  return "Mensaje programado";
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
    isActive: Boolean(row.isActive),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export function listScheduledMessages(guildId?: string): ScheduledMessage[] {
  const id = resolveGuildId(guildId);
  ensureGuildRow(id);
  const rows = getDb()
    .select()
    .from(scheduledMessages)
    .where(eq(scheduledMessages.guildId, id))
    .orderBy(desc(scheduledMessages.updatedAt))
    .all();
  return rows.map(rowToMessage);
}

/** Todos los mensajes activos (rehydrate al arranque). */
export function listAllActiveScheduledMessages(): ScheduledMessage[] {
  const rows = getDb()
    .select()
    .from(scheduledMessages)
    .where(eq(scheduledMessages.isActive, true))
    .all();
  return rows.map(rowToMessage);
}

export function getScheduledMessage(
  messageId: number,
  guildId?: string,
): ScheduledMessage {
  const id = resolveGuildId(guildId);
  const row = getDb()
    .select()
    .from(scheduledMessages)
    .where(
      and(
        eq(scheduledMessages.id, messageId),
        eq(scheduledMessages.guildId, id),
      ),
    )
    .get();
  if (!row) {
    throw new ScheduledMessagesError(
      "Mensaje programado no encontrado.",
      404,
      "NOT_FOUND",
    );
  }
  return rowToMessage(row);
}

export function createScheduledMessage(
  input: CreateScheduledMessageRequest,
  guildId?: string,
): ScheduledMessage {
  const id = resolveGuildId(guildId);
  ensureGuildRow(id);

  const channelId = normalizeSnowflake(input.channelId);
  const timezone = normalizeScheduledTimezone(input.timezone);
  const frequency = normalizeScheduledFrequency(input.frequency);
  const embedData = normalizeScheduledEmbedData(input.embedData);
  const isActive = input.isActive !== false;
  const now = new Date();

  const result = getDb()
    .insert(scheduledMessages)
    .values({
      guildId: id,
      channelId,
      timezone,
      frequency: JSON.stringify(frequency),
      embedData: JSON.stringify(embedData),
      isActive,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const insertedId = Number(result.lastInsertRowid);
  const message = getScheduledMessage(insertedId, id);
  notifyChanged(message);
  return message;
}

export function updateScheduledMessage(
  messageId: number,
  input: UpdateScheduledMessageRequest,
  guildId?: string,
): ScheduledMessage {
  const id = resolveGuildId(guildId);
  const current = getScheduledMessage(messageId, id);

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
  const nextActive =
    input.isActive !== undefined ? Boolean(input.isActive) : current.isActive;

  getDb()
    .update(scheduledMessages)
    .set({
      channelId: nextChannelId,
      timezone: nextTimezone,
      frequency: JSON.stringify(nextFrequency),
      embedData: JSON.stringify(nextEmbed),
      isActive: nextActive,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(scheduledMessages.id, messageId),
        eq(scheduledMessages.guildId, id),
      ),
    )
    .run();

  const message = getScheduledMessage(messageId, id);
  notifyChanged(message);
  return message;
}

export function setScheduledMessageActive(
  messageId: number,
  isActive: boolean,
  guildId?: string,
): ScheduledMessage {
  return updateScheduledMessage(messageId, { isActive }, guildId);
}

export function deleteScheduledMessage(
  messageId: number,
  guildId?: string,
): void {
  const id = resolveGuildId(guildId);
  const existing = getScheduledMessage(messageId, id);
  getDb()
    .delete(scheduledMessages)
    .where(
      and(
        eq(scheduledMessages.id, messageId),
        eq(scheduledMessages.guildId, id),
      ),
    )
    .run();
  notifyChanged(null, existing.id);
}
