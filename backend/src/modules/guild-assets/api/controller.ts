import {
  ChannelType,
  type Client,
  type Guild,
} from "discord.js";
import type {
  GuildAssetsResponse,
  GuildChannelAsset,
  GuildEmojiAsset,
  GuildRoleAsset,
  GuildStickerAsset,
} from "@adobos/shared";

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
      "El bot de Discord no está conectado.",
      503,
      "BOT_NOT_READY",
    );
  }

  const id = (guildId ?? process.env.DISCORD_GUILD_ID ?? "").trim();
  if (!id) {
    throw new GuildAssetsError(
      "Falta DISCORD_GUILD_ID (o el query ?guildId=).",
      400,
      "MISSING_GUILD_ID",
    );
  }

  const guild = bot.guilds.cache.get(id);
  if (!guild) {
    throw new GuildAssetsError(
      "El bot no está en ese servidor o el guild aún no está en caché.",
      404,
      "GUILD_NOT_FOUND",
    );
  }

  return guild;
}

/** Canales de texto + anuncios + foros a los que se puede enviar mensajes. */
function mapChannels(guild: Guild): GuildChannelAsset[] {
  return [...guild.channels.cache.values()]
    .filter(
      (channel) =>
        channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildAnnouncement ||
        channel.type === ChannelType.GuildForum,
    )
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId,
      position: channel.rawPosition,
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
  return [...guild.roles.cache.values()]
    .filter((role) => role.id !== guild.id && !role.managed)
    .map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      hexColor: role.hexColor,
      position: role.position,
      managed: role.managed,
    }))
    .sort((a, b) => b.position - a.position);
}

export async function getGuildAssets(
  bot: Client,
  guildId?: string,
): Promise<GuildAssetsResponse> {
  const guild = resolveGuild(bot, guildId);

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
    channels: mapChannels(guild),
    emojis: mapEmojis(guild),
    stickers: mapStickers(guild),
    roles: mapRoles(guild),
  };
}
