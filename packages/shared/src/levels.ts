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
  /** Multiplicadores extra por rol (se usa el máximo aplicable). */
  customMultipliers: LevelsRoleMultiplier[];
  ignoredRoles: string[];
  ignoredChannels: string[];
  /** Canal opcional para anuncios de subida de nivel. */
  levelUpChannelId: string | null;
  /** Formato del anuncio de nivel. */
  levelUpFormat: LevelsLevelUpFormat;
  /**
   * Plantilla del mensaje. Placeholders: {user} {level} {server} {username}.
   */
  levelUpMessage: string;
  /** URL/ruta de imagen de fondo (formato IMAGE). */
  levelUpImage: string | null;
  /** Canal del mensaje de leaderboard en vivo (Top 10). */
  liveLeaderboardChannelId: string | null;
  /** Message ID del embed de leaderboard (editado por el bot). */
  liveLeaderboardMessageId: string | null;
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
  levelUpImage: string | null;
  liveLeaderboardChannelId: string | null;
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
  "🎉 {user} subió al **nivel {level}**!";

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
    levelUpFormat: "TEXT",
    levelUpMessage: DEFAULT_LEVEL_UP_MESSAGE,
    levelUpImage: null,
    liveLeaderboardChannelId: null,
    liveLeaderboardMessageId: null,
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

export function normalizeLevelUpFormat(value: unknown): LevelsLevelUpFormat {
  const v = String(value ?? "").toUpperCase();
  if (v === "EMBED" || v === "IMAGE" || v === "TEXT") return v;
  return "TEXT";
}
