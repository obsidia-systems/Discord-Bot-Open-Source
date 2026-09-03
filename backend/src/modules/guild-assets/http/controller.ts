import type {
  GuildAssetsResponse,
  GuildChannelAsset,
  GuildEmojiAsset,
  GuildRoleAsset,
  GuildStickerAsset,
} from "@adobos/shared";
import { includeGuildAssetRole, isGuildAssetChannelType } from "@adobos/shared";
import type {
  BotGateway,
  ChannelSummary,
  EmojiSummary,
  GuildSummary,
  RoleSummary,
  StickerSummary,
} from "#core/discord/botGateway.js";

export class GuildAssetsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "GuildAssetsError";
  }
}

/** Canales útiles para selects del panel (texto, voz, categorías). */
function mapChannels(channels: ChannelSummary[]): GuildChannelAsset[] {
  return channels
    .filter((channel) => isGuildAssetChannelType(channel.type))
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId,
      position: channel.position,
    }))
    .sort((a, b) => a.position - b.position);
}

function mapEmojis(emojis: EmojiSummary[]): GuildEmojiAsset[] {
  return emojis
    .filter((emoji) => Boolean(emoji.name && emoji.id))
    .map((emoji) => ({
      id: emoji.id,
      name: emoji.name,
      animated: emoji.animated,
      mention: emoji.animated
        ? `<a:${emoji.name}:${emoji.id}>`
        : `<:${emoji.name}:${emoji.id}>`,
      url: emoji.url,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function mapStickers(stickers: StickerSummary[]): GuildStickerAsset[] {
  return stickers
    .map((sticker) => ({
      id: sticker.id,
      name: sticker.name,
      description: sticker.description,
      format: sticker.format,
      url: sticker.url,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function mapRoles(roles: RoleSummary[], guild: GuildSummary): GuildRoleAsset[] {
  return roles
    .filter((role) =>
      includeGuildAssetRole({
        id: role.id,
        guildId: guild.id,
        managed: role.managed,
        boosterRoleId: guild.boosterRoleId,
      }),
    )
    .map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      hexColor: role.hexColor,
      position: role.position,
      managed: role.managed,
      premiumSubscriber:
        guild.boosterRoleId !== null && role.id === guild.boosterRoleId,
    }))
    .sort((a, b) => b.position - a.position);
}

export async function getGuildAssets(
  gateway: BotGateway,
  guildId?: string,
): Promise<GuildAssetsResponse> {
  if (!gateway.isReady()) {
    throw new GuildAssetsError(
      "The Discord bot is not connected.",
      503,
      "BOT_NOT_READY",
    );
  }

  const id = (guildId ?? "").trim();
  if (!id) {
    throw new GuildAssetsError("Missing guildId.", 400, "MISSING_GUILD_ID");
  }

  const guild = await gateway.getGuild(id);
  if (!guild) {
    throw new GuildAssetsError(
      "The bot is not in that server or the guild is not cached yet.",
      404,
      "GUILD_NOT_FOUND",
    );
  }

  const [channels, emojis, stickers, roles] = await Promise.all([
    gateway.listChannels(id),
    gateway.listEmojis(id),
    gateway.listStickers(id),
    gateway.listRoles(id),
  ]);

  return {
    guildId: guild.id,
    guildName: guild.name,
    iconUrl: guild.iconUrl,
    channels: mapChannels(channels),
    emojis: mapEmojis(emojis),
    stickers: mapStickers(stickers),
    roles: mapRoles(roles, guild),
  };
}
