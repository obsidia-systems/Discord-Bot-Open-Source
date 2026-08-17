/**
 * Zona horaria del scheduler (cron) — fallback global (auto-delete, etc.).
 * Prioridad: SCHEDULER_TZ → AUTO_DELETE_TZ → TZ → zona del proceso.
 */
export function resolveSchedulerTimezone(): string {
  const fromEnv =
    process.env.SCHEDULER_TZ?.trim() ||
    process.env.AUTO_DELETE_TZ?.trim() ||
    process.env.TZ?.trim();
  if (fromEnv && isValidIanaTimezone(fromEnv)) return fromEnv;
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && isValidIanaTimezone(detected)) return detected;
  } catch {
    /* ignore */
  }
  return "UTC";
}

/** Valida IANA time zone para node-cron / Intl. */
export function isValidIanaTimezone(value: string): boolean {
  const raw = value.trim();
  if (!raw || raw.length > 64) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: raw });
    return true;
  } catch {
    return false;
  }
}

/**
 * Normaliza zona IANA. Si es inválida → fallback (UTC o detectada).
 */
export function normalizeIanaTimezone(
  value: unknown,
  fallback = "UTC",
): string {
  const raw = String(value ?? "").trim();
  if (raw && isValidIanaTimezone(raw)) return raw;
  if (fallback && isValidIanaTimezone(fallback)) return fallback;
  return "UTC";
}

/** Normaliza `HH:mm` (24h). Fallback 12:00. */
export function normalizeClockTime(
  value: unknown,
  fallback = "12:00",
): string {
  const raw = String(value ?? "").trim();
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (!match) return fallback;
  return `${match[1]!.padStart(2, "0")}:${match[2]!}`;
}

/**
 * Cron diario/semanal: `m h * * dow`.
 * Días vacíos → todos (`*`). 0=Dom … 6=Sáb.
 */
export function timeAndDaysToCron(
  time: string,
  days: number[] = [],
): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const uniqueDays = [
    ...new Set(
      days
        .map((d) => Math.round(Number(d)))
        .filter((d) => Number.isFinite(d) && d >= 0 && d <= 6),
    ),
  ].sort((a, b) => a - b);
  const dow = uniqueDays.length === 0 ? "*" : uniqueDays.join(",");
  return `${minute} ${hour} * * ${dow}`;
}

/**
 * Cron mensual: `m h day * *` (día del mes 1–31).
 */
export function timeAndMonthDayToCron(
  time: string,
  dayOfMonth: number,
): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const day = Math.max(1, Math.min(31, Math.round(Number(dayOfMonth) || 1)));
  return `${minute} ${hour} ${day} * *`;
}

/**
 * Cron fecha específica: `m h day month *` (se dispara cada año ese día/mes).
 * El filtrado por año (one-shot) se hace en el tick del job.
 */
export function timeAndSpecificDateToCron(
  time: string,
  dateYmd: string,
): string | null {
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd.trim());
  if (!timeMatch || !dateMatch) return null;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${minute} ${hour} ${day} ${month} *`;
}
