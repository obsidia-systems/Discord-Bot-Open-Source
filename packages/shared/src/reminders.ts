/** Contratos Reminders — avisos personales (no son anuncios de canal). */

import {
  addCivilDays,
  normalizeScheduledTimezone,
  zonedCivilToUtc,
  zonedDateParts,
} from "./scheduled-messages.js";

export const REMIND_TEXT_MAX = 1000;
export const REMIND_MIN_SECONDS = 60;
export const REMIND_MAX_SECONDS = 365 * 24 * 60 * 60;
export const REMIND_PER_USER_MAX = 25;
export const REMIND_PER_GUILD_MAX = 200;
export const REMIND_MAX_ATTEMPTS = 5;
export const REMIND_BUTTON_CANCEL_PREFIX = "rmd_x_";

export interface ReminderSettings {
  guildId: string;
  timezone: string;
  enabled: boolean;
  updatedAt: string;
}

export interface Reminder {
  id: number;
  guildId: string;
  userId: string;
  channelId: string;
  message: string;
  dueAt: string;
  attempts: number;
  createdAt: string;
}

export interface RemindersConfigResponse {
  settings: ReminderSettings;
  reminders: Reminder[];
}

export interface UpdateReminderSettingsRequest {
  timezone?: string;
  enabled?: boolean;
}

const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  seg: 1,
  segs: 1,
  segundo: 1,
  segundos: 1,
  second: 1,
  seconds: 1,
  m: 60,
  min: 60,
  mins: 60,
  minuto: 60,
  minutos: 60,
  minute: 60,
  minutes: 60,
  h: 3600,
  hora: 3600,
  horas: 3600,
  hour: 3600,
  hours: 3600,
  d: 86400,
  dia: 86400,
  dias: 86400,
  días: 86400,
  day: 86400,
  days: 86400,
  w: 604800,
  sem: 604800,
  semana: 604800,
  semanas: 604800,
  week: 604800,
  weeks: 604800,
};

export function sanitizeRemindText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, REMIND_TEXT_MAX);
}

export function parseRemindDurationSeconds(raw: string): number | null {
  const compact = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!compact) return null;
  const token =
    /(\d+)(semanas?|semana|sem|weeks?|week|w|días|dias|dia|days?|day|d|horas?|hora|hours?|hour|h|minutos?|minuto|mins?|minutes?|minute|min|m|segundos?|segundo|segs?|seconds?|second|seg|s)?/g;
  let total = 0;
  let consumed = 0;
  let match = token.exec(compact);
  while (match) {
    if (match.index !== consumed) return null;
    const amount = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isFinite(amount) || amount < 1) return null;
    const unit = match[2] ?? "m";
    const factor = UNIT_SECONDS[unit];
    if (!factor) return null;
    total += amount * factor;
    consumed = match.index + match[0].length;
    match = token.exec(compact);
  }
  if (consumed !== compact.length || total < 1) return null;
  return total;
}

export function dueFromDurationSeconds(
  seconds: number,
  now: Date,
): Date | null {
  if (!Number.isFinite(seconds)) return null;
  const n = Math.trunc(seconds);
  if (n < REMIND_MIN_SECONDS || n > REMIND_MAX_SECONDS) return null;
  return new Date(now.getTime() + n * 1000);
}

function parseClockHm(raw: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const hour = Number.parseInt(match[1] ?? "", 10);
  const minute = Number.parseInt(match[2] ?? "", 10);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function unixToDate(raw: string): Date | null {
  const discord = /^<t:(\d{10,16})(?::[a-zA-Z])?>$/.exec(raw.trim());
  const digits = discord?.[1] ?? /^(\d{10,13})$/.exec(raw.trim())?.[1];
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = digits.length > 11 ? n : n * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `cuando` civil en TZ, unix o etiqueta Discord `<t:>`. */
export function parseRemindWhen(
  raw: string,
  timezone: string,
  now: Date,
): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const unix = unixToDate(trimmed);
  if (unix) return unix;

  const tz = normalizeScheduledTimezone(timezone);
  const iso =
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      trimmed,
    );
  if (iso) {
    const year = Number.parseInt(iso[1] ?? "", 10);
    const month = Number.parseInt(iso[2] ?? "", 10);
    const day = Number.parseInt(iso[3] ?? "", 10);
    const hour = iso[4] ? Number.parseInt(iso[4], 10) : 9;
    const minute = iso[5] ? Number.parseInt(iso[5], 10) : 0;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    if (hour > 23 || minute > 59) return null;
    return zonedCivilToUtc(tz, year, month, day, hour, minute);
  }

  const clock = parseClockHm(trimmed);
  if (clock) {
    const parts = zonedDateParts(now, tz);
    let fire = zonedCivilToUtc(
      tz,
      parts.year,
      parts.month,
      parts.day,
      clock.hour,
      clock.minute,
    );
    if (fire.getTime() <= now.getTime()) {
      const next = addCivilDays(parts.year, parts.month, parts.day, 1);
      fire = zonedCivilToUtc(
        tz,
        next.year,
        next.month,
        next.day,
        clock.hour,
        clock.minute,
      );
    }
    return fire;
  }

  return null;
}

export function assertRemindDueInRange(
  due: Date,
  now: Date,
): "ok" | "too_soon" | "too_far" {
  const delta = Math.round((due.getTime() - now.getTime()) / 1000);
  if (delta < REMIND_MIN_SECONDS) return "too_soon";
  if (delta > REMIND_MAX_SECONDS) return "too_far";
  return "ok";
}

export function formatRemindDiscordStamp(due: Date): string {
  const unix = Math.floor(due.getTime() / 1000);
  return `<t:${unix}:F> · <t:${unix}:R>`;
}

const SUB = 1;
const STRING = 3;
const INTEGER = 4;

function sub(
  name: string,
  description: string,
  options: Array<Record<string, unknown>> = [],
): Record<string, unknown> {
  return {
    type: SUB,
    name,
    description: description.slice(0, 100),
    ...(options.length ? { options } : {}),
  };
}

/** Cuerpo REST de `/remind` (subcomandos). El PUT global lo incluye. */
export function remindersSlashCommandBody(): {
  name: string;
  description: string;
  options: Array<Record<string, unknown>>;
} {
  return {
    name: "remind",
    description: "Recordatorio personal (Reminders).",
    options: [
      sub("in", "Te aviso dentro de un rato.", [
        {
          type: STRING,
          name: "cuando",
          description: "Ej. 20m, 2h, 1d12h, 1w.",
          required: true,
          max_length: 32,
        },
        {
          type: STRING,
          name: "texto",
          description: "Qué te tengo que recordar.",
          required: true,
          max_length: REMIND_TEXT_MAX,
        },
      ]),
      sub("at", "Te aviso a una hora (zona del servidor).", [
        {
          type: STRING,
          name: "cuando",
          description: "15:00, 2026-09-03 18:30 o <t:…>.",
          required: true,
          max_length: 64,
        },
        {
          type: STRING,
          name: "texto",
          description: "Qué te tengo que recordar.",
          required: true,
          max_length: REMIND_TEXT_MAX,
        },
      ]),
      sub("list", "Lista tus recordatorios pendientes."),
      sub("cancel", "Cancela un recordatorio tuyo.", [
        {
          type: INTEGER,
          name: "id",
          description: "El número que sale en /remind list.",
          required: true,
          min_value: 1,
        },
      ]),
    ],
  };
}
