/** Contratos Scheduled Messages (horario persistido + embeds). */

import type { EmbedPayload } from "./messages.js";

export type ScheduledFrequencyType =
  | "daily"
  | "weekly"
  | "monthly"
  | "specific_date"
  | "interval";

/** 0 = Domingo … 6 = Sábado. */
export type ScheduledWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const SCHEDULED_MIN_INTERVAL_MINUTES = 15;
export const SCHEDULED_MAX_INTERVAL_MINUTES = 10_080;
export const DEFAULT_SCHEDULED_INTERVAL_MINUTES = 120;

export interface ScheduledFrequency {
  type: ScheduledFrequencyType;
  /** Hora 24h `HH:mm`. Ignorada en `interval`. */
  time: string;
  /** Semanal: días seleccionados. Vacío = todos. */
  days: ScheduledWeekday[];
  /** Mensual: día del mes 1–31 (se clamp al último día civil). */
  dayOfMonth: number;
  /** Fecha específica: `YYYY-MM-DD`. */
  date: string;
  /**
   * Fecha específica: si true, se repite cada año (mismo día/mes).
   * Si false, solo el año de `date` y luego se desactiva.
   */
  repeatYearly: boolean;
  /** Mensual: dispara el último día civil del mes. */
  lastDayOfMonth: boolean;
  /** Intervalo: cada N minutos (≥ 15). */
  everyMinutes: number;
}

export interface ScheduledEmbedData {
  title: string;
  description: string;
  color: string;
  /** URL http(s) o ruta `/uploads/…`. */
  imageUrl: string | null;
}

export interface ScheduledMessage {
  id: number;
  guildId: string;
  channelId: string;
  /** Etiqueta corta para la lista (derivada del título). */
  label: string;
  /** Zona IANA del horario (ej. America/Mexico_City). */
  timezone: string;
  frequency: ScheduledFrequency;
  embedData: ScheduledEmbedData;
  /** Texto plano opcional (además del embed). */
  content: string;
  /** Rol a mencionar; `allowedMentions` por mensaje. */
  pingRoleId: string | null;
  isActive: boolean;
  /** Próximo (o due) envío persistido. */
  nextRunAt: string | null;
  lastSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledMessagesListResponse {
  messages: ScheduledMessage[];
}

export interface ScheduledMessageResponse {
  message: ScheduledMessage;
}

export type CreateScheduledMessageRequest = {
  channelId: string;
  timezone: string;
  frequency: ScheduledFrequency;
  embedData: ScheduledEmbedData;
  content?: string;
  pingRoleId?: string | null;
  isActive?: boolean;
};

export type UpdateScheduledMessageRequest = Partial<{
  channelId: string;
  timezone: string;
  frequency: ScheduledFrequency;
  embedData: ScheduledEmbedData;
  content: string;
  pingRoleId: string | null;
  isActive: boolean;
}>;

export const DEFAULT_SCHEDULED_EMBED_COLOR = "#5865F2";
export const DEFAULT_SCHEDULED_TIMEZONE = "UTC";

const SNOWFLAKE_RE = /^\d{17,20}$/;

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function defaultScheduledFrequency(): ScheduledFrequency {
  return {
    type: "daily",
    time: "12:00",
    days: [],
    dayOfMonth: 1,
    date: todayYmd(),
    repeatYearly: false,
    lastDayOfMonth: false,
    everyMinutes: DEFAULT_SCHEDULED_INTERVAL_MINUTES,
  };
}

export function defaultScheduledEmbedData(): ScheduledEmbedData {
  return {
    title: "Anuncio programado",
    description: "Escribe aquí el contenido del mensaje.",
    color: DEFAULT_SCHEDULED_EMBED_COLOR,
    imageUrl: null,
  };
}

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

export function normalizeScheduledTimezone(
  value: unknown,
  fallback = DEFAULT_SCHEDULED_TIMEZONE,
): string {
  const raw = String(value ?? "").trim();
  if (raw && isValidIanaTimezone(raw)) return raw;
  if (fallback && isValidIanaTimezone(fallback)) return fallback;
  return DEFAULT_SCHEDULED_TIMEZONE;
}

/** Zona del navegador / runtime, o UTC. */
export function detectLocalTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && isValidIanaTimezone(tz)) return tz;
  } catch {
    /* ignore */
  }
  return DEFAULT_SCHEDULED_TIMEZONE;
}

export function normalizeScheduledFrequencyType(
  value: unknown,
): ScheduledFrequencyType {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (raw === "weekly" || raw === "semanal") return "weekly";
  if (raw === "monthly" || raw === "mensual") return "monthly";
  if (
    raw === "specific_date" ||
    raw === "specificdate" ||
    raw === "fecha_especifica" ||
    raw === "fechaespecifica" ||
    raw === "once" ||
    raw === "one_shot"
  ) {
    return "specific_date";
  }
  if (
    raw === "interval" ||
    raw === "intervalo" ||
    raw === "every" ||
    raw === "bump"
  ) {
    return "interval";
  }
  return "daily";
}

export function normalizeScheduledWeekdays(value: unknown): ScheduledWeekday[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<ScheduledWeekday>();
  for (const raw of value) {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 0 || n > 6) continue;
    seen.add(n as ScheduledWeekday);
  }
  return [...seen].sort((a, b) => a - b);
}

export function normalizeScheduledClockTime(
  value: unknown,
  fallback = "12:00",
): string {
  const raw = String(value ?? "").trim();
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (!match) return fallback;
  return `${match[1]!.padStart(2, "0")}:${match[2]!}`;
}

/** Normaliza `YYYY-MM-DD`. Fallback = hoy (local). */
export function normalizeScheduledDate(
  value: unknown,
  fallback = todayYmd(),
): string {
  const raw = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return fallback;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    year < 1970 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return fallback;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function clampScheduledIntervalMinutes(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_SCHEDULED_INTERVAL_MINUTES;
  return Math.max(
    SCHEDULED_MIN_INTERVAL_MINUTES,
    Math.min(SCHEDULED_MAX_INTERVAL_MINUTES, n),
  );
}

export function normalizeScheduledFrequency(
  input: Partial<ScheduledFrequency> | undefined,
): ScheduledFrequency {
  const base = defaultScheduledFrequency();
  if (!input) return base;
  const type = normalizeScheduledFrequencyType(input.type ?? base.type);
  return {
    type,
    time: normalizeScheduledClockTime(input.time ?? base.time),
    days: normalizeScheduledWeekdays(input.days),
    dayOfMonth: Math.max(
      1,
      Math.min(31, Math.round(Number(input.dayOfMonth) || 1)),
    ),
    date: normalizeScheduledDate(input.date ?? base.date),
    repeatYearly: Boolean(input.repeatYearly),
    lastDayOfMonth: Boolean(input.lastDayOfMonth),
    everyMinutes: clampScheduledIntervalMinutes(
      input.everyMinutes ?? base.everyMinutes,
    ),
  };
}

export function normalizeScheduledContent(value: unknown): string {
  return String(value ?? "")
    .trim()
    .slice(0, 2000);
}

export function normalizeScheduledPingRoleId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const id = String(value).trim();
  if (!SNOWFLAKE_RE.test(id)) return null;
  return id;
}

function normalizeMediaRef(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("/uploads/")) return raw.slice(0, 500);
  if (/^https?:\/\//i.test(raw)) return raw.slice(0, 500);
  return null;
}

export function normalizeScheduledEmbedData(
  input: Partial<ScheduledEmbedData> | undefined,
): ScheduledEmbedData {
  const base = defaultScheduledEmbedData();
  if (!input) return base;
  const colorRaw = String(input.color ?? base.color).trim();
  let color = DEFAULT_SCHEDULED_EMBED_COLOR;
  if (/^#[0-9A-Fa-f]{6}$/.test(colorRaw)) color = colorRaw.toUpperCase();
  else if (/^[0-9A-Fa-f]{6}$/.test(colorRaw))
    color = `#${colorRaw.toUpperCase()}`;

  return {
    title:
      String(input.title ?? base.title)
        .trim()
        .slice(0, 256) || base.title,
    description: String(input.description ?? base.description)
      .trim()
      .slice(0, 4000),
    color,
    imageUrl: normalizeMediaRef(input.imageUrl),
  };
}

/** Mapea una plantilla de embed al mini-formulario del programador. */
export function embedPayloadToScheduledEmbedData(
  payload: EmbedPayload | undefined,
): ScheduledEmbedData {
  if (!payload) return defaultScheduledEmbedData();
  return normalizeScheduledEmbedData({
    title: payload.title?.trim() || defaultScheduledEmbedData().title,
    description:
      payload.description?.trim() || defaultScheduledEmbedData().description,
    color: payload.color,
    imageUrl: payload.imageUrl ?? null,
  });
}

const WEEKDAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function formatIntervalSummary(everyMinutes: number): string {
  const n = clampScheduledIntervalMinutes(everyMinutes);
  if (n % 60 === 0) {
    const hours = n / 60;
    return hours === 1 ? "Cada hora" : `Cada ${hours} horas`;
  }
  return `Cada ${n} minutos`;
}

/** Resumen legible del horario para la lista del dashboard. */
export function formatScheduledFrequencySummary(
  frequency: ScheduledFrequency,
  timezone?: string,
): string {
  const time = frequency.time || "12:00";
  let base: string;
  if (frequency.type === "interval") {
    base = formatIntervalSummary(frequency.everyMinutes);
  } else if (frequency.type === "daily") {
    base = `Todos los días a las ${time}`;
  } else if (frequency.type === "monthly") {
    base = frequency.lastDayOfMonth
      ? `El último día de cada mes a las ${time}`
      : `El día ${frequency.dayOfMonth} de cada mes a las ${time}`;
  } else if (frequency.type === "specific_date") {
    const date = frequency.date || "—";
    base = frequency.repeatYearly
      ? `Cada año el ${date.slice(5)} a las ${time}`
      : `El ${date} a las ${time} (una vez)`;
  } else {
    const days = frequency.days ?? [];
    if (days.length === 0) {
      base = `Todos los días a las ${time}`;
    } else {
      const labels = days.map((d) => WEEKDAY_SHORT[d] ?? String(d)).join(", ");
      base = `${labels} a las ${time}`;
    }
  }
  if (timezone?.trim()) return `${base} (${timezone.trim()})`;
  return base;
}

/** Año civil en una zona IANA. */
export function getCalendarYearInTimezone(
  timezone: string,
  at: Date = new Date(),
): number {
  return zonedDateParts(at, timezone).year;
}

export function isScheduledOneShot(frequency: ScheduledFrequency): boolean {
  return frequency.type === "specific_date" && !frequency.repeatYearly;
}

interface CivilParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: ScheduledWeekday;
}

const WEEKDAY_PREFIX = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function parseClock(time: string): { hour: number; minute: number } {
  const normalized = normalizeScheduledClockTime(time);
  const [hourRaw, minuteRaw] = normalized.split(":");
  return { hour: Number(hourRaw), minute: Number(minuteRaw) };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addCivilDays(
  year: number,
  month: number,
  day: number,
  delta: number,
): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

function tzOffsetMs(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/** Instante UTC de una fecha civil en una zona IANA. */
export function zonedCivilToUtc(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const tz = normalizeScheduledTimezone(timezone);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset1 = tzOffsetMs(new Date(utcGuess), tz);
  let instant = new Date(utcGuess - offset1);
  const offset2 = tzOffsetMs(instant, tz);
  if (offset2 !== offset1) {
    instant = new Date(utcGuess - offset2);
  }
  return instant;
}

export function zonedDateParts(at: Date, timezone: string): CivilParts {
  const tz = normalizeScheduledTimezone(timezone);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? "";
    const weekdayRaw = get("weekday").toLowerCase();
    const weekdayIndex = WEEKDAY_PREFIX.findIndex((prefix) =>
      weekdayRaw.startsWith(prefix),
    );
    return {
      year: Number(get("year")),
      month: Number(get("month")),
      day: Number(get("day")),
      hour: Number(get("hour")),
      minute: Number(get("minute")),
      second: Number(get("second")),
      weekday: (weekdayIndex >= 0 ? weekdayIndex : 0) as ScheduledWeekday,
    };
  } catch {
    return {
      year: at.getUTCFullYear(),
      month: at.getUTCMonth() + 1,
      day: at.getUTCDate(),
      hour: at.getUTCHours(),
      minute: at.getUTCMinutes(),
      second: at.getUTCSeconds(),
      weekday: at.getUTCDay() as ScheduledWeekday,
    };
  }
}

function monthlyDay(
  year: number,
  month: number,
  frequency: ScheduledFrequency,
): number {
  const last = daysInMonth(year, month);
  if (frequency.lastDayOfMonth) return last;
  return Math.min(Math.max(1, frequency.dayOfMonth), last);
}

function fireAtCivil(
  timezone: string,
  year: number,
  month: number,
  day: number,
  time: string,
): Date {
  const { hour, minute } = parseClock(time);
  return zonedCivilToUtc(timezone, year, month, day, hour, minute);
}

function nextDaily(from: Date, timezone: string, time: string): Date {
  const p = zonedDateParts(from, timezone);
  const today = fireAtCivil(timezone, p.year, p.month, p.day, time);
  if (today.getTime() > from.getTime()) return today;
  const n = addCivilDays(p.year, p.month, p.day, 1);
  return fireAtCivil(timezone, n.year, n.month, n.day, time);
}

function prevDaily(from: Date, timezone: string, time: string): Date {
  const p = zonedDateParts(from, timezone);
  const today = fireAtCivil(timezone, p.year, p.month, p.day, time);
  if (today.getTime() <= from.getTime()) return today;
  const n = addCivilDays(p.year, p.month, p.day, -1);
  return fireAtCivil(timezone, n.year, n.month, n.day, time);
}

function matchesWeekly(
  weekday: ScheduledWeekday,
  days: ScheduledWeekday[],
): boolean {
  return days.length === 0 || days.includes(weekday);
}

function nextWeekly(
  from: Date,
  timezone: string,
  time: string,
  days: ScheduledWeekday[],
): Date {
  if (days.length === 0) return nextDaily(from, timezone, time);
  const p = zonedDateParts(from, timezone);
  for (let i = 0; i <= 7; i++) {
    const civil = addCivilDays(p.year, p.month, p.day, i);
    const fire = fireAtCivil(
      timezone,
      civil.year,
      civil.month,
      civil.day,
      time,
    );
    const weekday = zonedDateParts(fire, timezone).weekday;
    if (matchesWeekly(weekday, days) && fire.getTime() > from.getTime()) {
      return fire;
    }
  }
  const fallback = addCivilDays(p.year, p.month, p.day, 7);
  return fireAtCivil(
    timezone,
    fallback.year,
    fallback.month,
    fallback.day,
    time,
  );
}

function prevWeekly(
  from: Date,
  timezone: string,
  time: string,
  days: ScheduledWeekday[],
): Date {
  if (days.length === 0) return prevDaily(from, timezone, time);
  const p = zonedDateParts(from, timezone);
  for (let i = 0; i <= 7; i++) {
    const civil = addCivilDays(p.year, p.month, p.day, -i);
    const fire = fireAtCivil(
      timezone,
      civil.year,
      civil.month,
      civil.day,
      time,
    );
    const weekday = zonedDateParts(fire, timezone).weekday;
    if (matchesWeekly(weekday, days) && fire.getTime() <= from.getTime()) {
      return fire;
    }
  }
  const fallback = addCivilDays(p.year, p.month, p.day, -7);
  return fireAtCivil(
    timezone,
    fallback.year,
    fallback.month,
    fallback.day,
    time,
  );
}

function monthlyFire(
  timezone: string,
  year: number,
  month: number,
  frequency: ScheduledFrequency,
): Date {
  return fireAtCivil(
    timezone,
    year,
    month,
    monthlyDay(year, month, frequency),
    frequency.time,
  );
}

function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const raw = month - 1 + delta;
  const y = year + Math.floor(raw / 12);
  const m = ((raw % 12) + 12) % 12;
  return { year: y, month: m + 1 };
}

function nextMonthly(
  from: Date,
  timezone: string,
  frequency: ScheduledFrequency,
): Date {
  const p = zonedDateParts(from, timezone);
  const thisMonth = monthlyFire(timezone, p.year, p.month, frequency);
  if (thisMonth.getTime() > from.getTime()) return thisMonth;
  const n = shiftMonth(p.year, p.month, 1);
  return monthlyFire(timezone, n.year, n.month, frequency);
}

function prevMonthly(
  from: Date,
  timezone: string,
  frequency: ScheduledFrequency,
): Date {
  const p = zonedDateParts(from, timezone);
  const thisMonth = monthlyFire(timezone, p.year, p.month, frequency);
  if (thisMonth.getTime() <= from.getTime()) return thisMonth;
  const n = shiftMonth(p.year, p.month, -1);
  return monthlyFire(timezone, n.year, n.month, frequency);
}

function parseYmd(date: string): { year: number; month: number; day: number } {
  const normalized = normalizeScheduledDate(date);
  return {
    year: Number(normalized.slice(0, 4)),
    month: Number(normalized.slice(5, 7)),
    day: Number(normalized.slice(8, 10)),
  };
}

function yearlyFire(
  timezone: string,
  year: number,
  frequency: ScheduledFrequency,
): Date {
  const { month, day } = parseYmd(frequency.date);
  const clamped = Math.min(day, daysInMonth(year, month));
  return fireAtCivil(timezone, year, month, clamped, frequency.time);
}

function nextSpecific(
  from: Date,
  timezone: string,
  frequency: ScheduledFrequency,
): Date | null {
  if (!frequency.repeatYearly) {
    const { year, month, day } = parseYmd(frequency.date);
    const fire = fireAtCivil(timezone, year, month, day, frequency.time);
    return fire.getTime() > from.getTime() ? fire : null;
  }
  const p = zonedDateParts(from, timezone);
  const thisYear = yearlyFire(timezone, p.year, frequency);
  if (thisYear.getTime() > from.getTime()) return thisYear;
  return yearlyFire(timezone, p.year + 1, frequency);
}

function prevSpecific(
  from: Date,
  timezone: string,
  frequency: ScheduledFrequency,
): Date | null {
  if (!frequency.repeatYearly) {
    const { year, month, day } = parseYmd(frequency.date);
    const fire = fireAtCivil(timezone, year, month, day, frequency.time);
    return fire.getTime() <= from.getTime() ? fire : null;
  }
  const p = zonedDateParts(from, timezone);
  const thisYear = yearlyFire(timezone, p.year, frequency);
  if (thisYear.getTime() <= from.getTime()) return thisYear;
  return yearlyFire(timezone, p.year - 1, frequency);
}

function upcomingRunAt(
  frequency: ScheduledFrequency,
  timezone: string,
  from: Date,
): Date | null {
  const tz = normalizeScheduledTimezone(timezone);
  switch (frequency.type) {
    case "interval":
      return null;
    case "daily":
      return nextDaily(from, tz, frequency.time);
    case "weekly":
      return nextWeekly(from, tz, frequency.time, frequency.days);
    case "monthly":
      return nextMonthly(from, tz, frequency);
    case "specific_date":
      return nextSpecific(from, tz, frequency);
    default:
      return nextDaily(from, tz, frequency.time);
  }
}

function previousRunAt(
  frequency: ScheduledFrequency,
  timezone: string,
  from: Date,
): Date | null {
  const tz = normalizeScheduledTimezone(timezone);
  switch (frequency.type) {
    case "interval":
      return null;
    case "daily":
      return prevDaily(from, tz, frequency.time);
    case "weekly":
      return prevWeekly(from, tz, frequency.time, frequency.days);
    case "monthly":
      return prevMonthly(from, tz, frequency);
    case "specific_date":
      return prevSpecific(from, tz, frequency);
    default:
      return prevDaily(from, tz, frequency.time);
  }
}

/**
 * Próximo envío a persistir. Si hay un tick civil ya vencido y no hay
 * `lastSentAt` posterior, devuelve ese instante (catch-up de un due).
 * Intervalo: ahora si nunca se envió; si no, lastSent + N minutos.
 */
export function computeNextRunAt(
  frequency: ScheduledFrequency,
  timezone: string,
  from: Date,
  lastSentAt?: Date | null,
): Date | null {
  const freq = normalizeScheduledFrequency(frequency);
  const tz = normalizeScheduledTimezone(timezone);
  if (freq.type === "interval") {
    const stepMs = clampScheduledIntervalMinutes(freq.everyMinutes) * 60_000;
    if (!lastSentAt) return from;
    return new Date(lastSentAt.getTime() + stepMs);
  }
  const previous = previousRunAt(freq, tz, from);
  if (
    previous &&
    (lastSentAt == null || lastSentAt.getTime() < previous.getTime())
  ) {
    return previous;
  }
  return upcomingRunAt(freq, tz, from);
}
