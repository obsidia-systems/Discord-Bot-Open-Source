/** Contratos Auto-Delete — borrado automático por canal. */

export type AutoDeleteDelayUnit = "seconds" | "minutes" | "hours";

export type AutoDeleteFilterType = "all" | "bots_only" | "no_attachments";

/** Cuenta regresiva desde el envío vs limpieza a hora fija. */
export type AutoDeleteMode = "COUNTDOWN" | "SCHEDULED";

/** Día cron: 0 = Domingo … 6 = Sábado. */
export type AutoDeleteWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface AutoDeleteRule {
  channelId: string;
  mode: AutoDeleteMode;
  /** Solo modo COUNTDOWN. */
  delayValue: number;
  delayUnit: AutoDeleteDelayUnit;
  /** Solo modo SCHEDULED — hora 24h `HH:mm`. */
  scheduledTime: string;
  /**
   * Días de la semana (0=Dom … 6=Sáb).
   * Vacío = todos los días.
   */
  scheduledDays: AutoDeleteWeekday[];
  filterType: AutoDeleteFilterType;
}

export interface AutoDeleteConfig {
  guildId: string;
  /** Master switch del módulo. */
  enabled: boolean;
  rules: AutoDeleteRule[];
  /** Zona IANA del cron (modo SCHEDULED). */
  timezone: string;
  updatedAt: string;
}

export interface AutoDeleteConfigResponse {
  config: AutoDeleteConfig;
  /** Zona horaria del servidor usada por node-cron (modo SCHEDULED). */
  timezone: string;
}

export type UpdateAutoDeleteConfigRequest = Partial<{
  enabled: boolean;
  rules: AutoDeleteRule[];
  timezone: string;
}>;

export const AUTO_DELETE_DELAY_UNITS: AutoDeleteDelayUnit[] = [
  "seconds",
  "minutes",
  "hours",
];

export const AUTO_DELETE_FILTER_TYPES: AutoDeleteFilterType[] = [
  "all",
  "bots_only",
  "no_attachments",
];

export const AUTO_DELETE_MODES: AutoDeleteMode[] = ["COUNTDOWN", "SCHEDULED"];

/** Tope de reglas por guild. */
export const AUTO_DELETE_MAX_RULES = 25;

/** Tope de cuenta regresiva: 24 horas. */
export const AUTO_DELETE_MAX_COUNTDOWN_MS = 24 * 60 * 60 * 1000;

/** Discord no permite bulkDelete de mensajes más viejos. */
export const AUTO_DELETE_BULK_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export function defaultAutoDeleteConfig(guildId = ""): AutoDeleteConfig {
  return {
    guildId,
    enabled: false,
    rules: [],
    timezone: "UTC",
    updatedAt: new Date().toISOString(),
  };
}

export function delayToMs(value: number, unit: AutoDeleteDelayUnit): number {
  const n = Math.max(0, Number(value) || 0);
  if (unit === "minutes") return n * 60_000;
  if (unit === "hours") return n * 3_600_000;
  return n * 1_000;
}

/** Máximo numérico del input según unidad (≤ 24 h). */
export function maxCountdownValue(unit: AutoDeleteDelayUnit): number {
  if (unit === "hours") return 24;
  if (unit === "minutes") return 24 * 60;
  return 24 * 60 * 60;
}

export function clampCountdownDelay(
  value: number,
  unit: AutoDeleteDelayUnit,
): number {
  const max = maxCountdownValue(unit);
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return Math.min(60, max);
  return Math.max(1, Math.min(max, n));
}

export function normalizeAutoDeleteDelayUnit(
  value: unknown,
): AutoDeleteDelayUnit {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "minutes" || raw === "minutos" || raw === "m") return "minutes";
  if (raw === "hours" || raw === "horas" || raw === "h") return "hours";
  return "seconds";
}

export function normalizeAutoDeleteFilterType(
  value: unknown,
): AutoDeleteFilterType {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "bots_only" || raw === "bots" || raw === "solo_bots") {
    return "bots_only";
  }
  if (
    raw === "no_attachments" ||
    raw === "text_only" ||
    raw === "sin_adjuntos"
  ) {
    return "no_attachments";
  }
  return "all";
}

export function normalizeAutoDeleteMode(value: unknown): AutoDeleteMode {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();
  if (
    raw === "SCHEDULED" ||
    raw === "SCHEDULE" ||
    raw === "FIXED" ||
    raw === "HORA"
  ) {
    return "SCHEDULED";
  }
  return "COUNTDOWN";
}

/** Normaliza `HH:mm` (24h). Fallback 18:00. */
export function normalizeScheduledTime(value: unknown): string {
  const raw = String(value ?? "").trim();
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (!match) return "18:00";
  const hh = match[1]!.padStart(2, "0");
  const mm = match[2]!;
  return `${hh}:${mm}`;
}

/**
 * Normaliza días 0–6. Vacío / inválido → [] (todos los días).
 * Deduplica y ordena.
 */
export function normalizeScheduledDays(value: unknown): AutoDeleteWeekday[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<AutoDeleteWeekday>();
  for (const raw of value) {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 0 || n > 6) continue;
    seen.add(n as AutoDeleteWeekday);
  }
  return [...seen].sort((a, b) => a - b);
}

export interface AutoDeleteMessageSnapshot {
  pinned: boolean;
  authorIsBot: boolean;
  hasAttachments: boolean;
  createdTimestamp: number;
}

/** Filtro de qué mensajes borrar (anclados nunca). */
export function messageMatchesAutoDeleteFilter(
  message: AutoDeleteMessageSnapshot,
  filterType: AutoDeleteFilterType,
): boolean {
  if (message.pinned) return false;
  if (filterType === "bots_only" && !message.authorIsBot) return false;
  if (filterType === "no_attachments" && message.hasAttachments) return false;
  return true;
}

export function isOlderThanBulkWindow(
  createdTimestamp: number,
  now = Date.now(),
): boolean {
  return now - createdTimestamp > AUTO_DELETE_BULK_MAX_AGE_MS;
}

/** Regla del canal o del padre (hilo / foro). */
export function findAutoDeleteRule(
  rules: AutoDeleteRule[],
  channelId: string,
  parentId?: string | null,
): AutoDeleteRule | undefined {
  return rules.find(
    (rule) =>
      rule.channelId === channelId ||
      (Boolean(parentId) && rule.channelId === parentId),
  );
}
