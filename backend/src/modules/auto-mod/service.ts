import { eq } from "drizzle-orm";
import type {
  AutoModConfig,
  AutoModFilters,
  UpdateAutoModConfigRequest,
} from "@adobos/shared";
import {
  defaultAutoModConfig,
  defaultAutoModFilters,
} from "@adobos/shared";
import { getDb } from "../../db/client.js";
import { autoModConfig, guildSettings } from "../../db/schema.js";
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

const configCache = new Map<
  string,
  { config: AutoModConfig; expiresAt: number }
>();
const CACHE_TTL_MS = 3_000;

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
    throw new AutoModError(
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

function mergeFilters(
  partial?: Partial<AutoModFilters> | null,
): AutoModFilters {
  const base = defaultAutoModFilters();
  if (!partial) return base;
  return {
    ...base,
    ...partial,
    bannedWords:
      typeof partial.bannedWords === "string"
        ? partial.bannedWords
        : base.bannedWords,
    allowedLinks:
      typeof partial.allowedLinks === "string"
        ? partial.allowedLinks
        : base.allowedLinks,
    mentionSpamLimit: Math.max(
      1,
      Math.min(
        50,
        Math.round(
          Number(partial.mentionSpamLimit ?? base.mentionSpamLimit) || 5,
        ),
      ),
    ),
  };
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

/** Lectura con caché corta para messageCreate. */
export function getAutoModConfigCached(guildId?: string): AutoModConfig {
  const id = resolveGuildId(guildId);
  const hit = configCache.get(id);
  const now = Date.now();
  if (hit && hit.expiresAt > now) return hit.config;

  const config = getAutoModConfig(id);
  configCache.set(id, { config, expiresAt: now + CACHE_TTL_MS });
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
        updatedAt: new Date(),
      },
    })
    .run();

  invalidateAutoModConfigCache(id);
  return getAutoModConfig(id);
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
