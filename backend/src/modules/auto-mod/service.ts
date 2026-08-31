import type {
  AutoModConfig,
  AutoModFilters,
  UpdateAutoModConfigRequest,
} from "@adobos/shared";
import {
  defaultAutoModConfig,
  defaultAutoModFilters,
  normalizeAutoModPunishments,
  normalizeWarnDecayDays,
} from "@adobos/shared";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { autoModConfig, guildSettings, warnings } from "../../db/schema.js";
import { actionLogsConfig } from "../../db/schema.js";

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

const configCache = new Map<string, AutoModConfig>();

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
    throw new AutoModError(
      "Falta guildId.",
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

function normalizeStringList(value: unknown): string[] {
  const raw: string[] = Array.isArray(value)
    ? value.map((w) => String(w))
    : typeof value === "string"
      ? value.split(/\r?\n/)
      : [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const word = entry.trim();
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
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
    bannedWords: normalizeStringList(partial.bannedWords ?? base.bannedWords),
    allowedLinks: normalizeStringList(
      partial.allowedLinks ?? base.allowedLinks,
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
    punishments: normalizeAutoModPunishments(
      parseJson(row.punishments, []),
    ),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export function invalidateAutoModConfigCache(guildId?: string): void {
  if (guildId) {
    configCache.delete(guildId);
    return;
  }
  configCache.clear();
}

/** Lectura con caché en memoria; se invalida al guardar desde el Dashboard. */
export function getAutoModConfigCached(guildId?: string): AutoModConfig {
  const id = resolveGuildId(guildId);
  const cached = configCache.get(id);
  if (cached) return cached;

  const config = getAutoModConfig(id);
  configCache.set(id, config);
  return config;
}

export function getAutoModConfig(guildId?: string): AutoModConfig {
  const id = resolveGuildId(guildId);
  const row = getDb()
    .select()
    .from(autoModConfig)
    .where(eq(autoModConfig.guildId, id))
    .get();
  return rowToConfig(id, row);
}

export function updateAutoModConfig(
  input: UpdateAutoModConfigRequest,
  guildId?: string,
): AutoModConfig {
  const id = resolveGuildId(guildId);
  ensureGuildRow(id);
  const current = getAutoModConfig(id);

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
    punishments:
      input.punishments !== undefined
        ? normalizeAutoModPunishments(input.punishments)
        : current.punishments,
    updatedAt: new Date().toISOString(),
  };

  getDb()
    .insert(autoModConfig)
    .values({
      guildId: id,
      enabled: next.enabled,
      filters: JSON.stringify(next.filters),
      ignoredRoles: JSON.stringify(next.ignoredRoles),
      ignoredChannels: JSON.stringify(next.ignoredChannels),
      logChannelId: next.logChannelId,
      warnDecayDays: next.warnDecayDays,
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
        punishments: JSON.stringify(next.punishments),
        updatedAt: new Date(),
      },
    })
    .run();

  invalidateAutoModConfigCache(id);
  // Recalentar caché con la config ya mergeada (evita race en messageCreate).
  const saved = getAutoModConfig(id);
  configCache.set(id, saved);
  return saved;
}

/** Cascada: Auto Mod log → Action Logs global → null. */
export function resolveAutoModLogChannelId(guildId: string): string | null {
  const auto = getAutoModConfigCached(guildId);
  if (auto.logChannelId?.trim()) return auto.logChannelId.trim();

  const actionRow = getDb()
    .select({ globalChannelId: actionLogsConfig.globalChannelId })
    .from(actionLogsConfig)
    .where(eq(actionLogsConfig.guildId, guildId))
    .get();
  const fallback = actionRow?.globalChannelId?.trim();
  return fallback || null;
}

/** Warns activos respetando caducidad (`warnDecayDays`; 0 = todos). */
export function countActiveWarns(
  guildId: string,
  userId: string,
  warnDecayDays: number,
): number {
  const conditions = [
    eq(warnings.guildId, guildId),
    eq(warnings.userId, userId),
  ];
  if (warnDecayDays > 0) {
    const cutoff = new Date(Date.now() - warnDecayDays * 24 * 60 * 60 * 1000);
    conditions.push(gte(warnings.createdAt, cutoff));
  }
  const row = getDb()
    .select({ count: sql<number>`count(*)` })
    .from(warnings)
    .where(and(...conditions))
    .get();
  return Number(row?.count ?? 0);
}
