import type { AutoModFilters, AutoModFilterKey } from "@adobos/shared";
import { AUTO_MOD_FILTER_LABELS } from "@adobos/shared";

export interface AutoModHit {
  key: AutoModFilterKey;
  label: string;
}

/** Combining marks típicos de Zalgo. */
const ZALGO_RE = /[\u0300-\u036f\u0489\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g;

const URL_RE =
  /https?:\/\/[^\s<>\]]+|discord\.gg\/[^\s<>\]]+|www\.[^\s<>\]]+/gi;

const spamBuckets = new Map<string, number[]>();
const repeatBuckets = new Map<string, { content: string; count: number; at: number }>();

const SPAM_WINDOW_MS = 4_000;
const SPAM_THRESHOLD = 5;
const REPEAT_WINDOW_MS = 12_000;
const REPEAT_THRESHOLD = 3;

function normalizeLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function hit(key: AutoModFilterKey): AutoModHit {
  return { key, label: AUTO_MOD_FILTER_LABELS[key] };
}

export function detectZalgo(content: string): boolean {
  const marks = content.match(ZALGO_RE)?.length ?? 0;
  if (marks < 6) return false;
  const letters = content.replace(/\s/g, "").length || 1;
  return marks / letters > 0.25 || marks >= 12;
}

export function detectExcessCaps(content: string): boolean {
  const letters = content.replace(/[^a-zA-ZÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  if (letters.length < 8) return false;
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, "").length;
  return upper / letters.length >= 0.7;
}

export function detectBannedWords(
  content: string,
  bannedWordsRaw: string,
): boolean {
  const words = normalizeLines(bannedWordsRaw);
  if (words.length === 0) return false;
  const hay = content.toLowerCase();
  return words.some((word) => {
    const needle = word.toLowerCase();
    if (needle.length < 2) return false;
    // Palabra completa si es alfanumérica simple; si no, substring.
    if (/^[\wáéíóúüñ]+$/i.test(needle)) {
      const re = new RegExp(
        `(^|[^\\wáéíóúüñ])${escapeRegExp(needle)}([^\\wáéíóúüñ]|$)`,
        "i",
      );
      return re.test(content);
    }
    return hay.includes(needle);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function detectAntiLinks(
  content: string,
  allowedLinksRaw: string,
): boolean {
  const matches = content.match(URL_RE);
  if (!matches || matches.length === 0) return false;

  const allow = normalizeLines(allowedLinksRaw).map((line) =>
    line.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, ""),
  );

  for (const raw of matches) {
    const normalized = raw
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    const host = normalized.split("/")[0] ?? normalized;
    const ok = allow.some(
      (entry) =>
        host === entry ||
        host.endsWith(`.${entry}`) ||
        normalized.startsWith(entry),
    );
    if (!ok) return true;
  }
  return false;
}

export function detectMentionSpam(
  mentionCount: number,
  limit: number,
): boolean {
  return mentionCount > Math.max(1, limit);
}

export function trackMessageSpam(
  guildId: string,
  userId: string,
  now = Date.now(),
): boolean {
  const key = `${guildId}:${userId}`;
  const prev = spamBuckets.get(key) ?? [];
  const next = prev.filter((t) => now - t < SPAM_WINDOW_MS);
  next.push(now);
  spamBuckets.set(key, next);
  return next.length >= SPAM_THRESHOLD;
}

export function trackRepeatedText(
  guildId: string,
  userId: string,
  content: string,
  now = Date.now(),
): boolean {
  const normalized = content.trim().toLowerCase();
  if (normalized.length < 3) return false;
  const key = `${guildId}:${userId}`;
  const prev = repeatBuckets.get(key);
  if (!prev || now - prev.at > REPEAT_WINDOW_MS || prev.content !== normalized) {
    repeatBuckets.set(key, { content: normalized, count: 1, at: now });
    return false;
  }
  const count = prev.count + 1;
  repeatBuckets.set(key, { content: normalized, count, at: now });
  return count >= REPEAT_THRESHOLD;
}

/**
 * Evalúa filtros activos en orden. Retorna el primer hit o null.
 */
export function evaluateAutoModFilters(input: {
  filters: AutoModFilters;
  content: string;
  mentionCount: number;
  guildId: string;
  userId: string;
}): AutoModHit | null {
  const { filters, content, mentionCount, guildId, userId } = input;
  if (!content && mentionCount === 0) return null;

  if (filters.zalgo && detectZalgo(content)) return hit("zalgo");
  if (filters.excessCaps && detectExcessCaps(content)) return hit("excessCaps");
  if (
    filters.bannedWords &&
    detectBannedWords(content, filters.bannedWords)
  ) {
    return hit("bannedWords");
  }
  if (filters.antiLinks && detectAntiLinks(content, filters.allowedLinks)) {
    return hit("antiLinks");
  }
  if (
    filters.mentionSpam &&
    detectMentionSpam(mentionCount, filters.mentionSpamLimit)
  ) {
    return hit("mentionSpam");
  }
  if (filters.messageSpam && trackMessageSpam(guildId, userId)) {
    return hit("messageSpam");
  }
  if (filters.repeatedText && trackRepeatedText(guildId, userId, content)) {
    return hit("repeatedText");
  }
  return null;
}
