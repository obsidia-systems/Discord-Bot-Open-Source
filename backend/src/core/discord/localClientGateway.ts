import {
  AttachmentBuilder,
  type Client,
  DiscordAPIError,
  type Guild,
  type MessageCreateOptions,
  type MessageEditOptions,
  type SendableChannels,
} from "discord.js";
import { resolveMembersBatch } from "#lib/discordMember.js";
import {
  type BotGateway,
  BotGatewayError,
  type ChannelSummary,
  type EmojiSummary,
  type GuildSummary,
  type MemberProfile,
  type OutgoingMessage,
  type RoleSummary,
  type StickerSummary,
} from "./botGateway.js";

const UNKNOWN_MESSAGE = 10008;

function toFiles(
  files: OutgoingMessage["files"],
): AttachmentBuilder[] | undefined {
  if (!files?.length) return undefined;
  return files.map((f) => new AttachmentBuilder(f.data, { name: f.name }));
}

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

  async getChannel(
    guildId: string,
    channelId: string,
  ): Promise<ChannelSummary | null> {
    const guild = this.guild(guildId);
    if (!guild) return null;
    const channel =
      guild.channels.cache.get(channelId) ??
      (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel || channel.guildId !== guildId) return null;
    return {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: "parentId" in channel ? channel.parentId : null,
      position: "rawPosition" in channel ? channel.rawPosition : 0,
    };
  }

  async deleteChannel(
    guildId: string,
    channelId: string,
    reason?: string,
  ): Promise<void> {
    const guild = this.guild(guildId);
    if (!guild) return;
    const channel =
      guild.channels.cache.get(channelId) ??
      (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel || channel.guildId !== guildId) return;
    await channel.delete(reason).catch(() => null);
  }

  async resolveMembers(
    guildId: string,
    userIds: string[],
  ): Promise<Map<string, MemberProfile>> {
    return resolveMembersBatch(this.guild(guildId), this.client, userIds);
  }

  private async sendableChannel(
    guildId: string,
    channelId: string,
  ): Promise<SendableChannels> {
    const guild = this.guild(guildId);
    if (!guild) {
      throw new BotGatewayError(
        "The bot is not in that server.",
        404,
        "GUILD_NOT_FOUND",
      );
    }
    const channel =
      guild.channels.cache.get(channelId) ??
      (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel || channel.guildId !== guildId) {
      throw new BotGatewayError(
        "The channel is not in this server.",
        404,
        "CHANNEL_NOT_FOUND",
      );
    }
    if (!channel.isTextBased() || !("send" in channel)) {
      throw new BotGatewayError(
        "The channel does not accept messages.",
        400,
        "CHANNEL_NOT_SENDABLE",
      );
    }
    return channel as SendableChannels;
  }

  async sendMessage(
    guildId: string,
    channelId: string,
    message: OutgoingMessage,
  ): Promise<{ messageId: string; channelId: string }> {
    const channel = await this.sendableChannel(guildId, channelId);
    const sent = await channel.send({
      content: message.content,
      embeds: message.embeds,
      components: message.components,
      files: toFiles(message.files),
      allowedMentions: message.allowedMentions,
    } as MessageCreateOptions);
    return { messageId: sent.id, channelId: sent.channelId };
  }

  async editMessage(
    guildId: string,
    channelId: string,
    messageId: string,
    message: OutgoingMessage,
  ): Promise<{ orphaned: boolean }> {
    const channel = await this.sendableChannel(guildId, channelId);
    try {
      const target = await channel.messages.fetch(messageId);
      await target.edit({
        content: message.content ?? null,
        embeds: message.embeds ?? [],
        components: message.components ?? [],
        files: toFiles(message.files),
      } as MessageEditOptions);
      return { orphaned: false };
    } catch (error) {
      if (error instanceof DiscordAPIError && error.code === UNKNOWN_MESSAGE) {
        return { orphaned: true };
      }
      throw error;
    }
  }

  async deleteMessage(
    guildId: string,
    channelId: string,
    messageId: string,
  ): Promise<{ orphaned: boolean }> {
    const channel = await this.sendableChannel(guildId, channelId);
    try {
      const target = await channel.messages.fetch(messageId);
      await target.delete();
      return { orphaned: false };
    } catch (error) {
      if (error instanceof DiscordAPIError && error.code === UNKNOWN_MESSAGE) {
        return { orphaned: true };
      }
      throw error;
    }
  }
}
