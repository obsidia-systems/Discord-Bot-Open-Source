export interface PanelUser {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  avatarUrl: string | null;
}

export interface ManagedGuild {
  id: string;
  name: string;
  icon: string | null;
  iconUrl: string | null;
  owner: boolean;
}

export interface GuildContext {
  guildId: string;
  userId: string;
  /** Stub hasta la capa de entitlements (Fase 3). */
  tier: "free" | "pro" | "business";
}

export interface StoredSession {
  id: string;
  userId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  accessTokenEnc: string;
  expiresAt: Date;
}

export const SESSION_COOKIE = "adobos_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const GUILD_CACHE_TTL_MS = 60 * 1000;

/** Bit ManageGuild de Discord. */
export const MANAGE_GUILD_BIT = 1n << 5n;
export const ADMINISTRATOR_BIT = 1n << 3n;
