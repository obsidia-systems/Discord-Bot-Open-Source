/** Contratos GET/POST /api/bot/guild-profile — perfil del bot en el servidor. */

/** Tope de Discord para apodo de miembro. */
export const BOT_GUILD_NICKNAME_MAX = 32;

export type BotPresenceStatus = "online" | "idle" | "dnd" | "invisible";
export type BotActivityTypeName =
  | "Playing"
  | "Streaming"
  | "Listening"
  | "Watching"
  | "Competing"
  | "Custom";

export function parseBotPresenceStatus(raw: string): BotPresenceStatus {
  if (
    raw === "idle" ||
    raw === "dnd" ||
    raw === "invisible" ||
    raw === "online"
  ) {
    return raw;
  }
  return "online";
}

export function parseBotActivityType(raw: string): BotActivityTypeName {
  if (
    raw === "Playing" ||
    raw === "Streaming" ||
    raw === "Listening" ||
    raw === "Watching" ||
    raw === "Competing" ||
    raw === "Custom"
  ) {
    return raw;
  }
  return "Playing";
}

export function isBotGuildNicknameTooLong(raw: string): boolean {
  return raw.trim().length > BOT_GUILD_NICKNAME_MAX;
}

export interface BotGuildProfileResponse {
  guildId: string;
  guildName: string;
  /** Apodo local (vacío si no hay). */
  nickname: string;
  /** Nombre visible (apodo o username). */
  displayName: string;
  /** Username global (solo lectura / fallback). */
  username: string;
  tag: string;
  /** Avatar específico del servidor; null = usa el global. */
  serverAvatarURL: string | null;
  /** Avatar de la cuenta del bot. */
  globalAvatarURL: string;
  hasServerAvatar: boolean;
}

export interface UpdateBotGuildProfileRequest {
  /** Nuevo apodo; string vacío o null + clearNickname lo quita. */
  nickname?: string | null;
  clearNickname?: boolean;
  /**
   * URL http(s) o ruta pública `/uploads/...`.
   * Ignorado si llega archivo multipart `serverAvatar`.
   */
  serverAvatarUrl?: string | null;
  clearServerAvatar?: boolean;
}

export interface UpdateBotGuildProfileResponse {
  ok: true;
  message: string;
  profile: BotGuildProfileResponse;
  changed: {
    nickname: boolean;
    serverAvatar: boolean;
  };
}

/** @deprecated Preferir BotGuildProfileResponse (perfil por servidor). */
export type BotProfileResponse = BotGuildProfileResponse;
/** @deprecated Preferir UpdateBotGuildProfileResponse. */
export type UpdateBotProfileResponse = UpdateBotGuildProfileResponse;
