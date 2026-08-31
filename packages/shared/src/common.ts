export interface HealthResponse {
  status: "ok" | "degraded";
  uptime: number;
  botReady: boolean;
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
}

export interface MeResponse {
  user: PanelMeUser;
  guilds: PanelMeGuild[];
}

export interface ApiErrorBody {
  error: string;
  code?: string;
  /** Problemas de validación zod (borde HTTP). */
  issues?: Array<{ path: Array<string | number>; message: string }>;
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
