import type {
  AutoDeleteConfig,
  AutoDeleteRule,
  UpdateAutoDeleteConfigRequest,
} from "@adobos/shared";
import {
  defaultAutoDeleteConfig,
  clampCountdownDelay,
  normalizeAutoDeleteDelayUnit,
  normalizeAutoDeleteFilterType,
  normalizeAutoDeleteMode,
  normalizeScheduledDays,
  normalizeScheduledTime,
} from "@adobos/shared";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { autoDeleteConfig, guildSettings } from "../../db/schema.js";

export class AutoDeleteError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "AutoDeleteError";
  }
}

const configCache = new Map<string, AutoDeleteConfig>();

/** Callback opcional para reprogramar crons tras guardar. */
let onConfigChanged:
  | ((config: AutoDeleteConfig) => void)
  | null = null;

export function setAutoDeleteConfigChangeListener(
  listener: ((config: AutoDeleteConfig) => void) | null,
): void {
  onConfigChanged = listener;
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
    throw new AutoDeleteError(
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

function clampDelayValue(
  value: unknown,
  unit: ReturnType<typeof normalizeAutoDeleteDelayUnit>,
): number {
  return clampCountdownDelay(Number(value), unit);
}

export function normalizeAutoDeleteRules(
  input: AutoDeleteRule[] | undefined,
): AutoDeleteRule[] {
  if (!input) return [];
  const seen = new Set<string>();
  const out: AutoDeleteRule[] = [];
  for (const raw of input) {
    const channelId = String(raw.channelId ?? "").trim();
    if (!/^\d{17,20}$/.test(channelId) || seen.has(channelId)) continue;
    seen.add(channelId);
    const mode = normalizeAutoDeleteMode(raw.mode);
    const delayUnit = normalizeAutoDeleteDelayUnit(raw.delayUnit);
    out.push({
      channelId,
      mode,
      delayValue: clampDelayValue(raw.delayValue, delayUnit),
      delayUnit,
      scheduledTime: normalizeScheduledTime(raw.scheduledTime),
      scheduledDays: normalizeScheduledDays(raw.scheduledDays),
      filterType: normalizeAutoDeleteFilterType(raw.filterType),
    });
  }
  return out;
}

function rowToConfig(
  guildId: string,
  row: typeof autoDeleteConfig.$inferSelect | undefined,
): AutoDeleteConfig {
  if (!row) {
    return defaultAutoDeleteConfig(guildId);
  }
  return {
    guildId,
    enabled: Boolean(row.enabled),
    rules: normalizeAutoDeleteRules(
      parseJson<AutoDeleteRule[]>(row.rules, []),
    ),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export function invalidateAutoDeleteConfigCache(guildId?: string): void {
  if (guildId) configCache.delete(guildId);
  else configCache.clear();
}

export function getAutoDeleteConfig(guildId?: string): AutoDeleteConfig {
  const id = resolveGuildId(guildId);
  ensureGuildRow(id);
  const row = getDb()
    .select()
    .from(autoDeleteConfig)
    .where(eq(autoDeleteConfig.guildId, id))
    .get();
  const config = rowToConfig(id, row);
  configCache.set(id, config);
  return config;
}

/** Lectura rápida para messageCreate (sin I/O si hay caché). */
export function getAutoDeleteConfigCached(guildId: string): AutoDeleteConfig {
  const cached = configCache.get(guildId);
  if (cached) return cached;
  try {
    return getAutoDeleteConfig(guildId);
  } catch {
    return defaultAutoDeleteConfig(guildId);
  }
}

/** Todas las configs guardadas (para rehidratar crons al arranque). */
export function listAllAutoDeleteConfigs(): AutoDeleteConfig[] {
  const rows = getDb().select().from(autoDeleteConfig).all();
  return rows.map((row) => {
    const config = rowToConfig(row.guildId, row);
    configCache.set(row.guildId, config);
    return config;
  });
}

export function updateAutoDeleteConfig(
  input: UpdateAutoDeleteConfigRequest,
  guildId?: string,
): AutoDeleteConfig {
  const id = resolveGuildId(guildId);
  ensureGuildRow(id);
  const current = getAutoDeleteConfig(id);

  const next: AutoDeleteConfig = {
    guildId: id,
    enabled: input.enabled ?? current.enabled,
    rules:
      input.rules !== undefined
        ? normalizeAutoDeleteRules(input.rules)
        : current.rules,
    updatedAt: new Date().toISOString(),
  };

  getDb()
    .insert(autoDeleteConfig)
    .values({
      guildId: id,
      enabled: next.enabled,
      rules: JSON.stringify(next.rules),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: autoDeleteConfig.guildId,
      set: {
        enabled: next.enabled,
        rules: JSON.stringify(next.rules),
        updatedAt: new Date(),
      },
    })
    .run();

  configCache.set(id, next);
  try {
    onConfigChanged?.(next);
  } catch (error) {
    console.warn("[adobos] auto-delete: onConfigChanged falló:", error);
  }
  return next;
}
