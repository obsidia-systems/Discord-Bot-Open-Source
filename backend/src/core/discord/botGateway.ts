/**
 * Puerto entre el panel HTTP y Discord. Las rutas hablan con este contrato en
 * vez de con el `Client` de discord.js, para que el rol `api` pueda servir sin
 * un gateway vivo (adaptador REST) mientras `all` / `gateway` usan el Client
 * (`LocalClientGateway`). Devuelve **datos planos** — ningún tipo discord.js
 * cruza la frontera.
 *
 * Se amplía por oleadas: hoy cubre las lecturas de guild-assets.
 */

export interface GuildSummary {
  id: string;
  name: string;
  iconUrl: string | null;
  /** Rol de "booster" del guild, si existe. */
  boosterRoleId: string | null;
}

export interface ChannelSummary {
  id: string;
  name: string;
  /** `ChannelType` numérico de discord-api-types. */
  type: number;
  parentId: string | null;
  position: number;
}

export interface RoleSummary {
  id: string;
  name: string;
  color: number;
  hexColor: string;
  position: number;
  managed: boolean;
}

export interface EmojiSummary {
  id: string;
  name: string;
  animated: boolean;
  url: string;
}

export interface StickerSummary {
  id: string;
  name: string;
  description: string | null;
  format: string;
  url: string;
}

export interface BotGateway {
  /** El gateway/Client está conectado. El adaptador REST devuelve siempre true. */
  isReady(): boolean;
  /** `null` si el bot no está en ese guild (o aún no está cacheado). */
  getGuild(guildId: string): Promise<GuildSummary | null>;
  listChannels(guildId: string): Promise<ChannelSummary[]>;
  listRoles(guildId: string): Promise<RoleSummary[]>;
  listEmojis(guildId: string): Promise<EmojiSummary[]>;
  listStickers(guildId: string): Promise<StickerSummary[]>;
}
