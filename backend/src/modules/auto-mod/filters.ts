import type { AutoModFilterKey, AutoModFilters } from "@adobos/shared";
import { AUTO_MOD_FILTER_LABELS } from "@adobos/shared";
import { BoundedTtlMap } from "#core/cache/boundedTtlMap.js";

export interface AutoModHit {
  key: AutoModFilterKey;
  label: string;
}

/** Combining marks típicos de Zalgo. */
const ZALGO_RE =
  // biome-ignore lint/suspicious/noMisleadingCharacterClass: detectar marcas combinantes sueltas es justo el objetivo (spam Zalgo).
  /[\u0300-\u036f\u0489\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g;

const URL_RE =
  /https?:\/\/[^\s<>\]]+|discord\.gg\/[^\s<>\]]+|www\.[^\s<>\]]+/gi;

/** CDN / media de adjuntos nativos de Discord (no deben detonar Anti-Links). */
const DISCORD_ATTACHMENT_HOST_RE =
  /^(?:cdn\.discordapp\.com|media\.discordapp\.net|images-ext-\d+\.discordapp\.net|cdn\.discord\.com)$/i;

const spamBuckets = new BoundedTtlMap<string, number[]>(20_000, 15_000);
const repeatBuckets = new BoundedTtlMap<
  string,
  { content: string; count: number; at: number }
>(20_000, 30_000);

const SPAM_WINDOW_MS = 4_000;
const SPAM_THRESHOLD = 5;
const REPEAT_WINDOW_MS = 12_000;
const REPEAT_THRESHOLD = 3;

function hit(key: AutoModFilterKey): AutoModHit {
  return { key, label: AUTO_MOD_FILTER_LABELS[key] };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ZERO_WIDTH_RE = /[\u200B-\u200D\u2060\uFEFF\u00AD\u180E]/g;
const SPOILER_RE = /\|\|([\s\S]*?)\|\|/g;
const CYRILLIC_LOOKALIKES: Record<string, string> = {
  "\u0430": "a",
  "\u0441": "c",
  "\u0435": "e",
  "\u043E": "o",
  "\u0440": "p",
  "\u0445": "x",
  "\u0456": "i",
};

/** Quita spoilers y zero-width. No toca combining marks (zalgo usa el original). */
export function normalizeFilterText(content: string): string {
  return content.replace(SPOILER_RE, "$1").replace(ZERO_WIDTH_RE, "");
}

/** Solo para anti-invites: leet + homoglifos cirílicos habituales. */
export function deobfuscateInviteText(content: string): string {
  return normalizeFilterText(content)
    .toLowerCase()
    .replace(/[\u0430\u0441\u0435\u043E\u0440\u0445\u0456]/g, (ch) => {
      return CYRILLIC_LOOKALIKES[ch] ?? ch;
    })
    .replace(/0/g, "o")
    .replace(/[1!]/g, "i")
    .replace(/3/g, "e");
}

function normalizeUrlCandidate(raw: string): { host: string; full: string } {
  const full = raw
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const host = full.split("/")[0] ?? full;
  return { host, full };
}

function isDiscordAttachmentUrl(
  host: string,
  full: string,
  excludeUrls: Set<string>,
): boolean {
  if (DISCORD_ATTACHMENT_HOST_RE.test(host)) return true;
  if (excludeUrls.has(full) || excludeUrls.has(`https://${full}`)) return true;
  for (const excluded of excludeUrls) {
    const n = excluded
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    if (full === n || full.startsWith(`${n}?`) || full.startsWith(`${n}/`)) {
      return true;
    }
  }
  return false;
}

export function detectZalgo(content: string): boolean {
  const marks = content.match(ZALGO_RE)?.length ?? 0;
  if (marks < 6) return false;
  const letters = content.replace(/\s/g, "").length || 1;
  return marks / letters > 0.25 || marks >= 12;
}

export function detectExcessCaps(
  content: string,
  percentage = 70,
  minLength = 8,
): boolean {
  const pct = clamp(percentage, 1, 100) / 100;
  const min = clamp(Math.round(minLength), 1, 500);
  const letters = content.replace(/[^a-zA-ZÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  if (letters.length < min) return false;
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, "").length;
  return upper / letters.length >= pct;
}

export function detectBannedWords(
  content: string,
  bannedWords: string[],
): boolean {
  const words = bannedWords.map((w) => w.trim()).filter(Boolean);
  if (words.length === 0) return false;
  const hay = content.toLowerCase();
  return words.some((word) => {
    const needle = word.toLowerCase();
    if (needle.length < 2) return false;
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

export function detectAntiLinks(
  content: string,
  allowedLinks: string[],
  excludeUrls: string[] = [],
): boolean {
  const matches = content.match(URL_RE);
  if (!matches || matches.length === 0) return false;

  const excludeSet = new Set(
    excludeUrls.map((u) => u.trim().toLowerCase()).filter(Boolean),
  );

  const allow = allowedLinks
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, ""),
    );

  for (const raw of matches) {
    const { host, full } = normalizeUrlCandidate(raw);
    if (isDiscordAttachmentUrl(host, full, excludeSet)) continue;

    const ok = allow.some(
      (entry) =>
        host === entry || host.endsWith(`.${entry}`) || full.startsWith(entry),
    );
    if (!ok) return true;
  }
  return false;
}

export function detectAntiInvites(content: string): boolean {
  return /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg\/|(?:ptb\.|canary\.)?discord(?:app)?\.com\/invite\/|discord\.new\/)[^\s<>\]]+/i.test(
    content,
  );
}

export function detectTextFlood(
  content: string,
  maxChars = 800,
  maxLines = 6,
): boolean {
  const chars = clamp(Math.round(maxChars), 50, 4000);
  const maxNewlines = clamp(Math.round(maxLines), 1, 100);
  if (content.length > chars) return true;
  // Saltos de línea = partes - 1 (alineado al umbral del dashboard).
  const newlineCount = content.split(/\r?\n/).length - 1;
  return newlineCount > maxNewlines;
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
  if (
    !prev ||
    now - prev.at > REPEAT_WINDOW_MS ||
    prev.content !== normalized
  ) {
    repeatBuckets.set(key, { content: normalized, count: 1, at: now });
    return false;
  }
  const count = prev.count + 1;
  repeatBuckets.set(key, { content: normalized, count, at: now });
  return count >= REPEAT_THRESHOLD;
}

/**
 * Evalúa filtros activos. Un solo hit por mensaje.
 * Prioridad: Links → Palabras → Mayúsculas/Zalgo → Flood → Spam/menciones.
 * Sin texto aún evalúa menciones y ráfaga (adjuntos / stickers).
 */
export function evaluateAutoModFilters(input: {
  filters: AutoModFilters;
  content: string;
  mentionCount: number;
  guildId: string;
  userId: string;
  /** URLs de message.attachments a ignorar en Anti-Links. */
  attachmentUrls?: string[];
}): AutoModHit | null {
  const {
    filters,
    content,
    mentionCount,
    guildId,
    userId,
    attachmentUrls = [],
  } = input;
  const hasText = content.length > 0;
  const normalized = hasText ? normalizeFilterText(content) : content;
  const inviteHay = hasText ? deobfuscateInviteText(content) : content;

  if (hasText) {
    // 1) Links
    if (filters.antiInvites && detectAntiInvites(inviteHay)) {
      return hit("antiInvites");
    }
    if (
      filters.antiLinks &&
      detectAntiLinks(normalized, filters.allowedLinks, attachmentUrls)
    ) {
      return hit("antiLinks");
    }

    // 2) Palabras
    if (
      filters.bannedWordsEnabled &&
      detectBannedWords(normalized, filters.bannedWords)
    ) {
      return hit("bannedWords");
    }

    // 3) Mayúsculas / Zalgo (zalgo mira el original: combining marks)
    if (
      filters.excessCaps &&
      detectExcessCaps(
        normalized,
        filters.capsPercentage,
        filters.capsMinLength,
      )
    ) {
      return hit("excessCaps");
    }
    if (filters.zalgo && detectZalgo(content)) return hit("zalgo");

    // 4) Muros de texto
    if (
      filters.textFlood &&
      detectTextFlood(normalized, filters.floodMaxChars, filters.floodMaxLines)
    ) {
      return hit("textFlood");
    }
  }

  // 5) Spam / menciones (también sin texto: adjuntos, stickers)
  if (
    filters.mentionSpam &&
    detectMentionSpam(mentionCount, filters.mentionSpamLimit)
  ) {
    return hit("mentionSpam");
  }
  if (filters.messageSpam && trackMessageSpam(guildId, userId)) {
    return hit("messageSpam");
  }
  if (
    hasText &&
    filters.repeatedText &&
    trackRepeatedText(guildId, userId, normalized)
  ) {
    return hit("repeatedText");
  }
  return null;
}
