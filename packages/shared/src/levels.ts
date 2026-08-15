/** Contratos Rangos y XP — texto, voz, recompensas y clasificación. */

export interface LevelsReward {
  /** Id persistido; ausente en filas nuevas del dashboard. */
  id?: number;
  level: number;
  roleId: string;
}

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
  ignoredRoles: string[];
  ignoredChannels: string[];
  /** Canal opcional para anuncios de subida de nivel. */
  levelUpChannelId: string | null;
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
  ignoredRoles: string[];
  ignoredChannels: string[];
  levelUpChannelId: string | null;
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
    ignoredRoles: [],
    ignoredChannels: [],
    levelUpChannelId: null,
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
