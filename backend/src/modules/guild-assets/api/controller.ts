import type {
  GuildAssetsResponse,
  GuildChannelAsset,
  GuildEmojiAsset,
  GuildRoleAsset,
  GuildStickerAsset,
} from "@adobos/shared";
import { includeGuildAssetRole, isGuildAssetChannelType } from "@adobos/shared";
import type { Client, Guild } from "discord.js";

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

function resolveGuild(bot: Client, guildId?: string): Guild {
  if (!bot.isReady()) {
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

  const guild = bot.guilds.cache.get(id);
  if (!guild) {
    throw new GuildAssetsError(
      "The bot is not in that server or the guild is not cached yet.",
      404,
      "GUILD_NOT_FOUND",
    );
  }

  return guild;
}

/** Canales útiles para selects del panel (texto, voz, categorías). */
function mapChannels(guild: Guild): GuildChannelAsset[] {
  return [...guild.channels.cache.values()]
    .filter((channel) => isGuildAssetChannelType(channel.type))
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: "parentId" in channel ? channel.parentId : null,
      position: "rawPosition" in channel ? channel.rawPosition : 0,
    }))
    .sort((a, b) => a.position - b.position);
}

function mapEmojis(guild: Guild): GuildEmojiAsset[] {
  return [...guild.emojis.cache.values()]
    .filter((emoji) => Boolean(emoji.name && emoji.id))
    .map((emoji) => {
      const name = emoji.name ?? "emoji";
      const mention = emoji.animated
        ? `<a:${name}:${emoji.id}>`
        : `<:${name}:${emoji.id}>`;
      return {
        id: emoji.id,
        name,
        animated: emoji.animated,
        mention,
        url: emoji.imageURL({ size: 64 }) ?? emoji.url,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function mapStickers(guild: Guild): GuildStickerAsset[] {
  return [...guild.stickers.cache.values()]
    .map((sticker) => ({
      id: sticker.id,
      name: sticker.name,
      description: sticker.description,
      format: String(sticker.format),
      url: sticker.url,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function mapRoles(guild: Guild): GuildRoleAsset[] {
  const boosterId = guild.roles.premiumSubscriberRole?.id ?? null;
  return [...guild.roles.cache.values()]
    .filter((role) =>
      includeGuildAssetRole({
        id: role.id,
        guildId: guild.id,
        managed: role.managed,
        boosterRoleId: boosterId,
      }),
    )
    .map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      hexColor: role.hexColor,
      position: role.position,
      managed: role.managed,
      premiumSubscriber: boosterId !== null && role.id === boosterId,
    }))
    .sort((a, b) => b.position - a.position);
}

export async function getGuildAssets(
  bot: Client,
  guildId?: string,
): Promise<GuildAssetsResponse> {
  const guild = resolveGuild(bot, guildId);

  if (guild.channels.cache.size === 0) {
    try {
      await guild.channels.fetch();
    } catch {
      // Si falla, devolvemos lo que haya en caché
    }
  }
  if (guild.roles.cache.size === 0) {
    try {
      await guild.roles.fetch();
    } catch {
      // ignore
    }
  }

  // Asegura emojis/stickers frescos cuando el caché esté vacío
  if (guild.emojis.cache.size === 0) {
    try {
      await guild.emojis.fetch();
    } catch {
      // Si falla, devolvemos lo que haya en caché
    }
  }
  if (guild.stickers.cache.size === 0) {
    try {
      await guild.stickers.fetch();
    } catch {
      // ignore
    }
  }

  return {
    guildId: guild.id,
    guildName: guild.name,
    iconUrl: guild.iconURL({ size: 256 }),
    channels: mapChannels(guild),
    emojis: mapEmojis(guild),
    stickers: mapStickers(guild),
    roles: mapRoles(guild),
  };
}
