/** Contratos Starboard — tablón de mensajes con suficientes reacciones. */

import { normalizeAutoroleEmojiKey } from "./autoroles.js";

export const STARBOARD_DEFAULT_EMOJI = "unicode:⭐";
export const STARBOARD_DEFAULT_THRESHOLD = 3;
export const STARBOARD_THRESHOLD_MIN = 1;
export const STARBOARD_THRESHOLD_MAX = 100;
export const STARBOARD_EMOJIS_MAX = 10;
export const STARBOARD_IGNORE_CHANNELS_MAX = 50;

/** GuildText. */
export const STARBOARD_TEXT_CHANNEL_TYPE = 0;
/** GuildAnnouncement. */
export const STARBOARD_ANNOUNCE_CHANNEL_TYPE = 5;

export interface StarboardSettings {
  guildId: string;
  channelId: string | null;
  emojis: string[];
  threshold: number;
  enabled: boolean;
  allowSelfStar: boolean;
  allowBots: boolean;
  ignoreChannelIds: string[];
  updatedAt: string;
}

export interface StarboardPost {
  originalMessageId: string;
  guildId: string;
  channelId: string;
  starboardMessageId: string;
  starCount: number;
  updatedAt: string;
}

export interface StarboardConfigResponse {
  settings: StarboardSettings;
  postCount: number;
}

export interface UpdateStarboardSettingsRequest {
  channelId?: string | null;
  emojis?: string[];
  threshold?: number;
  enabled?: boolean;
  allowSelfStar?: boolean;
  allowBots?: boolean;
  ignoreChannelIds?: string[];
}

export type StarboardAction = "post" | "update" | "remove" | "noop";

export function isStarboardDestinationChannelType(type: number): boolean {
  return (
    type === STARBOARD_TEXT_CHANNEL_TYPE ||
    type === STARBOARD_ANNOUNCE_CHANNEL_TYPE
  );
}

export function clampStarboardThreshold(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : Number.NaN;
  if (!Number.isFinite(n)) return STARBOARD_DEFAULT_THRESHOLD;
  return Math.min(
    STARBOARD_THRESHOLD_MAX,
    Math.max(STARBOARD_THRESHOLD_MIN, Math.trunc(n)),
  );
}

export function normalizeStarboardEmojiKey(raw: string): string | null {
  try {
    const key = normalizeAutoroleEmojiKey(raw);
    if (key.startsWith("custom:")) {
      const id = key.slice("custom:".length);
      if (!/^\d{17,20}$/.test(id)) return null;
      return key;
    }
    if (key.startsWith("unicode:")) {
      const glyph = key.slice("unicode:".length).trim();
      if (!glyph || glyph.length > 32) return null;
      return `unicode:${glyph}`;
    }
    return null;
  } catch {
    return null;
  }
}

export function normalizeStarboardEmojis(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const key = normalizeStarboardEmojiKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= STARBOARD_EMOJIS_MAX) break;
  }
  return out.length > 0 ? out : [STARBOARD_DEFAULT_EMOJI];
}

export function normalizeIgnoreChannelIds(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!/^\d{17,20}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= STARBOARD_IGNORE_CHANNELS_MAX) break;
  }
  return out;
}

export function isConfiguredStarEmoji(
  emojiKey: string | null,
  configured: readonly string[],
): boolean {
  if (!emojiKey) return false;
  return configured.includes(emojiKey);
}

export function starboardHeaderEmoji(keys: readonly string[]): string {
  for (const key of keys) {
    if (key.startsWith("unicode:")) {
      const glyph = key.slice("unicode:".length);
      if (glyph) return glyph;
    }
  }
  return "⭐";
}

export function defaultStarboardSettings(guildId: string): StarboardSettings {
  return {
    guildId,
    channelId: null,
    emojis: [STARBOARD_DEFAULT_EMOJI],
    threshold: STARBOARD_DEFAULT_THRESHOLD,
    enabled: false,
    allowSelfStar: false,
    allowBots: false,
    ignoreChannelIds: [],
    updatedAt: new Date(0).toISOString(),
  };
}

export function shouldSkipStarboardSource(input: {
  enabled: boolean;
  destinationChannelId: string | null;
  sourceChannelId: string;
  ignoreChannelIds: readonly string[];
  authorIsBot: boolean;
  allowBots: boolean;
  sourceIsStarboardPost: boolean;
}): boolean {
  if (!input.enabled) return true;
  if (!input.destinationChannelId) return true;
  if (input.sourceIsStarboardPost) return true;
  if (input.sourceChannelId === input.destinationChannelId) return true;
  if (input.ignoreChannelIds.includes(input.sourceChannelId)) return true;
  if (input.authorIsBot && !input.allowBots) return true;
  return false;
}

export function countUniqueStarUsers(
  users: ReadonlyArray<{ id: string; bot: boolean }>,
  opts: { authorId: string; allowSelfStar: boolean; allowBots: boolean },
): number {
  const seen = new Set<string>();
  for (const user of users) {
    if (!opts.allowBots && user.bot) continue;
    if (!opts.allowSelfStar && user.id === opts.authorId) continue;
    if (!user.id) continue;
    seen.add(user.id);
  }
  return seen.size;
}

export function decideStarboardAction(input: {
  count: number;
  threshold: number;
  alreadyPosted: boolean;
}): StarboardAction {
  const threshold = clampStarboardThreshold(input.threshold);
  const count = Number.isFinite(input.count)
    ? Math.max(0, Math.trunc(input.count))
    : 0;
  if (count >= threshold) return input.alreadyPosted ? "update" : "post";
  if (input.alreadyPosted) return "remove";
  return "noop";
}
