/** Contratos GET/POST /api/bot/profile */

export type BotPresenceStatus = "online" | "idle" | "dnd" | "invisible";

export type BotActivityTypeName =
  | "Playing"
  | "Streaming"
  | "Listening"
  | "Watching"
  | "Competing"
  | "Custom";

export interface BotProfileActivity {
  name: string;
  type: BotActivityTypeName;
  /** Solo aplica a Streaming (Twitch / YouTube). */
  url: string | null;
  /** Línea extra bajo el nombre de actividad (opcional). */
  state: string | null;
}

export interface BotProfileResponse {
  id: string;
  username: string;
  tag: string;
  avatarUrl: string;
  /** Banner real del bot (solo lectura); null si no tiene. */
  bannerUrl: string | null;
  /** Color de acento Discord (decimal) si existe. */
  accentColor: number | null;
  status: BotPresenceStatus;
  activity: BotProfileActivity | null;
  /** Para enlace al Developer Portal. */
  applicationId: string | null;
}

/**
 * Campos del formulario (JSON o multipart fields).
 * El avatar opcional va como archivo `avatar` en multipart.
 */
export interface UpdateBotProfileRequest {
  username?: string;
  status?: BotPresenceStatus;
  activityType?: BotActivityTypeName;
  activityName?: string;
  streamUrl?: string;
  state?: string;
  /** Si true, limpia actividades (solo status). */
  clearActivity?: boolean;
}

export interface UpdateBotProfileResponse {
  ok: true;
  profile: BotProfileResponse;
  changed: {
    username: boolean;
    avatar: boolean;
    presence: boolean;
  };
}

export const BOT_PRESENCE_STATUSES: readonly BotPresenceStatus[] = [
  "online",
  "idle",
  "dnd",
  "invisible",
] as const;

export const BOT_ACTIVITY_TYPES: readonly BotActivityTypeName[] = [
  "Playing",
  "Watching",
  "Listening",
  "Competing",
  "Streaming",
  "Custom",
] as const;
