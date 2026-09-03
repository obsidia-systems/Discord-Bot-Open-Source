import type { AutoModFilterKey } from "@adobos/shared";

/** Nombres fijos: el upsert encuentra las reglas nuestras, no las del servidor. */
export const ADOBOS_NATIVE_RULE_NAMES = {
  bannedWords: "Adobos · Words",
  antiInvites: "Adobos · Invites",
  mentionSpam: "Adobos · Mentions",
} as const;

/**
 * Pre-1c-B Spanish names. The native sync still recognises rules created under
 * these names, adopts them, and renames them to the current English name in
 * place, so guilds synced before the rename don't end up with orphaned rules.
 */
export const ADOBOS_NATIVE_RULE_LEGACY_NAMES: Record<string, AutoModFilterKey> = {
  "Adobos · Palabras": "bannedWords",
  "Adobos · Invitaciones": "antiInvites",
  "Adobos · Menciones": "mentionSpam",
};

export const ADOBOS_NATIVE_RULE_PREFIX = "Adobos · ";

/** Tope de Discord: keyword_filter 60 caracteres. */
export const DISCORD_KEYWORD_MAX_LENGTH = 60;
export const DISCORD_KEYWORD_MAX_ITEMS = 1000;
export const DISCORD_EXEMPT_ROLES_MAX = 20;
export const DISCORD_EXEMPT_CHANNELS_MAX = 50;

const NATIVE_NAME_TO_KEY: Record<string, AutoModFilterKey> = {
  [ADOBOS_NATIVE_RULE_NAMES.bannedWords]: "bannedWords",
  [ADOBOS_NATIVE_RULE_NAMES.antiInvites]: "antiInvites",
  [ADOBOS_NATIVE_RULE_NAMES.mentionSpam]: "mentionSpam",
  ...ADOBOS_NATIVE_RULE_LEGACY_NAMES,
};

export function nativeRuleKeyFromName(name: string): AutoModFilterKey | null {
  return NATIVE_NAME_TO_KEY[name] ?? null;
}

/** Palabras para KEYWORD nativo (palabra entera, ≤60 chars). */
export function toDiscordKeywordFilter(words: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of words) {
    const word = raw.trim().slice(0, DISCORD_KEYWORD_MAX_LENGTH);
    if (word.length < 2) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
    if (out.length >= DISCORD_KEYWORD_MAX_ITEMS) break;
  }
  return out;
}

/**
 * Regex Rust-flavored para AutoMod nativo (sin lookaround, ≤260 chars).
 * El bot sigue cubriendo ofuscación (ZW, spoilers, leet) en messageCreate.
 */
export function discordInviteRegexPatterns(): string[] {
  return [
    String.raw`discord\.gg/\S+`,
    String.raw`discord\.com/invite/\S+`,
    String.raw`discordapp\.com/invite/\S+`,
    String.raw`ptb\.discord\.com/invite/\S+`,
    String.raw`canary\.discord\.com/invite/\S+`,
    String.raw`discord\.new/\S+`,
  ];
}

export function sliceExemptIds(ids: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}
