import type {
  AutoModConfig,
  AutoModFilters,
  UpdateAutoModConfigRequest,
} from "@adobos/shared";
import {
  AUTO_MOD_MAX_ALLOWED_LINKS,
  AUTO_MOD_MAX_BANNED_WORDS,
  AUTO_MOD_MAX_LINK_LENGTH,
  AUTO_MOD_MAX_WORD_LENGTH,
  defaultAutoModConfig,
  defaultAutoModFilters,
  normalizeAutoModPunishments,
  normalizeWarnDecayDays,
} from "@adobos/shared";
import { and, eq, gte, sql } from "drizzle-orm";
import { cache } from "#core/cache/store.js";
import { getDb, one } from "#db/client.js";
import {
  actionLogsConfig,
  autoModConfig,
  guildSettings,
  warnings,
} from "#db/schema.js";

export class AutoModError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "AutoModError";
  }
}

const CONFIG_TTL_MS = 60_000;
const configKey = (guildId: string) => `auto-mod:cfg:${guildId}`;

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
    throw new AutoModError("Missing guildId.", 400, "MISSING_GUILD_ID");
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

function normalizeStringList(
  value: unknown,
  maxItems: number,
  maxLength: number,
): string[] {
  const raw: string[] = Array.isArray(value)
    ? value.map((w) => String(w))
    : typeof value === "string"
      ? value.split(/\r?\n/)
      : [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const word = entry.trim().slice(0, maxLength);
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
    if (out.length >= maxItems) break;
  }
  return out;
}

function mergeFilters(
  partial?: Partial<AutoModFilters> | null,
): AutoModFilters {
  const base = defaultAutoModFilters();
  if (!partial) return base;
  const merged: AutoModFilters = {
    ...base,
    ...partial,
    bannedWords: normalizeStringList(
      partial.bannedWords ?? base.bannedWords,
      AUTO_MOD_MAX_BANNED_WORDS,
      AUTO_MOD_MAX_WORD_LENGTH,
    ),
    allowedLinks: normalizeStringList(
      partial.allowedLinks ?? base.allowedLinks,
      AUTO_MOD_MAX_ALLOWED_LINKS,
      AUTO_MOD_MAX_LINK_LENGTH,
    ),
  };

  // Migración suave: si hay palabras guardadas sin toggle, activar el filtro.
  if (
    partial.bannedWordsEnabled === undefined &&
    merged.bannedWords.length > 0
  ) {
    merged.bannedWordsEnabled = true;
  }

  merged.capsPercentage = Math.max(
    1,
    Math.min(100, Math.round(Number(merged.capsPercentage) || 70)),
  );
  merged.capsMinLength = Math.max(
    1,
    Math.min(500, Math.round(Number(merged.capsMinLength) || 8)),
  );
  merged.mentionSpamLimit = Math.max(
    1,
    Math.min(50, Math.round(Number(merged.mentionSpamLimit) || 5)),
  );
  merged.floodMaxChars = Math.max(
    50,
    Math.min(4000, Math.round(Number(merged.floodMaxChars) || 800)),
  );
  merged.floodMaxLines = Math.max(
    1,
    Math.min(100, Math.round(Number(merged.floodMaxLines) || 6)),
  );

  return merged;
}

function rowToConfig(
  guildId: string,
  row: typeof autoModConfig.$inferSelect | undefined,
): AutoModConfig {
  if (!row) return defaultAutoModConfig(guildId);
  const parsedFilters = parseJson<Partial<AutoModFilters>>(row.filters, {});
  return {
    guildId,
    enabled: Boolean(row.enabled),
    filters: mergeFilters(parsedFilters),
    ignoredRoles: parseJson<string[]>(row.ignoredRoles, []),
    ignoredChannels: parseJson<string[]>(row.ignoredChannels, []),
    logChannelId: row.logChannelId ?? null,
    warnDecayDays: normalizeWarnDecayDays(row.warnDecayDays),
    warnOnHit: row.warnOnHit !== false,
    dmOnHit: row.dmOnHit !== false,
    skipStaff: Boolean(row.skipStaff),
    punishments: normalizeAutoModPunishments(parseJson(row.punishments, [])),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export function invalidateAutoModConfigCache(guildId?: string): void {
  // Fire-and-forget; con RedisStore (P2.16) publica la invalidación entre réplicas.
  if (guildId) void cache().del(configKey(guildId));
}

/** Lectura con caché; se invalida al guardar desde el Dashboard. */
export async function getAutoModConfigCached(
  guildId?: string,
): Promise<AutoModConfig> {
  const id = resolveGuildId(guildId);
  const cached = await cache().get<AutoModConfig>(configKey(id));
  if (cached) return cached;

  const config = await getAutoModConfig(id);
  await cache().set(configKey(id), config, CONFIG_TTL_MS);
  return config;
}

export async function getAutoModConfig(
  guildId?: string,
): Promise<AutoModConfig> {
  const id = resolveGuildId(guildId);
  const row = await one(
    getDb()
      .select()
      .from(autoModConfig)
      .where(eq(autoModConfig.guildId, id))
      .limit(1),
  );
  return await rowToConfig(id, row);
}

export async function updateAutoModConfig(
  input: UpdateAutoModConfigRequest,
  guildId?: string,
): Promise<AutoModConfig> {
  const id = resolveGuildId(guildId);
  await ensureGuildRow(id);
  const current = await getAutoModConfig(id);

  const next: AutoModConfig = {
    guildId: id,
    enabled: input.enabled ?? current.enabled,
    filters: mergeFilters({
      ...current.filters,
      ...(input.filters ?? {}),
    }),
    ignoredRoles: input.ignoredRoles ?? current.ignoredRoles,
    ignoredChannels: input.ignoredChannels ?? current.ignoredChannels,
    logChannelId:
      input.logChannelId !== undefined
        ? input.logChannelId
        : current.logChannelId,
    warnDecayDays: normalizeWarnDecayDays(
      input.warnDecayDays !== undefined
        ? input.warnDecayDays
        : current.warnDecayDays,
    ),
    warnOnHit: input.warnOnHit ?? current.warnOnHit,
    dmOnHit: input.dmOnHit ?? current.dmOnHit,
    skipStaff: input.skipStaff ?? current.skipStaff,
    punishments:
      input.punishments !== undefined
        ? normalizeAutoModPunishments(input.punishments)
        : current.punishments,
    updatedAt: new Date().toISOString(),
  };

  await getDb()
    .insert(autoModConfig)
    .values({
      guildId: id,
      enabled: next.enabled,
      filters: JSON.stringify(next.filters),
      ignoredRoles: JSON.stringify(next.ignoredRoles),
      ignoredChannels: JSON.stringify(next.ignoredChannels),
      logChannelId: next.logChannelId,
      warnDecayDays: next.warnDecayDays,
      warnOnHit: next.warnOnHit,
      dmOnHit: next.dmOnHit,
      skipStaff: next.skipStaff,
      punishments: JSON.stringify(next.punishments),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: autoModConfig.guildId,
      set: {
        enabled: next.enabled,
        filters: JSON.stringify(next.filters),
        ignoredRoles: JSON.stringify(next.ignoredRoles),
        ignoredChannels: JSON.stringify(next.ignoredChannels),
        logChannelId: next.logChannelId,
        warnDecayDays: next.warnDecayDays,
        warnOnHit: next.warnOnHit,
        dmOnHit: next.dmOnHit,
        skipStaff: next.skipStaff,
        punishments: JSON.stringify(next.punishments),
        updatedAt: new Date(),
      },
    });

  invalidateAutoModConfigCache(id);
  // Recalentar caché con la config ya mergeada (evita race en messageCreate).
  const saved = await getAutoModConfig(id);
  await cache().set(configKey(id), saved, CONFIG_TTL_MS);
  return saved;
}

/** Cascada: Auto Mod log → Action Logs global → null. */
export async function resolveAutoModLogChannelId(
  guildId: string,
): Promise<string | null> {
  const auto = await getAutoModConfigCached(guildId);
  if (auto.logChannelId?.trim()) return auto.logChannelId.trim();

  const actionRow = await one(
    getDb()
      .select({ globalChannelId: actionLogsConfig.globalChannelId })
      .from(actionLogsConfig)
      .where(eq(actionLogsConfig.guildId, guildId))
      .limit(1),
  );
  const fallback = actionRow?.globalChannelId?.trim();
  return fallback || null;
}

/** Warns activos respetando caducidad (`warnDecayDays`; 0 = todos). */
export async function countActiveWarns(
  guildId: string,
  userId: string,
  warnDecayDays: number,
): Promise<number> {
  const conditions = [
    eq(warnings.guildId, guildId),
    eq(warnings.userId, userId),
  ];
  if (warnDecayDays > 0) {
    const cutoff = new Date(Date.now() - warnDecayDays * 24 * 60 * 60 * 1000);
    conditions.push(gte(warnings.createdAt, cutoff));
  }
  const row = await one(
    getDb()
      .select({ count: sql<number>`count(*)` })
      .from(warnings)
      .where(and(...conditions))
      .limit(1),
  );
  return Number(row?.count ?? 0);
}
