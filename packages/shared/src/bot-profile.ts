/** Contratos GET/POST /api/bot/guild-profile — perfil del bot en el servidor. */

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
