import {
  isValidIanaTimezone,
  normalizeScheduledTimezone,
} from "@adobos/shared";

export { isValidIanaTimezone };

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

/** Normaliza zona IANA. Si es inválida → fallback (UTC). */
export function normalizeIanaTimezone(
  value: unknown,
  fallback = "UTC",
): string {
  return normalizeScheduledTimezone(value, fallback);
}

/** Normaliza `HH:mm` (24h). Fallback 12:00. */
export function normalizeClockTime(value: unknown, fallback = "12:00"): string {
  const raw = String(value ?? "").trim();
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (!match) return fallback;
  return `${match[1]!.padStart(2, "0")}:${match[2]!}`;
}

/**
 * Partes de reloj (hora `HH:mm` + día de semana) de una fecha vista desde una
 * zona IANA. `weekday`: 0=Dom … 6=Sáb. `stamp` (`YYYY-MM-DDTHH:mm` en esa zona)
 * sirve para de-duplicar un disparo por minuto.
 */
export function clockPartsInZone(
  timezone: string,
  at: Date,
): { hm: string; weekday: number; stamp: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(at);
  const pick = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hm = `${pick("hour")}:${pick("minute")}`;
  const stamp = `${pick("year")}-${pick("month")}-${pick("day")}T${hm}`;
  const weekdayIndex: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return { hm, weekday: weekdayIndex[pick("weekday")] ?? -1, stamp };
}

/**
 * ¿Toca una regla diaria `HH:mm` (con días opcionales) en el minuto que
 * describe `clock`? `days` vacío = todos los días. Reemplaza a `cron.schedule`
 * de node-cron para horarios diario/semanal.
 */
export function isDailyScheduleDue(
  scheduledTime: string,
  scheduledDays: number[],
  clock: { hm: string; weekday: number },
): boolean {
  const time = normalizeClockTime(scheduledTime, "");
  if (!time || time !== clock.hm) return false;
  if (scheduledDays.length === 0) return true;
  return scheduledDays.includes(clock.weekday);
}
