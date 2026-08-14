export type ModActionType =
  | "ban"
  | "kick"
  | "timeout"
  | "untimeout"
  | "warn"
  | "unban"
  | "purge"
  | "slowmode";

export const MOD_ACTION_TYPES: readonly ModActionType[] = [
  "ban",
  "kick",
  "timeout",
  "untimeout",
  "warn",
  "unban",
  "purge",
  "slowmode",
] as const;

export interface ModMemberSearchHit {
  id: string;
  username: string;
  /** Nombre global de Discord (puede ser null). */
  globalName: string | null;
  displayName: string;
  avatarUrl: string;
  bot: boolean;
}

export interface ModMemberSearchResponse {
  members: ModMemberSearchHit[];
}

export interface ModChannelSearchHit {
  id: string;
  name: string;
  type: number;
}

export interface ModChannelSearchResponse {
  channels: ModChannelSearchHit[];
}

export interface ModWarningItem {
  id: number;
  reason: string;
  moderatorId: string;
  createdAt: string;
}

export interface ModMemberInfoResponse {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  joinedAt: string | null;
  roles: Array<{ id: string; name: string; color: string | null }>;
  warnings: ModWarningItem[];
  timedOutUntil: string | null;
}

export interface ModChannelInfoResponse {
  id: string;
  name: string;
  type: number;
  slowmodeSeconds: number;
  topic: string | null;
  nsfw: boolean;
}

export interface ModActionRequest {
  action: ModActionType;
  guildId?: string;
  /** Miembro / usuario objetivo (ban, kick, timeout, warn, unban). */
  userId?: string;
  /** Canal objetivo (purge, slowmode). */
  channelId?: string;
  reason: string;
  /** Timeout duration en segundos. */
  durationSeconds?: number;
  /** Ban: borrar mensajes de los últimos N días (0–7). */
  deleteMessageDays?: number;
  /** Purge: cantidad 1–100. */
  purgeLimit?: number;
  /** Slowmode en segundos (0–21600). */
  slowmodeSeconds?: number;
  /** Notificación DM: none | text | template. Unban/Untimeout ignoran DM. */
  dmMode?: "none" | "text" | "template";
  /** Texto plano del DM si dmMode=text. */
  dmText?: string;
  /** ID de plantilla embed si dmMode=template. */
  templateId?: number;
}

export interface ModActionResponse {
  ok: true;
  action: ModActionType;
  message: string;
  /** true si el DM se envió. */
  dmSent?: boolean;
  /** true si se omitió el DM a propósito (unban / none). */
  dmSkipped?: boolean;
  /** true si la sanción se aplicó pero el DM falló (HTTP 206). */
  dmFailed?: boolean;
}

export interface ModActiveBanItem {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  reason: string | null;
}

export interface ModActiveBansResponse {
  bans: ModActiveBanItem[];
}

export interface ModActiveTimeoutItem {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  timedOutUntil: string;
  /** Segundos restantes (aprox.). */
  remainingSeconds: number;
}

export interface ModActiveTimeoutsResponse {
  timeouts: ModActiveTimeoutItem[];
}

/** Embed serializado para vista previa (mensaje existente). */
export interface ModFetchedMessageEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: string;
  authorName?: string;
  authorIconUrl?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  footerText?: string;
  footerIconUrl?: string;
  timestamp?: boolean;
}

export interface ModFetchedMessageAuthor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

/** Reacción presente en el mensaje (para autocompletar Paso 2). */
export interface ModFetchedMessageReaction {
  /** `unicode:❤️` o `custom:<snowflake>` */
  emojiKey: string;
  name: string | null;
  id: string | null;
  animated: boolean;
  imageUrl: string | null;
  count: number;
}

/** Respuesta de GET /api/mod/fetch-message */
export interface ModFetchedMessageResponse {
  id: string;
  channelId: string;
  content: string;
  embeds: ModFetchedMessageEmbed[];
  author: ModFetchedMessageAuthor;
  /** true si el autor es el bot conectado. */
  isBotAuthor: boolean;
  /** true si `messageId` ya está en `autoroles_registry`. */
  alreadyConfigured: boolean;
  reactions: ModFetchedMessageReaction[];
}
