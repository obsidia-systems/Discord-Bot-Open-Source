import type { Client, Guild } from "discord.js";
import type {
  BotGateway,
  ChannelSummary,
  EmojiSummary,
  GuildSummary,
  RoleSummary,
  StickerSummary,
} from "./botGateway.js";

/**
 * Adaptador de `BotGateway` sobre el `Client` vivo de discord.js.
 * Lo usan los roles `all` y `gateway`, que sí tienen gateway conectado.
 * Comportamiento idéntico al acceso directo previo (`bot.guilds.cache`…).
 */
export class LocalClientGateway implements BotGateway {
  constructor(private readonly client: Client) {}

  isReady(): boolean {
    return this.client.isReady();
  }

  private guild(guildId: string): Guild | null {
    return this.client.guilds.cache.get(guildId) ?? null;
  }

  async getGuild(guildId: string): Promise<GuildSummary | null> {
    const guild = this.guild(guildId);
    if (!guild) return null;
    return {
      id: guild.id,
      name: guild.name,
      iconUrl: guild.iconURL({ size: 256 }),
      boosterRoleId: guild.roles.premiumSubscriberRole?.id ?? null,
    };
  }

  async listChannels(guildId: string): Promise<ChannelSummary[]> {
    const guild = this.guild(guildId);
    if (!guild) return [];
    if (guild.channels.cache.size === 0) {
      await guild.channels.fetch().catch(() => null);
    }
    return [...guild.channels.cache.values()]
      .filter((channel): channel is NonNullable<typeof channel> =>
        Boolean(channel),
      )
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        parentId: "parentId" in channel ? channel.parentId : null,
        position: "rawPosition" in channel ? channel.rawPosition : 0,
      }));
  }

  async listRoles(guildId: string): Promise<RoleSummary[]> {
    const guild = this.guild(guildId);
    if (!guild) return [];
    if (guild.roles.cache.size === 0) {
      await guild.roles.fetch().catch(() => null);
    }
    return [...guild.roles.cache.values()].map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      hexColor: role.hexColor,
      position: role.position,
      managed: role.managed,
    }));
  }

  async listEmojis(guildId: string): Promise<EmojiSummary[]> {
    const guild = this.guild(guildId);
    if (!guild) return [];
    if (guild.emojis.cache.size === 0) {
      await guild.emojis.fetch().catch(() => null);
    }
    return [...guild.emojis.cache.values()]
      .filter((emoji) => Boolean(emoji.name && emoji.id))
      .map((emoji) => ({
        id: emoji.id,
        name: emoji.name ?? "emoji",
        animated: Boolean(emoji.animated),
        url: emoji.imageURL({ size: 64 }) ?? emoji.url,
      }));
  }

  async listStickers(guildId: string): Promise<StickerSummary[]> {
    const guild = this.guild(guildId);
    if (!guild) return [];
    if (guild.stickers.cache.size === 0) {
      await guild.stickers.fetch().catch(() => null);
    }
    return [...guild.stickers.cache.values()].map((sticker) => ({
      id: sticker.id,
      name: sticker.name,
      description: sticker.description,
      format: String(sticker.format),
      url: sticker.url,
    }));
  }
}
