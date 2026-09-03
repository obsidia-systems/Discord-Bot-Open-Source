import type {
  LevelsChannelMultiplier,
  LevelsConfig,
  LevelsLeaderboardEntry,
  LevelsReward,
  LevelsRoleMultiplier,
  LevelsUserRankStats,
  UpdateLevelsConfigRequest,
} from "@adobos/shared";
import {
  calculateBaseXPForLevel,
  calculateLevel,
  clampLevelsLevel,
  clampLevelsXp,
  DEFAULT_LEADERBOARD_EMBED_COLOR,
  DEFAULT_LEADERBOARD_EMBED_TITLE,
  DEFAULT_LEVEL_UP_EMBED_COLOR,
  DEFAULT_LEVEL_UP_EMBED_TITLE,
  DEFAULT_LEVEL_UP_MESSAGE,
  defaultLevelsConfig,
  normalizeEmbedColor,
  normalizeLevelUpFormat,
  resolveXpMultiplier,
} from "@adobos/shared";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { cache } from "#core/cache/store.js";
import { getDb, one } from "#db/client.js";
import { guildSettings, userXp, xpConfig, xpRewards } from "#db/schema.js";

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

const CONFIG_TTL_MS = 60_000;
const configKey = (guildId: string) => `levels:cfg:${guildId}`;

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
    throw new LevelsError("Missing guildId.", 400, "MISSING_GUILD_ID");
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

function clampFloat(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n * 100) / 100));
}

async function loadRewards(guildId: string): Promise<LevelsReward[]> {
  const rows = await getDb()
    .select()
    .from(xpRewards)
    .where(eq(xpRewards.guildId, guildId))
    .orderBy(asc(xpRewards.level));
  return rows.map((row) => ({
    id: row.id,
    level: row.level,
    roleId: row.roleId,
  }));
}

function normalizeCustomMultipliers(
  input: LevelsRoleMultiplier[] | undefined,
): LevelsRoleMultiplier[] {
  if (!input) return [];
  const seen = new Set<string>();
  const out: LevelsRoleMultiplier[] = [];
  for (const raw of input) {
    const roleId = String(raw.roleId ?? "").trim();
    if (!/^\d{17,20}$/.test(roleId) || seen.has(roleId)) continue;
    const multiplier = Number(raw.multiplier);
    if (!Number.isFinite(multiplier) || multiplier <= 0) continue;
    seen.add(roleId);
    out.push({
      roleId,
      multiplier: Math.max(
        0.1,
        Math.min(20, Math.round(multiplier * 100) / 100),
      ),
    });
  }
  return out;
}

function normalizeChannelMultipliers(
  input: LevelsChannelMultiplier[] | undefined,
): LevelsChannelMultiplier[] {
  if (!input) return [];
  const seen = new Set<string>();
  const out: LevelsChannelMultiplier[] = [];
  for (const raw of input) {
    const channelId = String(raw.channelId ?? "").trim();
    if (!/^\d{17,20}$/.test(channelId) || seen.has(channelId)) continue;
    const multiplier = Number(raw.multiplier);
    if (!Number.isFinite(multiplier) || multiplier <= 0) continue;
    seen.add(channelId);
    out.push({
      channelId,
      multiplier: Math.max(
        0.1,
        Math.min(20, Math.round(multiplier * 100) / 100),
      ),
    });
  }
  return out;
}

export { resolveXpMultiplier };

async function rowToConfig(
  guildId: string,
  row: typeof xpConfig.$inferSelect | undefined,
): Promise<LevelsConfig> {
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
    streamMultiplier: clampFloat(row.streamMultiplier, 0.1, 20, 1),
    xpMultiplier: row.xpMultiplier,
    customMultipliers: normalizeCustomMultipliers(
      parseJson<LevelsRoleMultiplier[]>(row.customMultipliers, []),
    ),
    customChannelMultipliers: normalizeChannelMultipliers(
      parseJson<LevelsChannelMultiplier[]>(row.customChannelMultipliers, []),
    ),
    ignoredRoles: parseJson<string[]>(row.ignoredRoles, []),
    ignoredChannels: parseJson<string[]>(row.ignoredChannels, []),
    levelUpChannelId: row.levelUpChannelId ?? null,
    levelUpFormat: normalizeLevelUpFormat(row.levelUpFormat),
    levelUpMessage:
      (row.levelUpMessage ?? "").trim() || DEFAULT_LEVEL_UP_MESSAGE,
    levelUpEmbedTitle:
      (row.levelUpEmbedTitle ?? "").trim() || DEFAULT_LEVEL_UP_EMBED_TITLE,
    levelUpEmbedColor: normalizeEmbedColor(
      row.levelUpEmbedColor,
      DEFAULT_LEVEL_UP_EMBED_COLOR,
    ),
    levelUpShowThumbnail: Boolean(row.levelUpShowThumbnail),
    levelUpImage: row.levelUpImage ?? null,
    liveLeaderboardChannelId: row.liveLeaderboardChannelId ?? null,
    liveLeaderboardMessageId: row.liveLeaderboardMessageId ?? null,
    leaderboardEmbedTitle:
      (row.leaderboardEmbedTitle ?? "").trim() ||
      DEFAULT_LEADERBOARD_EMBED_TITLE,
    leaderboardEmbedDescription: row.leaderboardEmbedDescription ?? "",
    leaderboardEmbedColor: normalizeEmbedColor(
      row.leaderboardEmbedColor,
      DEFAULT_LEADERBOARD_EMBED_COLOR,
    ),
    leaderboardShowThumbnail: Boolean(row.leaderboardShowThumbnail),
    rewards: await loadRewards(guildId),
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
  // Fire-and-forget: con RedisStore (P2.16) además publica la invalidación
  // al resto de réplicas. Sin guildId (clear-all) ya no lo usa nadie.
  if (guildId) void cache().del(configKey(guildId));
}

export async function getLevelsConfigCached(
  guildId?: string,
): Promise<LevelsConfig> {
  const id = resolveGuildId(guildId);
  const cached = await cache().get<LevelsConfig>(configKey(id));
  if (cached) return cached;
  const config = await getLevelsConfig(id);
  await cache().set(configKey(id), config, CONFIG_TTL_MS);
  return config;
}

export async function getLevelsConfig(guildId?: string): Promise<LevelsConfig> {
  const id = resolveGuildId(guildId);
  const row = await one(
    getDb().select().from(xpConfig).where(eq(xpConfig.guildId, id)).limit(1),
  );
  return await rowToConfig(id, row);
}

export async function updateLevelsConfig(
  input: UpdateLevelsConfigRequest,
  guildId?: string,
): Promise<LevelsConfig> {
  const id = resolveGuildId(guildId);
  await ensureGuildRow(id);
  const current = await getLevelsConfig(id);

  let textXpMin = clampInt(input.textXpMin ?? current.textXpMin, 1, 10_000, 15);
  let textXpMax = clampInt(input.textXpMax ?? current.textXpMax, 1, 10_000, 25);
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
    streamMultiplier: clampFloat(
      input.streamMultiplier ?? current.streamMultiplier,
      0.1,
      20,
      1,
    ),
    xpMultiplier: clampInt(
      input.xpMultiplier ?? current.xpMultiplier,
      1,
      10,
      1,
    ),
    customMultipliers:
      input.customMultipliers !== undefined
        ? normalizeCustomMultipliers(input.customMultipliers)
        : current.customMultipliers,
    customChannelMultipliers:
      input.customChannelMultipliers !== undefined
        ? normalizeChannelMultipliers(input.customChannelMultipliers)
        : current.customChannelMultipliers,
    ignoredRoles: input.ignoredRoles ?? current.ignoredRoles,
    ignoredChannels: input.ignoredChannels ?? current.ignoredChannels,
    levelUpChannelId:
      input.levelUpChannelId !== undefined
        ? input.levelUpChannelId
        : current.levelUpChannelId,
    levelUpFormat:
      input.levelUpFormat !== undefined
        ? normalizeLevelUpFormat(input.levelUpFormat)
        : current.levelUpFormat,
    levelUpMessage:
      input.levelUpMessage !== undefined
        ? input.levelUpMessage.trim() || DEFAULT_LEVEL_UP_MESSAGE
        : current.levelUpMessage,
    levelUpEmbedTitle:
      input.levelUpEmbedTitle !== undefined
        ? input.levelUpEmbedTitle.trim() || DEFAULT_LEVEL_UP_EMBED_TITLE
        : current.levelUpEmbedTitle,
    levelUpEmbedColor:
      input.levelUpEmbedColor !== undefined
        ? normalizeEmbedColor(
            input.levelUpEmbedColor,
            DEFAULT_LEVEL_UP_EMBED_COLOR,
          )
        : current.levelUpEmbedColor,
    levelUpShowThumbnail:
      input.levelUpShowThumbnail !== undefined
        ? Boolean(input.levelUpShowThumbnail)
        : current.levelUpShowThumbnail,
    levelUpImage:
      input.levelUpImage !== undefined
        ? input.levelUpImage
        : current.levelUpImage,
    liveLeaderboardChannelId: nextChannel,
    liveLeaderboardMessageId: nextMessageId,
    leaderboardEmbedTitle:
      input.leaderboardEmbedTitle !== undefined
        ? input.leaderboardEmbedTitle.trim() || DEFAULT_LEADERBOARD_EMBED_TITLE
        : current.leaderboardEmbedTitle,
    leaderboardEmbedDescription:
      input.leaderboardEmbedDescription !== undefined
        ? input.leaderboardEmbedDescription
        : current.leaderboardEmbedDescription,
    leaderboardEmbedColor:
      input.leaderboardEmbedColor !== undefined
        ? normalizeEmbedColor(
            input.leaderboardEmbedColor,
            DEFAULT_LEADERBOARD_EMBED_COLOR,
          )
        : current.leaderboardEmbedColor,
    leaderboardShowThumbnail:
      input.leaderboardShowThumbnail !== undefined
        ? Boolean(input.leaderboardShowThumbnail)
        : current.leaderboardShowThumbnail,
    rewards: nextRewards,
    updatedAt: new Date().toISOString(),
  };

  await getDb()
    .insert(xpConfig)
    .values({
      guildId: id,
      enabled: next.enabled,
      textXpMin: next.textXpMin,
      textXpMax: next.textXpMax,
      cooldownSeconds: next.cooldownSeconds,
      voiceEnabled: next.voiceEnabled,
      voiceXpPerMinute: next.voiceXpPerMinute,
      streamMultiplier: next.streamMultiplier,
      xpMultiplier: next.xpMultiplier,
      customMultipliers: JSON.stringify(next.customMultipliers),
      customChannelMultipliers: JSON.stringify(next.customChannelMultipliers),
      ignoredRoles: JSON.stringify(next.ignoredRoles),
      ignoredChannels: JSON.stringify(next.ignoredChannels),
      levelUpChannelId: next.levelUpChannelId,
      levelUpFormat: next.levelUpFormat,
      levelUpMessage: next.levelUpMessage,
      levelUpEmbedTitle: next.levelUpEmbedTitle,
      levelUpEmbedColor: next.levelUpEmbedColor,
      levelUpShowThumbnail: next.levelUpShowThumbnail,
      levelUpImage: next.levelUpImage,
      liveLeaderboardChannelId: next.liveLeaderboardChannelId,
      liveLeaderboardMessageId: next.liveLeaderboardMessageId,
      leaderboardEmbedTitle: next.leaderboardEmbedTitle,
      leaderboardEmbedDescription: next.leaderboardEmbedDescription,
      leaderboardEmbedColor: next.leaderboardEmbedColor,
      leaderboardShowThumbnail: next.leaderboardShowThumbnail,
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
        streamMultiplier: next.streamMultiplier,
        xpMultiplier: next.xpMultiplier,
        customMultipliers: JSON.stringify(next.customMultipliers),
        customChannelMultipliers: JSON.stringify(next.customChannelMultipliers),
        ignoredRoles: JSON.stringify(next.ignoredRoles),
        ignoredChannels: JSON.stringify(next.ignoredChannels),
        levelUpChannelId: next.levelUpChannelId,
        levelUpFormat: next.levelUpFormat,
        levelUpMessage: next.levelUpMessage,
        levelUpEmbedTitle: next.levelUpEmbedTitle,
        levelUpEmbedColor: next.levelUpEmbedColor,
        levelUpShowThumbnail: next.levelUpShowThumbnail,
        levelUpImage: next.levelUpImage,
        liveLeaderboardChannelId: next.liveLeaderboardChannelId,
        liveLeaderboardMessageId: next.liveLeaderboardMessageId,
        leaderboardEmbedTitle: next.leaderboardEmbedTitle,
        leaderboardEmbedDescription: next.leaderboardEmbedDescription,
        leaderboardEmbedColor: next.leaderboardEmbedColor,
        leaderboardShowThumbnail: next.leaderboardShowThumbnail,
        updatedAt: new Date(),
      },
    });

  if (input.rewards !== undefined) {
    await getDb().delete(xpRewards).where(eq(xpRewards.guildId, id));
    for (const reward of nextRewards) {
      await getDb().insert(xpRewards).values({
        guildId: id,
        level: reward.level,
        roleId: reward.roleId,
      });
    }
  }

  invalidateLevelsConfigCache(id);
  const saved = await getLevelsConfig(id);
  await cache().set(configKey(id), saved, CONFIG_TTL_MS);
  return saved;
}

/** Persiste el message ID del leaderboard en vivo (sin tocar el resto). */
export async function setLiveLeaderboardMessageId(
  guildId: string,
  messageId: string | null,
): Promise<void> {
  const id = resolveGuildId(guildId);
  await getDb()
    .update(xpConfig)
    .set({
      liveLeaderboardMessageId: messageId,
      updatedAt: new Date(),
    })
    .where(eq(xpConfig.guildId, id));
  invalidateLevelsConfigCache(id);
  const refreshed = await getLevelsConfig(id);
  await cache().set(configKey(id), refreshed, CONFIG_TTL_MS);
}

export interface AddXpResult {
  xp: number;
  previousLevel: number;
  newLevel: number;
  previousXp: number;
  gained: number;
  leveledUp: boolean;
}

/** Suma XP de forma atómica (fila bloqueada) y recalcula nivel. */
export async function addUserXp(
  guildId: string,
  userId: string,
  amount: number,
): Promise<AddXpResult> {
  const gained = Math.max(0, Math.floor(amount));
  return await getDb().transaction(async (tx) => {
    await tx
      .insert(userXp)
      .values({ guildId, userId, xp: 0, level: 0 })
      .onConflictDoNothing({ target: [userXp.guildId, userXp.userId] });

    const existing = await one(
      tx
        .select()
        .from(userXp)
        .where(and(eq(userXp.guildId, guildId), eq(userXp.userId, userId)))
        .limit(1)
        .for("update"),
    );
    if (!existing) {
      throw new LevelsError(
        "Couldn't create the XP progress.",
        500,
        "XP_UPSERT_FAILED",
      );
    }

    const previousXp = existing.xp;
    const previousLevel = existing.level;
    const xp = clampLevelsXp(previousXp + gained);
    const newLevel = calculateLevel(xp);

    if (xp !== previousXp || newLevel !== previousLevel) {
      await tx
        .update(userXp)
        .set({ xp, level: newLevel })
        .where(and(eq(userXp.guildId, guildId), eq(userXp.userId, userId)));
    }

    return {
      xp,
      previousLevel,
      newLevel,
      previousXp,
      gained: xp - previousXp,
      leveledUp: newLevel > previousLevel,
    };
  });
}

/** Resta XP (mínimo 0) de forma atómica y recalcula nivel. */
export async function deductUserXp(
  guildId: string,
  userId: string,
  amount: number,
): Promise<AddXpResult> {
  const lost = Math.max(0, Math.floor(amount));
  return await getDb().transaction(async (tx) => {
    await tx
      .insert(userXp)
      .values({ guildId, userId, xp: 0, level: 0 })
      .onConflictDoNothing({ target: [userXp.guildId, userXp.userId] });

    const existing = await one(
      tx
        .select()
        .from(userXp)
        .where(and(eq(userXp.guildId, guildId), eq(userXp.userId, userId)))
        .limit(1)
        .for("update"),
    );
    if (!existing) {
      throw new LevelsError(
        "Couldn't create the XP progress.",
        500,
        "XP_UPSERT_FAILED",
      );
    }

    const previousXp = existing.xp;
    const previousLevel = existing.level;
    const xp = clampLevelsXp(Math.max(0, previousXp - lost));
    const newLevel = calculateLevel(xp);
    await tx
      .update(userXp)
      .set({ xp, level: newLevel })
      .where(and(eq(userXp.guildId, guildId), eq(userXp.userId, userId)));
    return {
      xp,
      previousLevel,
      newLevel,
      previousXp,
      gained: -Math.min(lost, previousXp),
      leveledUp: false,
    };
  });
}

export interface SetLevelResult {
  xp: number;
  level: number;
  previousXp: number;
  previousLevel: number;
}

/** Fija el nivel y la XP base exacta de ese nivel. */
export async function setUserLevel(
  guildId: string,
  userId: string,
  level: number,
): Promise<SetLevelResult> {
  const nextLevel = clampLevelsLevel(level);
  const xp = calculateBaseXPForLevel(nextLevel);

  return await getDb().transaction(async (tx) => {
    await tx
      .insert(userXp)
      .values({ guildId, userId, xp, level: nextLevel })
      .onConflictDoNothing({ target: [userXp.guildId, userXp.userId] });

    const existing = await one(
      tx
        .select()
        .from(userXp)
        .where(and(eq(userXp.guildId, guildId), eq(userXp.userId, userId)))
        .limit(1)
        .for("update"),
    );
    const previousXp = existing?.xp ?? 0;
    const previousLevel = existing?.level ?? calculateLevel(previousXp);

    await tx
      .update(userXp)
      .set({ xp, level: nextLevel })
      .where(and(eq(userXp.guildId, guildId), eq(userXp.userId, userId)));

    return { xp, level: nextLevel, previousXp, previousLevel };
  });
}

/** ¿El usuario tiene XP congelada ahora? */
export async function isUserXpFrozen(
  guildId: string,
  userId: string,
): Promise<boolean> {
  const row = await one(
    getDb()
      .select({ xpFrozenUntil: userXp.xpFrozenUntil })
      .from(userXp)
      .where(and(eq(userXp.guildId, guildId), eq(userXp.userId, userId)))
      .limit(1),
  );
  if (!row?.xpFrozenUntil) return false;
  return row.xpFrozenUntil.getTime() > Date.now();
}

/** Congela ganancia de XP hasta `until` (timestamp Date). */
export async function freezeUserXp(
  guildId: string,
  userId: string,
  until: Date,
): Promise<void> {
  const existing = await one(
    getDb()
      .select()
      .from(userXp)
      .where(and(eq(userXp.guildId, guildId), eq(userXp.userId, userId)))
      .limit(1),
  );

  if (existing) {
    const currentMs = existing.xpFrozenUntil?.getTime() ?? 0;
    const nextUntil =
      until.getTime() > currentMs ? until : (existing.xpFrozenUntil ?? until);
    await getDb()
      .update(userXp)
      .set({ xpFrozenUntil: nextUntil })
      .where(and(eq(userXp.guildId, guildId), eq(userXp.userId, userId)));
    return;
  }

  await getDb().insert(userXp).values({
    guildId,
    userId,
    xp: 0,
    level: 0,
    xpFrozenUntil: until,
  });
}

/** Roles a otorgar al subir de `fromLevel` (exclusivo) a `toLevel` (inclusivo). */
export async function rewardsBetweenLevels(
  guildId: string,
  fromLevel: number,
  toLevel: number,
): Promise<LevelsReward[]> {
  if (toLevel <= fromLevel) return [];
  const config = await getLevelsConfigCached(guildId);
  return config.rewards.filter(
    (r) => r.level > fromLevel && r.level <= toLevel,
  );
}

/** Recompensa exacta de un nivel (si existe). */
export async function rewardAtLevel(
  guildId: string,
  level: number,
): Promise<LevelsReward | null> {
  const config = await getLevelsConfigCached(guildId);
  return config.rewards.find((r) => r.level === level) ?? null;
}

/** Próxima recompensa con nivel estrictamente mayor al actual. */
export async function nextRewardAfter(
  guildId: string,
  level: number,
): Promise<LevelsReward | null> {
  const config = await getLevelsConfigCached(guildId);
  const upcoming = config.rewards
    .filter((r) => r.level > level)
    .sort((a, b) => a.level - b.level);
  return upcoming[0] ?? null;
}

export function randomTextXp(
  config: LevelsConfig,
  roleIds: Iterable<string> = [],
  channelId?: string | null,
): number {
  const min = Math.min(config.textXpMin, config.textXpMax);
  const max = Math.max(config.textXpMin, config.textXpMax);
  const base = Math.floor(Math.random() * (max - min + 1)) + min;
  const mult = resolveXpMultiplier(config, roleIds, { channelId });
  return Math.max(0, Math.floor(base * mult));
}

export function scaleXpAmount(
  config: LevelsConfig,
  baseAmount: number,
  roleIds: Iterable<string> = [],
  options?: { channelId?: string | null; streaming?: boolean },
): number {
  const mult = resolveXpMultiplier(config, roleIds, options);
  return Math.max(0, Math.floor(baseAmount * mult));
}

/** Top N por XP (sin resolver Discord). */
export async function getTopUserXpRows(
  guildId: string,
  limit = 10,
): Promise<Array<{ userId: string; xp: number; level: number }>> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  return await getDb()
    .select({
      userId: userXp.userId,
      xp: userXp.xp,
      level: userXp.level,
    })
    .from(userXp)
    .where(eq(userXp.guildId, guildId))
    .orderBy(desc(userXp.xp), asc(userXp.userId))
    .limit(safeLimit);
}

export async function getLeaderboardTotal(guildId: string): Promise<number> {
  return getDb().$count(userXp, eq(userXp.guildId, guildId));
}

/** Fingerprint del Top N para detectar cambios de posiciones/puntos. */
export function topFingerprint(
  rows: Array<{ userId: string; xp: number }>,
): string {
  return rows.map((r) => `${r.userId}:${r.xp}`).join("|");
}

export async function getUserRankStats(
  guildId: string,
  userId: string,
): Promise<LevelsUserRankStats | null> {
  const row = await one(
    getDb()
      .select()
      .from(userXp)
      .where(and(eq(userXp.guildId, guildId), eq(userXp.userId, userId)))
      .limit(1),
  );

  if (!row) return null;

  const ahead = await getDb().$count(
    userXp,
    and(eq(userXp.guildId, guildId), gt(userXp.xp, row.xp)),
  );

  const total = await getLeaderboardTotal(guildId);
  const level = row.level;
  const nextXp = calculateBaseXPForLevel(level + 1);
  const xpRemaining = Math.max(0, nextXp - row.xp);

  return {
    userId,
    xp: row.xp,
    level,
    rank: ahead + 1,
    xpForNextLevel: nextXp,
    xpRemaining,
    totalUsers: total,
  };
}

/** Resuelve entradas del leaderboard (IDs) — el caller añade nombres/avatars. */
export async function listLeaderboardRows(
  guildId: string,
  limit = 100,
): Promise<Array<{ rank: number; userId: string; xp: number; level: number }>> {
  const rows = await getTopUserXpRows(guildId, limit);
  return rows.map((row, i) => ({
    rank: i + 1,
    userId: row.userId,
    xp: row.xp,
    level: row.level,
  }));
}

export type { LevelsLeaderboardEntry };
