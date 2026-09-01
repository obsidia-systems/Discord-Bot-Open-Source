export interface HealthResponse {
  status: "ok" | "degraded";
  uptime: number;
  botReady: boolean;
  timestamp: string;
}

/** Readiness: Postgres + Discord (Discord se omite si el proceso no es gateway). */
export interface ReadyResponse {
  status: "ok" | "degraded";
  postgres: boolean;
  discord: boolean | "skipped";
  timestamp: string;
}

export interface GuildSummary {
  id: string;
  name: string;
  memberCount: number;
  iconUrl: string | null;
}

export interface PanelMeUser {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
}

export interface PanelMeGuild {
  id: string;
  name: string;
  iconUrl: string | null;
  owner: boolean;
  /** El gateway tiene este servidor en caché (el bot ya está dentro). */
  botPresent: boolean;
}

export interface MeResponse {
  user: PanelMeUser;
  guilds: PanelMeGuild[];
  /** URL de Discord para añadir el bot (scope bot + applications.commands). */
  inviteUrl: string;
}

/**
 * Códigos que emite el kernel (auth, guild, entitlements, rate limit, mapper HTTP).
 * Los Lego pueden devolver otros; `ApiErrorBody.code` los admite como string.
 */
export const KERNEL_ERROR_CODES = [
  "UNAUTHENTICATED",
  "INVALID_GUILD_ID",
  "GUILD_FORBIDDEN",
  "GUILD_ACCESS_CHECK_FAILED",
  "MISSING_GUILD_CONTEXT",
  "DISCORD_RATE_LIMITED",
  "DISCORD_GUILDS_FAILED",
  "FEATURE_LOCKED",
  "LIMIT_EXCEEDED",
  "SEATS_EXCEEDED",
  "RATE_LIMITED",
  "NOT_FOUND",
  "INVALID_BODY",
  "INVALID_JSON",
  "FILE_TOO_LARGE",
  "INVALID_FILE",
  "STRIPE_INVALID_REQUEST",
  "INTERNAL_ERROR",
] as const;

export type ApiErrorCode = (typeof KERNEL_ERROR_CODES)[number];

export interface ApiErrorBody {
  error: string;
  /** Código del kernel o uno local del Lego. */
  code?: ApiErrorCode | (string & {});
  /** Problemas de validación zod (borde HTTP). */
  issues?: Array<{ path: Array<string | number>; message: string }>;
  feature?: string;
  limit?: string;
  tier?: string;
}

export interface GuildChannelAsset {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
}

export interface GuildEmojiAsset {
  id: string;
  name: string;
  animated: boolean;
  /** Formato Discord: <:name:id> o <a:name:id> */
  mention: string;
  url: string;
}

export interface GuildStickerAsset {
  id: string;
  name: string;
  description: string | null;
  format: string;
  url: string;
}

export interface GuildRoleAsset {
  id: string;
  name: string;
  /** Color entero de Discord (0 = sin color / default). */
  color: number;
  /** hexColor de discord.js (p. ej. `#99aab5`). */
  hexColor: string;
  position: number;
  managed: boolean;
  /** Rol nativo «Server Booster» de Discord. */
  premiumSubscriber?: boolean;
}

export interface GuildAssetsResponse {
  guildId: string;
  guildName: string;
  /** Icono del servidor (CDN), si existe. */
  iconUrl: string | null;
  channels: GuildChannelAsset[];
  emojis: GuildEmojiAsset[];
  stickers: GuildStickerAsset[];
  roles: GuildRoleAsset[];
}
