import { and, asc, count, desc, eq, gt } from "drizzle-orm";
import type {
  LevelsConfig,
  LevelsLeaderboardEntry,
  LevelsReward,
  LevelsUserRankStats,
  UpdateLevelsConfigRequest,
} from "@adobos/shared";
import {
  defaultLevelsConfig,
  levelFromXp,
  xpForLevel,
} from "@adobos/shared";
import { getDb } from "../../db/client.js";
import {
  guildSettings,
  userXp,
  xpConfig,
  xpRewards,
} from "../../db/schema.js";

export class LevelsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "LevelsError";
  }
}

const configCache = new Map<string, LevelsConfig>();

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
    throw new LevelsError(
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

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function loadRewards(guildId: string): LevelsReward[] {
  return getDb()
    .select()
    .from(xpRewards)
    .where(eq(xpRewards.guildId, guildId))
    .orderBy(asc(xpRewards.level))
    .all()
    .map((row) => ({
      id: row.id,
      level: row.level,
      roleId: row.roleId,
    }));
}

function rowToConfig(
  guildId: string,
  row: typeof xpConfig.$inferSelect | undefined,
): LevelsConfig {
  if (!row) {
    return { ...defaultLevelsConfig(guildId), rewards: [] };
  }
  return {
    guildId,
    enabled: Boolean(row.enabled),
    textXpMin: row.textXpMin,
    textXpMax: row.textXpMax,
    cooldownSeconds: row.cooldownSeconds,
    voiceEnabled: Boolean(row.voiceEnabled),
    voiceXpPerMinute: row.voiceXpPerMinute,
    xpMultiplier: row.xpMultiplier,
    ignoredRoles: parseJson<string[]>(row.ignoredRoles, []),
    ignoredChannels: parseJson<string[]>(row.ignoredChannels, []),
    levelUpChannelId: row.levelUpChannelId ?? null,
    liveLeaderboardChannelId: row.liveLeaderboardChannelId ?? null,
    liveLeaderboardMessageId: row.liveLeaderboardMessageId ?? null,
    rewards: loadRewards(guildId),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function normalizeRewards(input: LevelsReward[] | undefined): LevelsReward[] {
  if (!input) return [];
  const seen = new Set<number>();
  const out: LevelsReward[] = [];
  for (const raw of input) {
    const level = clampInt(raw.level, 1, 500, 0);
    const roleId = String(raw.roleId ?? "").trim();
    if (level < 1 || !/^\d{17,20}$/.test(roleId)) continue;
    if (seen.has(level)) continue;
    seen.add(level);
    out.push({
      ...(typeof raw.id === "number" ? { id: raw.id } : {}),
      level,
      roleId,
    });
  }
  return out.sort((a, b) => a.level - b.level);
}

export function invalidateLevelsConfigCache(guildId?: string): void {
  if (guildId) {
    configCache.delete(guildId);
    return;
  }
  configCache.clear();
}

export function getLevelsConfigCached(guildId?: string): LevelsConfig {
  const id = resolveGuildId(guildId);
  const cached = configCache.get(id);
  if (cached) return cached;
  const config = getLevelsConfig(id);
  configCache.set(id, config);
  return config;
}

export function getLevelsConfig(guildId?: string): LevelsConfig {
  const id = resolveGuildId(guildId);
  const row = getDb()
    .select()
    .from(xpConfig)
    .where(eq(xpConfig.guildId, id))
    .get();
  return rowToConfig(id, row);
}

export function updateLevelsConfig(
  input: UpdateLevelsConfigRequest,
  guildId?: string,
): LevelsConfig {
  const id = resolveGuildId(guildId);
  ensureGuildRow(id);
  const current = getLevelsConfig(id);

  let textXpMin = clampInt(
    input.textXpMin ?? current.textXpMin,
    1,
    10_000,
    15,
  );
  let textXpMax = clampInt(
    input.textXpMax ?? current.textXpMax,
    1,
    10_000,
    25,
  );
  if (textXpMin > textXpMax) {
    const tmp = textXpMin;
    textXpMin = textXpMax;
    textXpMax = tmp;
  }

  const nextRewards =
    input.rewards !== undefined
      ? normalizeRewards(input.rewards)
      : current.rewards;

  const nextChannel =
    input.liveLeaderboardChannelId !== undefined
      ? input.liveLeaderboardChannelId
      : current.liveLeaderboardChannelId;

  // Si cambia el canal, invalidar messageId (hay que re-enviar el embed).
  const channelChanged =
    input.liveLeaderboardChannelId !== undefined &&
    input.liveLeaderboardChannelId !== current.liveLeaderboardChannelId;
  const nextMessageId = channelChanged
    ? null
    : current.liveLeaderboardMessageId;

  const next: LevelsConfig = {
    guildId: id,
    enabled: input.enabled ?? current.enabled,
    textXpMin,
    textXpMax,
    cooldownSeconds: clampInt(
      input.cooldownSeconds ?? current.cooldownSeconds,
      0,
      86_400,
      60,
    ),
    voiceEnabled: input.voiceEnabled ?? current.voiceEnabled,
    voiceXpPerMinute: clampInt(
      input.voiceXpPerMinute ?? current.voiceXpPerMinute,
      0,
      10_000,
      10,
    ),
    xpMultiplier: clampInt(
      input.xpMultiplier ?? current.xpMultiplier,
      1,
      10,
      1,
    ),
    ignoredRoles: input.ignoredRoles ?? current.ignoredRoles,
    ignoredChannels: input.ignoredChannels ?? current.ignoredChannels,
    levelUpChannelId:
      input.levelUpChannelId !== undefined
        ? input.levelUpChannelId
        : current.levelUpChannelId,
    liveLeaderboardChannelId: nextChannel,
    liveLeaderboardMessageId: nextMessageId,
    rewards: nextRewards,
    updatedAt: new Date().toISOString(),
  };

  getDb()
    .insert(xpConfig)
    .values({
      guildId: id,
      enabled: next.enabled,
      textXpMin: next.textXpMin,
      textXpMax: next.textXpMax,
      cooldownSeconds: next.cooldownSeconds,
      voiceEnabled: next.voiceEnabled,
      voiceXpPerMinute: next.voiceXpPerMinute,
      xpMultiplier: next.xpMultiplier,
      ignoredRoles: JSON.stringify(next.ignoredRoles),
      ignoredChannels: JSON.stringify(next.ignoredChannels),
      levelUpChannelId: next.levelUpChannelId,
      liveLeaderboardChannelId: next.liveLeaderboardChannelId,
      liveLeaderboardMessageId: next.liveLeaderboardMessageId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: xpConfig.guildId,
      set: {
        enabled: next.enabled,
        textXpMin: next.textXpMin,
        textXpMax: next.textXpMax,
        cooldownSeconds: next.cooldownSeconds,
        voiceEnabled: next.voiceEnabled,
        voiceXpPerMinute: next.voiceXpPerMinute,
        xpMultiplier: next.xpMultiplier,
        ignoredRoles: JSON.stringify(next.ignoredRoles),
        ignoredChannels: JSON.stringify(next.ignoredChannels),
        levelUpChannelId: next.levelUpChannelId,
        liveLeaderboardChannelId: next.liveLeaderboardChannelId,
        liveLeaderboardMessageId: next.liveLeaderboardMessageId,
        updatedAt: new Date(),
      },
    })
    .run();

  if (input.rewards !== undefined) {
    getDb().delete(xpRewards).where(eq(xpRewards.guildId, id)).run();
    for (const reward of nextRewards) {
      getDb()
        .insert(xpRewards)
        .values({
          guildId: id,
          level: reward.level,
          roleId: reward.roleId,
        })
        .run();
    }
  }

  invalidateLevelsConfigCache(id);
  const saved = getLevelsConfig(id);
  configCache.set(id, saved);
  return saved;
}

/** Persiste el message ID del leaderboard en vivo (sin tocar el resto). */
export function setLiveLeaderboardMessageId(
  guildId: string,
  messageId: string | null,
): void {
  const id = resolveGuildId(guildId);
  getDb()
    .update(xpConfig)
    .set({
      liveLeaderboardMessageId: messageId,
      updatedAt: new Date(),
    })
    .where(eq(xpConfig.guildId, id))
    .run();
  invalidateLevelsConfigCache(id);
  const refreshed = getLevelsConfig(id);
  configCache.set(id, refreshed);
}

export interface AddXpResult {
  xp: number;
  previousLevel: number;
  newLevel: number;
  previousXp: number;
  gained: number;
  leveledUp: boolean;
}

/** Suma XP y recalcula nivel. No aplica recompensas Discord (eso va en events). */
export function addUserXp(
  guildId: string,
  userId: string,
  amount: number,
): AddXpResult {
  const gained = Math.max(0, Math.floor(amount));
  const existing = getDb()
    .select()
    .from(userXp)
    .where(and(eq(userXp.guildId, guildId), eq(userXp.userId, userId)))
    .get();

  const previousXp = existing?.xp ?? 0;
  const previousLevel = existing?.level ?? levelFromXp(previousXp);
  const xp = previousXp + gained;
  const newLevel = levelFromXp(xp);

  if (existing) {
    getDb()
      .update(userXp)
      .set({ xp, level: newLevel })
      .where(and(eq(userXp.guildId, guildId), eq(userXp.userId, userId)))
      .run();
  } else {
    getDb()
      .insert(userXp)
      .values({ guildId, userId, xp, level: newLevel })
      .run();
  }

  return {
    xp,
    previousLevel,
    newLevel,
    previousXp,
    gained,
    leveledUp: newLevel > previousLevel,
  };
}

/** Roles a otorgar al subir de `fromLevel` (exclusivo) a `toLevel` (inclusivo). */
export function rewardsBetweenLevels(
  guildId: string,
  fromLevel: number,
  toLevel: number,
): LevelsReward[] {
  if (toLevel <= fromLevel) return [];
  const config = getLevelsConfigCached(guildId);
  return config.rewards.filter(
    (r) => r.level > fromLevel && r.level <= toLevel,
  );
}

export function randomTextXp(config: LevelsConfig): number {
  const min = Math.min(config.textXpMin, config.textXpMax);
  const max = Math.max(config.textXpMin, config.textXpMax);
  const base = Math.floor(Math.random() * (max - min + 1)) + min;
  return Math.max(0, Math.floor(base * config.xpMultiplier));
}

/** Top N por XP (sin resolver Discord). */
export function getTopUserXpRows(
  guildId: string,
  limit = 10,
): Array<{ userId: string; xp: number; level: number }> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  return getDb()
    .select({
      userId: userXp.userId,
      xp: userXp.xp,
      level: userXp.level,
    })
    .from(userXp)
    .where(eq(userXp.guildId, guildId))
    .orderBy(desc(userXp.xp), asc(userXp.userId))
    .limit(safeLimit)
    .all();
}

export function getLeaderboardTotal(guildId: string): number {
  const row = getDb()
    .select({ n: count() })
    .from(userXp)
    .where(eq(userXp.guildId, guildId))
    .get();
  return row?.n ?? 0;
}

/** Fingerprint del Top N para detectar cambios de posiciones/puntos. */
export function topFingerprint(
  rows: Array<{ userId: string; xp: number }>,
): string {
  return rows.map((r) => `${r.userId}:${r.xp}`).join("|");
}

export function getUserRankStats(
  guildId: string,
  userId: string,
): LevelsUserRankStats | null {
  const row = getDb()
    .select()
    .from(userXp)
    .where(and(eq(userXp.guildId, guildId), eq(userXp.userId, userId)))
    .get();

  if (!row) return null;

  const ahead = getDb()
    .select({ n: count() })
    .from(userXp)
    .where(and(eq(userXp.guildId, guildId), gt(userXp.xp, row.xp)))
    .get();

  const total = getLeaderboardTotal(guildId);
  const level = row.level;
  const nextXp = xpForLevel(level + 1);
  const xpRemaining = Math.max(0, nextXp - row.xp);

  return {
    userId,
    xp: row.xp,
    level,
    rank: (ahead?.n ?? 0) + 1,
    xpForNextLevel: nextXp,
    xpRemaining,
    totalUsers: total,
  };
}

/** Resuelve entradas del leaderboard (IDs) — el caller añade nombres/avatars. */
export function listLeaderboardRows(
  guildId: string,
  limit = 100,
): Array<{ rank: number; userId: string; xp: number; level: number }> {
  const rows = getTopUserXpRows(guildId, limit);
  return rows.map((row, i) => ({
    rank: i + 1,
    userId: row.userId,
    xp: row.xp,
    level: row.level,
  }));
}

export type { LevelsLeaderboardEntry };
