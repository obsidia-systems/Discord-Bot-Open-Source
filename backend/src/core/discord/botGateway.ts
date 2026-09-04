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

/** Nombre/avatar frescos de un miembro (o del usuario global si no es miembro). */
export interface MemberProfile {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
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
  /** Un canal del guild. `null` si no existe o no pertenece a ese guild. */
  getChannel(
    guildId: string,
    channelId: string,
  ): Promise<ChannelSummary | null>;
  /** Borra un canal del guild. No-op si ya no existe. */
  deleteChannel(
    guildId: string,
    channelId: string,
    reason?: string,
  ): Promise<void>;
  /**
   * Nombre/avatar frescos de varios usuarios (precarga por lotes). Clave = userId.
   * Prioriza el perfil de servidor (apodo / avatar Nitro) cuando el usuario es
   * miembro del guild.
   */
  resolveMembers(
    guildId: string,
    userIds: string[],
  ): Promise<Map<string, MemberProfile>>;
}
