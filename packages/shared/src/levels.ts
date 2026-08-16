/** Contratos Rangos y XP — texto, voz, recompensas y clasificación. */

export interface LevelsReward {
  /** Id persistido; ausente en filas nuevas del dashboard. */
  id?: number;
  level: number;
  roleId: string;
}

/** Multiplicador de XP asociado a un rol. */
export interface LevelsRoleMultiplier {
  roleId: string;
  /** Factor (ej. 1.5 = +50%). */
  multiplier: number;
}

export type LevelsLevelUpFormat = "TEXT" | "EMBED" | "IMAGE";

export interface LevelsConfig {
  guildId: string;
  /** Master switch del módulo. */
  enabled: boolean;
  textXpMin: number;
  textXpMax: number;
  cooldownSeconds: number;
  voiceEnabled: boolean;
  voiceXpPerMinute: number;
  /** Multiplicador global de XP (texto y voz). Default 1. */
  xpMultiplier: number;
  /** Multiplicadores extra por rol (se suman si el miembro tiene varios). */
  customMultipliers: LevelsRoleMultiplier[];
  ignoredRoles: string[];
  ignoredChannels: string[];
  /** Canal opcional para anuncios de subida de nivel. */
  levelUpChannelId: string | null;
  /** Formato del anuncio de nivel. */
  levelUpFormat: LevelsLevelUpFormat;
  /**
   * Plantilla del mensaje / descripción. Placeholders: {user} {level} {server} {username} {xp}.
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
  xpMultiplier: number;
  customMultipliers: LevelsRoleMultiplier[];
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
  "¡Felicidades {user}! Has alcanzado el **Nivel {level}**.";

export const DEFAULT_LEVEL_UP_EMBED_TITLE = "¡Subida de Nivel!";
/** Color fijo del embed de subida de nivel. */
export const DEFAULT_LEVEL_UP_EMBED_COLOR = "#34E21D";
export const DEFAULT_LEADERBOARD_EMBED_TITLE = "🏆 Tabla de Clasificación";
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
    xpMultiplier: 1,
    customMultipliers: [],
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

/** Nivel a partir de XP total: floor(0.1 * sqrt(totalXp)). */
export function levelFromXp(totalXp: number): number {
  const xp = Math.max(0, Math.floor(Number(totalXp) || 0));
  return Math.floor(0.1 * Math.sqrt(xp));
}

/**
 * XP mínima para alcanzar un nivel L (inverso de levelFromXp).
 * level = floor(0.1 * sqrt(xp)) ⇒ xp >= (L * 10)^2
 */
export function xpForLevel(level: number): number {
  const l = Math.max(0, Math.floor(Number(level) || 0));
  return (l * 10) ** 2;
}

export function normalizeLevelUpFormat(_value?: unknown): LevelsLevelUpFormat {
  return "EMBED";
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
