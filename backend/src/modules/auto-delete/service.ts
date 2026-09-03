import type {
  AutoDeleteConfig,
  AutoDeleteRule,
  UpdateAutoDeleteConfigRequest,
} from "@adobos/shared";
import {
  AUTO_DELETE_MAX_RULES,
  defaultAutoDeleteConfig,
  clampCountdownDelay,
  normalizeAutoDeleteDelayUnit,
  normalizeAutoDeleteFilterType,
  normalizeAutoDeleteMode,
  normalizeScheduledDays,
  normalizeScheduledTime,
  normalizeScheduledTimezone,
} from "@adobos/shared";
import { eq } from "drizzle-orm";
import { getDb, one } from "../../db/client.js";
import { autoDeleteConfig, guildSettings } from "../../db/schema.js";
import { BoundedTtlMap } from "../../core/cache/boundedTtlMap.js";
import { logger } from "../../core/log.js";
import { prunePendingForConfig } from "./pending.js";

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

const configCache = new BoundedTtlMap<string, AutoDeleteConfig>(5_000, 60_000);

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
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new AutoDeleteError(
      "Missing guildId.",
      400,
      "MISSING_GUILD_ID",
    );
  }
  return id;
}

async function ensureGuildRow(guildId: string): Promise<void> {
  const existing = await one(getDb()
    .select({ guildId: guildSettings.guildId })
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId))
    .limit(1));
  if (!existing) {
    await getDb()
      .insert(guildSettings)
      .values({
        guildId,
        prefix: "!",
        welcomeEnabled: false,
        updatedAt: new Date(),
      })
      ;
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
    if (out.length >= AUTO_DELETE_MAX_RULES) break;
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
    timezone: normalizeScheduledTimezone(row.timezone),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export function invalidateAutoDeleteConfigCache(guildId?: string): void {
  if (guildId) configCache.delete(guildId);
  else configCache.clear();
}

export async function getAutoDeleteConfig(guildId?: string): Promise<AutoDeleteConfig> {
  const id = resolveGuildId(guildId);
  await ensureGuildRow(id);
  const row = await one(getDb()
    .select()
    .from(autoDeleteConfig)
    .where(eq(autoDeleteConfig.guildId, id))
    .limit(1));
  const config = await rowToConfig(id, row);
  configCache.set(id, config);
  return config;
}

/** Lectura rápida para messageCreate (sin I/O si hay caché). */
export async function getAutoDeleteConfigCached(guildId: string): Promise<AutoDeleteConfig> {
  const cached = configCache.get(guildId);
  if (cached) return cached;
  try {
    return await getAutoDeleteConfig(guildId);
  } catch {
    return defaultAutoDeleteConfig(guildId);
  }
}

/** Todas las configs guardadas (para rehidratar crons al arranque). */
export async function listAllAutoDeleteConfigs(): Promise<AutoDeleteConfig[]> {
  const rows = await getDb().select().from(autoDeleteConfig);
  return rows.map((row) => {
    const config = rowToConfig(row.guildId, row);
    configCache.set(row.guildId, config);
    return config;
  });
}

export async function updateAutoDeleteConfig(
  input: UpdateAutoDeleteConfigRequest,
  guildId?: string,
): Promise<AutoDeleteConfig> {
  const id = resolveGuildId(guildId);
  await ensureGuildRow(id);
  const current = await getAutoDeleteConfig(id);

  const next: AutoDeleteConfig = {
    guildId: id,
    enabled: input.enabled ?? current.enabled,
    rules:
      input.rules !== undefined
        ? normalizeAutoDeleteRules(input.rules)
        : current.rules,
    timezone: normalizeScheduledTimezone(
      input.timezone ?? current.timezone,
    ),
    updatedAt: new Date().toISOString(),
  };

  await getDb()
    .insert(autoDeleteConfig)
    .values({
      guildId: id,
      enabled: next.enabled,
      rules: JSON.stringify(next.rules),
      timezone: next.timezone,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: autoDeleteConfig.guildId,
      set: {
        enabled: next.enabled,
        rules: JSON.stringify(next.rules),
        timezone: next.timezone,
        updatedAt: new Date(),
      },
    })
    ;

  configCache.set(id, next);
  try {
    onConfigChanged?.(next);
  } catch (error) {
    logger.warn({ err: error }, "auto-delete: onConfigChanged failed:");
  }
  try {
    await prunePendingForConfig(next);
  } catch (error) {
    logger.warn({ err: error }, "auto-delete: prune pending failed:");
  }
  return next;
}
