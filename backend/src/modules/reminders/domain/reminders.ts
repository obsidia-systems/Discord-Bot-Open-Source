import type {
  Reminder,
  ReminderSettings,
  RemindersConfigResponse,
  UpdateReminderSettingsRequest,
} from "@adobos/shared";
import {
  normalizeScheduledTimezone,
  REMIND_MAX_ATTEMPTS,
  REMIND_PER_GUILD_MAX,
  REMIND_PER_USER_MAX,
  REMIND_TEXT_MAX,
  sanitizeRemindText,
} from "@adobos/shared";
import { and, count, eq, sql } from "drizzle-orm";
import { getDb, one } from "#db/client.js";
import {
  guildSettings,
  type ReminderRow,
  type ReminderSettingsRow,
  reminderSettings,
  reminders,
} from "#db/schema.js";

export class RemindersError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "RemindersError";
  }
}

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new RemindersError("Missing guildId.", 400, "MISSING_GUILD_ID");
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

function mapSettings(
  guildId: string,
  row: ReminderSettingsRow | undefined,
): ReminderSettings {
  return {
    guildId,
    timezone: normalizeScheduledTimezone(row?.timezone),
    enabled: row?.enabled !== false,
    updatedAt: (row?.updatedAt ?? new Date()).toISOString(),
  };
}

function mapReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    guildId: row.guildId,
    userId: row.userId,
    channelId: row.channelId,
    message: row.message,
    dueAt: row.dueAt.toISOString(),
    attempts: row.attempts,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getReminderSettings(
  guildId?: string,
): Promise<ReminderSettings> {
  const id = resolveGuildId(guildId);
  const row = await one(
    getDb()
      .select()
      .from(reminderSettings)
      .where(eq(reminderSettings.guildId, id))
      .limit(1),
  );
  return mapSettings(id, row);
}

export async function listRemindersConfig(
  guildId?: string,
): Promise<RemindersConfigResponse> {
  const id = resolveGuildId(guildId);
  const settings = await getReminderSettings(id);
  const rows = await getDb()
    .select()
    .from(reminders)
    .where(eq(reminders.guildId, id))
    .orderBy(reminders.dueAt);
  return { settings, reminders: rows.map(mapReminder) };
}

export async function updateReminderSettings(
  input: UpdateReminderSettingsRequest,
  guildId?: string,
): Promise<ReminderSettings> {
  const id = resolveGuildId(guildId);
  await ensureGuildRow(id);
  const current = await getReminderSettings(id);
  const timezone = normalizeScheduledTimezone(
    input.timezone ?? current.timezone,
  );
  const enabled = input.enabled ?? current.enabled;
  const [row] = await getDb()
    .insert(reminderSettings)
    .values({
      guildId: id,
      timezone,
      enabled,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: reminderSettings.guildId,
      set: { timezone, enabled, updatedAt: new Date() },
    })
    .returning();
  return mapSettings(id, row);
}

export async function listUserReminders(
  guildId: string,
  userId: string,
): Promise<Reminder[]> {
  const rows = await getDb()
    .select()
    .from(reminders)
    .where(and(eq(reminders.guildId, guildId), eq(reminders.userId, userId)))
    .orderBy(reminders.dueAt);
  return rows.map(mapReminder);
}

export async function getReminder(
  reminderId: number,
  guildId: string,
): Promise<Reminder> {
  const row = await one(
    getDb()
      .select()
      .from(reminders)
      .where(and(eq(reminders.id, reminderId), eq(reminders.guildId, guildId)))
      .limit(1),
  );
  if (!row) {
    throw new RemindersError("Reminder not found.", 404, "NOT_FOUND");
  }
  return mapReminder(row);
}

export async function createReminder(input: {
  guildId: string;
  userId: string;
  channelId: string;
  message: string;
  dueAt: Date;
}): Promise<Reminder> {
  const id = resolveGuildId(input.guildId);
  await ensureGuildRow(id);
  const settings = await getReminderSettings(id);
  if (!settings.enabled) {
    throw new RemindersError(
      "Reminders is turned off in this server.",
      403,
      "DISABLED",
    );
  }
  const message = sanitizeRemindText(input.message);
  if (!message) {
    throw new RemindersError(
      "Write what to remind you about.",
      400,
      "EMPTY_TEXT",
    );
  }
  if (message.length > REMIND_TEXT_MAX) {
    throw new RemindersError(
      "El texto es demasiado largo.",
      400,
      "TEXT_TOO_LONG",
    );
  }
  const [userCount] = await getDb()
    .select({ n: count() })
    .from(reminders)
    .where(and(eq(reminders.guildId, id), eq(reminders.userId, input.userId)));
  if ((userCount?.n ?? 0) >= REMIND_PER_USER_MAX) {
    throw new RemindersError(
      `At most ${REMIND_PER_USER_MAX} pending reminders.`,
      400,
      "USER_LIMIT",
    );
  }
  const [guildCount] = await getDb()
    .select({ n: count() })
    .from(reminders)
    .where(eq(reminders.guildId, id));
  if ((guildCount?.n ?? 0) >= REMIND_PER_GUILD_MAX) {
    throw new RemindersError(
      `At most ${REMIND_PER_GUILD_MAX} reminders in the server.`,
      400,
      "GUILD_LIMIT",
    );
  }
  const [row] = await getDb()
    .insert(reminders)
    .values({
      guildId: id,
      userId: input.userId,
      channelId: input.channelId,
      message,
      dueAt: input.dueAt,
    })
    .returning();
  if (!row) {
    throw new RemindersError(
      "Couldn't create the reminder.",
      500,
      "INSERT_FAILED",
    );
  }
  return mapReminder(row);
}

export async function deleteReminder(
  reminderId: number,
  guildId: string,
  actorId?: string,
  staff = false,
): Promise<void> {
  const current = await getReminder(reminderId, guildId);
  if (actorId && current.userId !== actorId && !staff) {
    throw new RemindersError("You can only cancel your own.", 403, "NOT_OWNER");
  }
  await getDb()
    .delete(reminders)
    .where(and(eq(reminders.id, reminderId), eq(reminders.guildId, guildId)));
}

/**
 * Reclama recordatorios vencidos (`FOR UPDATE SKIP LOCKED`, lease 2 min).
 * El consumidor entrega o incrementa `attempts` y libera el lease para que el
 * productor lo reintente en el siguiente ciclo (hasta `REMIND_MAX_ATTEMPTS`).
 */
export async function claimDueReminders(
  limit = 50,
): Promise<Array<{ id: number; guildId: string }>> {
  const rows = await getDb().execute(sql`
    WITH due AS (
      SELECT id FROM reminders
      WHERE due_at <= now()
        AND attempts < ${REMIND_MAX_ATTEMPTS}
        AND (claimed_until IS NULL OR claimed_until < now())
      ORDER BY due_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE reminders r
       SET claimed_until = now() + interval '2 minutes'
      FROM due
     WHERE r.id = due.id
    RETURNING r.id, r.guild_id AS "guildId"
  `);
  return (
    rows as unknown as Array<{ id: number | string; guildId: string }>
  ).map((r) => ({ id: Number(r.id), guildId: String(r.guildId) }));
}

export async function clearReminderClaim(reminderId: number): Promise<void> {
  await getDb()
    .update(reminders)
    .set({ claimedUntil: null })
    .where(eq(reminders.id, reminderId));
}

export async function bumpReminderAttempt(reminderId: number): Promise<void> {
  const row = await one(
    getDb()
      .select({ attempts: reminders.attempts, guildId: reminders.guildId })
      .from(reminders)
      .where(eq(reminders.id, reminderId))
      .limit(1),
  );
  if (!row) return;
  const next = row.attempts + 1;
  if (next >= REMIND_MAX_ATTEMPTS) {
    await getDb().delete(reminders).where(eq(reminders.id, reminderId));
    return;
  }
  await getDb()
    .update(reminders)
    .set({ attempts: next })
    .where(eq(reminders.id, reminderId));
}

export async function deleteReminderById(reminderId: number): Promise<void> {
  await getDb().delete(reminders).where(eq(reminders.id, reminderId));
}
