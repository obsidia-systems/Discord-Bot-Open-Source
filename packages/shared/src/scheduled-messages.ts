/** Contratos Mensajes programados (cron + embeds). */

import type { EmbedPayload } from "./messages.js";

export type ScheduledFrequencyType =
  | "daily"
  | "weekly"
  | "monthly"
  | "specific_date";

/** 0 = Domingo … 6 = Sábado (node-cron). */
export type ScheduledWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ScheduledFrequency {
  type: ScheduledFrequencyType;
  /** Hora 24h `HH:mm`. */
  time: string;
  /** Semanal: días seleccionados. Vacío = todos. */
  days: ScheduledWeekday[];
  /** Mensual: día del mes 1–31. */
  dayOfMonth: number;
  /** Fecha específica: `YYYY-MM-DD`. */
  date: string;
  /**
   * Fecha específica: si true, se repite cada año (mismo día/mes).
   * Si false, solo el año de `date` y luego se desactiva.
   * Default: false.
   */
  repeatYearly: boolean;
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
  /** Zona IANA del cron (ej. America/Mexico_City). */
  timezone: string;
  frequency: ScheduledFrequency;
  embedData: ScheduledEmbedData;
  isActive: boolean;
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
  isActive?: boolean;
};

export type UpdateScheduledMessageRequest = Partial<{
  channelId: string;
  timezone: string;
  frequency: ScheduledFrequency;
  embedData: ScheduledEmbedData;
  isActive: boolean;
}>;

export const DEFAULT_SCHEDULED_EMBED_COLOR = "#5865F2";
export const DEFAULT_SCHEDULED_TIMEZONE = "UTC";

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
  const raw = String(value ?? "").trim().toLowerCase().replace(/-/g, "_");
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
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return fallback;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
    /** Default false para no spamear en años posteriores. */
    repeatYearly: Boolean(input.repeatYearly),
  };
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
  else if (/^[0-9A-Fa-f]{6}$/.test(colorRaw)) color = `#${colorRaw.toUpperCase()}`;

  return {
    title: String(input.title ?? base.title).trim().slice(0, 256) || base.title,
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

/** Resumen legible del horario para la lista del dashboard. */
export function formatScheduledFrequencySummary(
  frequency: ScheduledFrequency,
  timezone?: string,
): string {
  const time = frequency.time || "12:00";
  let base: string;
  if (frequency.type === "daily") {
    base = `Todos los días a las ${time}`;
  } else if (frequency.type === "monthly") {
    base = `El día ${frequency.dayOfMonth} de cada mes a las ${time}`;
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
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
    }).formatToParts(at);
    const year = Number(parts.find((p) => p.type === "year")?.value);
    if (Number.isFinite(year)) return year;
  } catch {
    /* ignore */
  }
  return at.getUTCFullYear();
}
