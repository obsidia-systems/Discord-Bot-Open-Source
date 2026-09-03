/** Contratos Levels — texto, voz, recompensas y clasificación. */

export interface LevelsReward {
  /** Id persistido; ausente en filas nuevas del dashboard. */
  id?: number;
  level: number;
  roleId: string;
}

/** Multiplicador de XP asociado a un rol. */
export interface LevelsRoleMultiplier {
  roleId: string;
  /** Factor (ej. 1.5 = +50% como bonus de 0.5 sobre la base). */
  multiplier: number;
}

/** Multiplicador de XP asociado a un canal (hot zone). */
export interface LevelsChannelMultiplier {
  channelId: string;
  /** Factor (ej. 2.0 = +100% bonus sobre la base). */
  multiplier: number;
}

/** El anuncio de nivel es siempre un embed. TEXT/IMAGE quedaron fuera. */
export type LevelsLevelUpFormat = "EMBED";

/** Techo de nivel (la curva cabe en integer 32-bit). */
export const LEVELS_MAX_LEVEL = 1000;

export interface LevelsConfig {
  guildId: string;
  /** Master switch del módulo. */
  enabled: boolean;
  textXpMin: number;
  textXpMax: number;
  cooldownSeconds: number;
  voiceEnabled: boolean;
  voiceXpPerMinute: number;
  /**
   * Bonus al transmitir pantalla en voz (1.0 = sin bonus).
   * Se suma como (streamMultiplier - 1) al total.
   */
  streamMultiplier: number;
  /** Multiplicador global de XP (texto y voz). Default 1. */
  xpMultiplier: number;
  /**
   * Multiplicadores por rol. Bonus = sum(mult - 1) de roles aplicables.
   */
  customMultipliers: LevelsRoleMultiplier[];
  /**
   * Multiplicadores por canal (texto/voz). Bonus = (mult - 1) del canal.
   */
  customChannelMultipliers: LevelsChannelMultiplier[];
  ignoredRoles: string[];
  ignoredChannels: string[];
  /** Canal opcional para anuncios de subida de nivel. */
  levelUpChannelId: string | null;
  /** Formato del anuncio de nivel. */
  levelUpFormat: LevelsLevelUpFormat;
  /**
   * Plantilla de la descripción. Tokens: {user} {username} {level} {server} {xp}.
   */
  levelUpMessage: string;
  /** Título del embed (formatos EMBED / IMAGE). */
  levelUpEmbedTitle: string;
  /** Color hex del embed (#RRGGBB). */
  levelUpEmbedColor: string;
  /** Mostrar avatar del usuario como thumbnail. */
  levelUpShowThumbnail: boolean;
  /** URL/ruta de imagen de fondo (formato IMAGE). */
  levelUpImage: string | null;
  /** Canal del mensaje de leaderboard en vivo (Top 10). */
  liveLeaderboardChannelId: string | null;
  /** Message ID del embed de leaderboard (editado por el bot). */
  liveLeaderboardMessageId: string | null;
  /** Título del embed de leaderboard. */
  leaderboardEmbedTitle: string;
  /** Descripción / intro del leaderboard (placeholders: {total}). */
  leaderboardEmbedDescription: string;
  /** Color hex del embed de leaderboard. */
  leaderboardEmbedColor: string;
  /** Thumbnail del bot/servidor en el leaderboard. */
  leaderboardShowThumbnail: boolean;
  rewards: LevelsReward[];
  updatedAt: string;
}

export interface LevelsConfigResponse {
  config: LevelsConfig;
}

export type UpdateLevelsConfigRequest = Partial<{
  enabled: boolean;
  textXpMin: number;
  textXpMax: number;
  cooldownSeconds: number;
  voiceEnabled: boolean;
  voiceXpPerMinute: number;
  streamMultiplier: number;
  xpMultiplier: number;
  customMultipliers: LevelsRoleMultiplier[];
  customChannelMultipliers: LevelsChannelMultiplier[];
  ignoredRoles: string[];
  ignoredChannels: string[];
  levelUpChannelId: string | null;
  levelUpFormat: LevelsLevelUpFormat;
  levelUpMessage: string;
  levelUpEmbedTitle: string;
  levelUpEmbedColor: string;
  levelUpShowThumbnail: boolean;
  levelUpImage: string | null;
  liveLeaderboardChannelId: string | null;
  leaderboardEmbedTitle: string;
  leaderboardEmbedDescription: string;
  leaderboardEmbedColor: string;
  leaderboardShowThumbnail: boolean;
  rewards: LevelsReward[];
}>;

export interface LevelsLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  xp: number;
}

export interface LevelsLeaderboardResponse {
  entries: LevelsLeaderboardEntry[];
  total: number;
}

/** Estadísticas personales para /rank. */
export interface LevelsUserRankStats {
  userId: string;
  xp: number;
  level: number;
  rank: number;
  /** XP total necesaria para el siguiente nivel. */
  xpForNextLevel: number;
  /** XP que faltan para el siguiente nivel. */
  xpRemaining: number;
  totalUsers: number;
}

export const DEFAULT_LEVEL_UP_MESSAGE =
  "Congratulations {user}! You've reached **Level {level}**.";

export const DEFAULT_LEVEL_UP_EMBED_TITLE = "Level Up!";
/** Color fijo del embed de subida de nivel. */
export const DEFAULT_LEVEL_UP_EMBED_COLOR = "#34E21D";
export const DEFAULT_LEADERBOARD_EMBED_TITLE = "🏆 Leaderboard";
/** Color fijo del embed de leaderboard en vivo. */
export const DEFAULT_LEADERBOARD_EMBED_COLOR = "#CA7AFF";

export function defaultLevelsConfig(guildId = ""): LevelsConfig {
  return {
    guildId,
    enabled: false,
    textXpMin: 15,
    textXpMax: 25,
    cooldownSeconds: 60,
    voiceEnabled: false,
    voiceXpPerMinute: 10,
    streamMultiplier: 1,
    xpMultiplier: 1,
    customMultipliers: [],
    customChannelMultipliers: [],
    ignoredRoles: [],
    ignoredChannels: [],
    levelUpChannelId: null,
    levelUpFormat: "EMBED",
    levelUpMessage: DEFAULT_LEVEL_UP_MESSAGE,
    levelUpEmbedTitle: DEFAULT_LEVEL_UP_EMBED_TITLE,
    levelUpEmbedColor: DEFAULT_LEVEL_UP_EMBED_COLOR,
    levelUpShowThumbnail: true,
    levelUpImage: null,
    liveLeaderboardChannelId: null,
    liveLeaderboardMessageId: null,
    leaderboardEmbedTitle: DEFAULT_LEADERBOARD_EMBED_TITLE,
    leaderboardEmbedDescription: "",
    leaderboardEmbedColor: DEFAULT_LEADERBOARD_EMBED_COLOR,
    leaderboardShowThumbnail: false,
    rewards: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * XP necesaria para subir del nivel `n` al `n + 1` (fórmula tipo Mee6).
 * `5 * n² + 50 * n + 100`
 */
export function xpToAdvanceFromLevel(level: number): number {
  const n = Math.max(0, Math.floor(Number(level) || 0));
  return 5 * n * n + 50 * n + 100;
}

/**
 * XP total exacta con la que inicia un nivel (suma acumulada).
 * Nivel 0 → 0.
 */
export function calculateBaseXPForLevel(level: number): number {
  const n = Math.max(0, Math.floor(Number(level) || 0));
  if (n <= 0) return 0;
  // Σ_{i=0}^{n-1} (5i² + 50i + 100)
  return (
    Math.floor((5 * n * (n - 1) * (2 * n - 1)) / 6) + 25 * n * (n - 1) + 100 * n
  );
}

/** Nivel correspondiente a una XP total. */
export function calculateLevel(totalXP: number): number {
  const xp = Math.max(0, Math.floor(Number(totalXP) || 0));
  let lo = 0;
  let hi = 32;
  while (calculateBaseXPForLevel(hi) <= xp) {
    hi *= 2;
    if (hi > LEVELS_MAX_LEVEL) {
      hi = LEVELS_MAX_LEVEL;
      break;
    }
  }
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (calculateBaseXPForLevel(mid) <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** @deprecated Preferir `calculateLevel`. */
export function levelFromXp(totalXp: number): number {
  return calculateLevel(totalXp);
}

/** @deprecated Preferir `calculateBaseXPForLevel`. */
export function xpForLevel(level: number): number {
  return calculateBaseXPForLevel(level);
}

export function normalizeLevelUpFormat(_value?: unknown): LevelsLevelUpFormat {
  return "EMBED";
}

export function clampLevelsLevel(level: number): number {
  const n = Math.floor(Number(level) || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, LEVELS_MAX_LEVEL);
}

export function clampLevelsXp(totalXp: number): number {
  const xp = Math.floor(Number(totalXp) || 0);
  if (!Number.isFinite(xp) || xp < 0) return 0;
  return Math.min(xp, calculateBaseXPForLevel(LEVELS_MAX_LEVEL));
}

/**
 * Multiplicador total de XP (aditivo sobre la base):
 * base + Σ(rol − 1) + (canal − 1) + (stream − 1 si streaming).
 * Ej. base 1, rol 1.5, canal 2.0 → 2.5x.
 */
export function resolveXpMultiplier(
  config: Pick<
    LevelsConfig,
    | "xpMultiplier"
    | "customMultipliers"
    | "customChannelMultipliers"
    | "streamMultiplier"
  >,
  roleIds: Iterable<string>,
  options?: { channelId?: string | null; streaming?: boolean },
): number {
  const base = Math.max(1, Math.round(Number(config.xpMultiplier) || 1));
  let total = base;

  const owned = new Set(roleIds);
  for (const entry of config.customMultipliers) {
    if (!owned.has(entry.roleId)) continue;
    total += entry.multiplier - 1;
  }

  const channelId = options?.channelId ?? null;
  if (channelId) {
    const channelEntry = config.customChannelMultipliers.find(
      (e) => e.channelId === channelId,
    );
    if (channelEntry) total += channelEntry.multiplier - 1;
  }

  if (options?.streaming) {
    const stream = Math.max(0.1, Number(config.streamMultiplier) || 1);
    total += stream - 1;
  }

  return Math.max(0, Math.round(total * 1000) / 1000);
}

/** Tokens más largos primero para no partir `{user}` dentro de `{username}`. */
export function applyLevelsTokens(
  input: string,
  replacements: Record<string, string>,
): string {
  if (!input) return input;
  const keys = Object.keys(replacements).sort((a, b) => b.length - a.length);
  let out = input;
  for (const key of keys) {
    if (!out.includes(key)) continue;
    out = out.split(key).join(replacements[key] ?? "");
  }
  return out;
}

export function levelsTemplatePingsUser(raw: string): boolean {
  return raw.includes("{user}");
}

export function buildLevelsTokenMap(input: {
  userId: string;
  username: string;
  level: number;
  serverName: string;
  xp: number;
}): Record<string, string> {
  return {
    "{username}": input.username,
    "{user}": `<@${input.userId}>`,
    "{level}": String(input.level),
    "{server}": input.serverName,
    "{xp}": String(input.xp),
  };
}

/** Normaliza color hex a `#RRGGBB` o fallback. */
export function normalizeEmbedColor(
  value: unknown,
  fallback = DEFAULT_LEVEL_UP_EMBED_COLOR,
): string {
  const raw = String(value ?? "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw.toUpperCase();
  if (/^[0-9A-Fa-f]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;
  return fallback;
}

/** Entero Discord.js a partir de hex. */
export function embedColorToInt(hex: string, fallback = 0xe11d48): number {
  const normalized = normalizeEmbedColor(hex);
  const n = Number.parseInt(normalized.slice(1), 16);
  return Number.isFinite(n) ? n : fallback;
}
