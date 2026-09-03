import type {
  CreateGiveawayRequest,
  Giveaway,
  GiveawayDetail,
  GiveawayEntry,
  GiveawaySettings,
  UpdateGiveawaySettingsRequest,
} from "@adobos/shared";
import {
  canApplyGiveawayAction,
  clampGiveawayAgeDays,
  clampGiveawayWinnerCount,
  durationMsFromMinutes,
  GIVEAWAYS_LIST_MAX,
  type GiveawayAction,
  giveawayRunningBlocked,
  giveawayStatusAfter,
  isGiveawayStatus,
  normalizeGiveawayDescription,
  normalizeGiveawayPrize,
  normalizeGiveawaySnowflake,
  normalizeGiveawaySnowflakeList,
  parseGiveawayWinnerIds,
  pickGiveawayWinners,
} from "@adobos/shared";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { BoundedTtlMap } from "#core/cache/boundedTtlMap.js";
import { getDb, one } from "#db/client.js";
import {
  type GiveawayEntryRow,
  type GiveawayRow,
  type GiveawaySettingsRow,
  giveawayEntries,
  giveawaySettings,
  giveaways,
  guildSettings,
} from "#db/schema.js";

export class GiveawaysError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "GiveawaysError";
  }
}

const settingsCache = new BoundedTtlMap<string, GiveawaySettings>(
  2_000,
  60_000,
);

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new GiveawaysError("Missing guildId.", 400, "MISSING_GUILD_ID");
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

function mapSettings(row: GiveawaySettingsRow): GiveawaySettings {
  return {
    guildId: row.guildId,
    managerRoleIds: normalizeGiveawaySnowflakeList(
      parseGiveawayWinnerIds(row.managerRoleIds),
    ),
    dmWinners: row.dmWinners,
    pingRoleId: row.pingRoleId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapGiveaway(row: GiveawayRow, entryCount: number): Giveaway {
  return {
    id: row.id,
    guildId: row.guildId,
    channelId: row.channelId,
    messageId: row.messageId,
    prize: row.prize,
    description: row.description,
    winnerCount: row.winnerCount,
    status: isGiveawayStatus(row.status) ? row.status : "scheduled",
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    requiredRoleIds: parseGiveawayWinnerIds(row.requiredRoleIds),
    blockedRoleIds: parseGiveawayWinnerIds(row.blockedRoleIds),
    minGuildAgeDays: row.minGuildAgeDays,
    minAccountAgeDays: row.minAccountAgeDays,
    winnerIds: parseGiveawayWinnerIds(row.winnerIds),
    pastWinnerIds: parseGiveawayWinnerIds(row.pastWinnerIds),
    entryCount,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapEntry(row: GiveawayEntryRow): GiveawayEntry {
  return {
    userId: row.userId,
    enteredAt: row.enteredAt.toISOString(),
  };
}

async function loadSettingsRow(guildId: string): Promise<GiveawaySettingsRow> {
  await ensureGuildRow(guildId);
  const existing = await one(
    getDb()
      .select()
      .from(giveawaySettings)
      .where(eq(giveawaySettings.guildId, guildId))
      .limit(1),
  );
  if (existing) return existing;
  const now = new Date();
  const [inserted] = await getDb()
    .insert(giveawaySettings)
    .values({
      guildId,
      managerRoleIds: "[]",
      dmWinners: true,
      updatedAt: now,
    })
    .returning();
  if (!inserted) {
    throw new GiveawaysError(
      "Couldn't create the Giveaways settings.",
      500,
      "SETTINGS_INSERT_FAILED",
    );
  }
  return inserted;
}

export async function getGiveawaySettings(
  guildId?: string,
): Promise<GiveawaySettings> {
  const id = resolveGuildId(guildId);
  const hit = settingsCache.get(id);
  if (hit) return hit;
  const mapped = mapSettings(await loadSettingsRow(id));
  settingsCache.set(id, mapped);
  return mapped;
}

export async function updateGiveawaySettings(
  input: UpdateGiveawaySettingsRequest,
  guildId?: string,
): Promise<GiveawaySettings> {
  const id = resolveGuildId(guildId);
  await loadSettingsRow(id);
  const patch: Partial<GiveawaySettingsRow> = { updatedAt: new Date() };
  if (input.managerRoleIds !== undefined) {
    patch.managerRoleIds = JSON.stringify(
      normalizeGiveawaySnowflakeList(input.managerRoleIds),
    );
  }
  if (input.dmWinners !== undefined) patch.dmWinners = input.dmWinners;
  if (input.pingRoleId !== undefined) {
    patch.pingRoleId = input.pingRoleId
      ? normalizeGiveawaySnowflake(input.pingRoleId)
      : null;
  }
  await getDb()
    .update(giveawaySettings)
    .set(patch)
    .where(eq(giveawaySettings.guildId, id));
  settingsCache.delete(id);
  return getGiveawaySettings(id);
}

async function entryCounts(ids: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (ids.length === 0) return map;
  const rows = await getDb()
    .select({
      giveawayId: giveawayEntries.giveawayId,
      n: count(),
    })
    .from(giveawayEntries)
    .where(inArray(giveawayEntries.giveawayId, ids))
    .groupBy(giveawayEntries.giveawayId);
  for (const row of rows) map.set(row.giveawayId, Number(row.n));
  return map;
}

export async function countRunningGiveaways(guildId: string): Promise<number> {
  return getDb().$count(
    giveaways,
    and(eq(giveaways.guildId, guildId), eq(giveaways.status, "running")),
  );
}

export async function listGiveaways(guildId?: string): Promise<Giveaway[]> {
  const id = resolveGuildId(guildId);
  const rows = await getDb()
    .select()
    .from(giveaways)
    .where(eq(giveaways.guildId, id))
    .orderBy(desc(giveaways.createdAt))
    .limit(GIVEAWAYS_LIST_MAX);
  const counts = await entryCounts(rows.map((row) => row.id));
  return rows.map((row) => mapGiveaway(row, counts.get(row.id) ?? 0));
}

export async function getGiveawayById(
  giveawayId: number,
  guildId?: string,
): Promise<Giveaway> {
  const row = await one(
    getDb()
      .select()
      .from(giveaways)
      .where(eq(giveaways.id, giveawayId))
      .limit(1),
  );
  if (!row) {
    throw new GiveawaysError("Giveaway not found.", 404, "NOT_FOUND");
  }
  if (guildId && row.guildId !== guildId) {
    throw new GiveawaysError("Giveaway not found.", 404, "NOT_FOUND");
  }
  const counts = await entryCounts([row.id]);
  return mapGiveaway(row, counts.get(row.id) ?? 0);
}

export async function getGiveawayDetail(
  giveawayId: number,
  guildId?: string,
): Promise<GiveawayDetail> {
  const summary = await getGiveawayById(giveawayId, guildId);
  const rows = await getDb()
    .select()
    .from(giveawayEntries)
    .where(eq(giveawayEntries.giveawayId, giveawayId));
  return { ...summary, entries: rows.map(mapEntry) };
}

export async function listEntryUserIds(giveawayId: number): Promise<string[]> {
  const rows = await getDb()
    .select({ userId: giveawayEntries.userId })
    .from(giveawayEntries)
    .where(eq(giveawayEntries.giveawayId, giveawayId));
  return rows.map((row) => row.userId);
}

export async function insertGiveaway(input: {
  guildId: string;
  createdBy: string;
  body: CreateGiveawayRequest;
}): Promise<Giveaway> {
  const guildId = resolveGuildId(input.guildId);
  await ensureGuildRow(guildId);
  const channelId = normalizeGiveawaySnowflake(input.body.channelId);
  const prize = normalizeGiveawayPrize(input.body.prize);
  if (!channelId) {
    throw new GiveawaysError("Select a channel.", 400, "MISSING_CHANNEL");
  }
  if (!prize) {
    throw new GiveawaysError("Provide the prize.", 400, "MISSING_PRIZE");
  }
  const now = new Date();
  let startsAt = now;
  if (input.body.startsAt) {
    const parsed = new Date(input.body.startsAt);
    if (
      !Number.isNaN(parsed.getTime()) &&
      parsed.getTime() > now.getTime() + 5_000
    ) {
      startsAt = parsed;
    }
  }
  const durationMs = durationMsFromMinutes(input.body.durationMinutes);
  const endsAt = new Date(startsAt.getTime() + durationMs);
  const status =
    startsAt.getTime() > now.getTime() + 5_000 ? "scheduled" : "running";
  if (status === "running") {
    const running = await countRunningGiveaways(guildId);
    if (giveawayRunningBlocked(running)) {
      throw new GiveawaysError(
        "This server already has 25 giveaways in progress. Finish one first.",
        400,
        "RUNNING_CAP",
      );
    }
  }
  const [row] = await getDb()
    .insert(giveaways)
    .values({
      guildId,
      channelId,
      prize,
      description: normalizeGiveawayDescription(input.body.description),
      winnerCount: clampGiveawayWinnerCount(input.body.winnerCount),
      status,
      startsAt,
      endsAt,
      createdBy: input.createdBy,
      requiredRoleIds: JSON.stringify(
        normalizeGiveawaySnowflakeList(input.body.requiredRoleIds),
      ),
      blockedRoleIds: JSON.stringify(
        normalizeGiveawaySnowflakeList(input.body.blockedRoleIds),
      ),
      minGuildAgeDays: clampGiveawayAgeDays(input.body.minGuildAgeDays),
      minAccountAgeDays: clampGiveawayAgeDays(input.body.minAccountAgeDays),
      winnerIds: "[]",
      pastWinnerIds: "[]",
      createdAt: now,
    })
    .returning();
  if (!row) {
    throw new GiveawaysError(
      "Couldn't create the giveaway.",
      500,
      "INSERT_FAILED",
    );
  }
  return mapGiveaway(row, 0);
}

export async function setGiveawayMessageId(
  giveawayId: number,
  messageId: string | null,
): Promise<void> {
  await getDb()
    .update(giveaways)
    .set({ messageId })
    .where(eq(giveaways.id, giveawayId));
}

export async function clearGiveawayMessageByDiscordId(input: {
  messageId?: string;
  channelId?: string;
}): Promise<void> {
  if (input.messageId) {
    await getDb()
      .update(giveaways)
      .set({ messageId: null })
      .where(eq(giveaways.messageId, input.messageId));
  }
  if (input.channelId) {
    await getDb()
      .update(giveaways)
      .set({ messageId: null })
      .where(eq(giveaways.channelId, input.channelId));
  }
}

export async function toggleGiveawayEntry(
  giveawayId: number,
  userId: string,
): Promise<{ joined: boolean; entryCount: number }> {
  const current = await getGiveawayById(giveawayId);
  if (current.status !== "running") {
    throw new GiveawaysError(
      "This giveaway is not accepting entries.",
      409,
      "NOT_RUNNING",
    );
  }
  const existing = await one(
    getDb()
      .select()
      .from(giveawayEntries)
      .where(
        and(
          eq(giveawayEntries.giveawayId, giveawayId),
          eq(giveawayEntries.userId, userId),
        ),
      )
      .limit(1),
  );
  if (existing) {
    await getDb()
      .delete(giveawayEntries)
      .where(
        and(
          eq(giveawayEntries.giveawayId, giveawayId),
          eq(giveawayEntries.userId, userId),
        ),
      );
    const n = await entryCounts([giveawayId]);
    return { joined: false, entryCount: n.get(giveawayId) ?? 0 };
  }
  await getDb().insert(giveawayEntries).values({
    giveawayId,
    userId,
    enteredAt: new Date(),
  });
  const n = await entryCounts([giveawayId]);
  return { joined: true, entryCount: n.get(giveawayId) ?? 1 };
}

export async function applyGiveawayAction(input: {
  giveawayId: number;
  guildId: string;
  action: GiveawayAction;
}): Promise<Giveaway> {
  const current = await getGiveawayById(input.giveawayId, input.guildId);
  const next = giveawayStatusAfter(current.status, input.action);
  if (!next || !canApplyGiveawayAction(current.status, input.action)) {
    throw new GiveawaysError(
      "That action is not valid in the current state.",
      409,
      "ILLEGAL_TRANSITION",
    );
  }
  const now = new Date();
  const patch: Partial<GiveawayRow> = { status: next };
  if (input.action === "end") {
    const ids = await listEntryUserIds(current.id);
    const picked = pickGiveawayWinners(ids, current.winnerCount, []);
    patch.winnerIds = JSON.stringify(picked);
    patch.pastWinnerIds = JSON.stringify(picked);
    patch.endedAt = now;
  } else if (input.action === "reroll") {
    const ids = await listEntryUserIds(current.id);
    const picked = pickGiveawayWinners(
      ids,
      current.winnerCount,
      current.pastWinnerIds,
    );
    if (picked.length === 0) {
      throw new GiveawaysError(
        "There are no entrants left for a reroll.",
        400,
        "NO_ENTRIES",
      );
    }
    patch.winnerIds = JSON.stringify(picked);
    patch.pastWinnerIds = JSON.stringify([
      ...new Set([...current.pastWinnerIds, ...picked]),
    ]);
  } else if (input.action === "cancel") {
    patch.endedAt = now;
  } else if (input.action === "start") {
    const running = await countRunningGiveaways(input.guildId);
    if (giveawayRunningBlocked(running)) {
      throw new GiveawaysError(
        "This server already has 25 giveaways in progress.",
        400,
        "RUNNING_CAP",
      );
    }
  }
  await getDb()
    .update(giveaways)
    .set(patch)
    .where(eq(giveaways.id, current.id));
  return getGiveawayById(current.id, input.guildId);
}

/**
 * Reclama sorteos que deben arrancar (`scheduled` + `starts_at`) o cerrarse
 * (`running` + `ends_at`), con lease de 2 min y `FOR UPDATE SKIP LOCKED`.
 * El consumidor mira `status` para decidir start vs end.
 */
export async function claimDueGiveaways(
  limit = 50,
): Promise<Array<{ id: number; guildId: string; status: string }>> {
  const rows = await getDb().execute(sql`
    WITH due AS (
      SELECT id FROM giveaways
      WHERE (claimed_until IS NULL OR claimed_until < now())
        AND (
          (status = 'scheduled' AND starts_at <= now())
          OR (status = 'running' AND ends_at <= now())
        )
      ORDER BY id
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE giveaways g
       SET claimed_until = now() + interval '2 minutes'
      FROM due
     WHERE g.id = due.id
    RETURNING g.id, g.guild_id AS "guildId", g.status
  `);
  return (
    rows as unknown as Array<{
      id: number | string;
      guildId: string;
      status: string;
    }>
  ).map((r) => ({
    id: Number(r.id),
    guildId: String(r.guildId),
    status: String(r.status),
  }));
}

export async function clearGiveawayClaim(giveawayId: number): Promise<void> {
  await getDb()
    .update(giveaways)
    .set({ claimedUntil: null })
    .where(eq(giveaways.id, giveawayId));
}
