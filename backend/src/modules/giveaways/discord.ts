import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  type Client,
  type Guild,
  type TextChannel,
} from "discord.js";
import type { Giveaway, GiveawaySettings } from "@adobos/shared";
import { GIVEAWAY_JOIN_PREFIX, GIVEAWAY_STATUS_LABEL } from "@adobos/shared";
import { channelBelongsToGuild } from "../../core/http/channelScope.js";
import { logger } from "../../core/log.js";
import { GiveawaysError } from "./service.js";

function asTextChannel(channel: unknown): TextChannel | null {
  if (
    channel &&
    typeof channel === "object" &&
    "type" in channel &&
    ((channel as { type: number }).type === ChannelType.GuildText ||
      (channel as { type: number }).type === ChannelType.GuildAnnouncement) &&
    "send" in channel
  ) {
    return channel as TextChannel;
  }
  return null;
}

export async function requireGuild(bot: Client, guildId: string): Promise<Guild> {
  const cached = bot.guilds.cache.get(guildId);
  if (cached) return cached;
  try {
    return await bot.guilds.fetch(guildId);
  } catch {
    throw new GiveawaysError(
      "El bot no está en este servidor.",
      400,
      "GUILD_NOT_FOUND",
    );
  }
}

export async function fetchGiveawayChannel(
  bot: Client,
  giveaway: Giveaway,
): Promise<TextChannel> {
  const channel = await bot.channels.fetch(giveaway.channelId).catch(() => null);
  const text = asTextChannel(channel);
  if (!text || !channelBelongsToGuild(text, giveaway.guildId)) {
    throw new GiveawaysError(
      "El canal del sorteo no es válido.",
      400,
      "INVALID_CHANNEL",
    );
  }
  return text;
}

export function giveawayEmbed(giveaway: Giveaway): EmbedBuilder {
  const ends = Math.floor(new Date(giveaway.endsAt).getTime() / 1000);
  const starts = Math.floor(new Date(giveaway.startsAt).getTime() / 1000);
  const lines = [
    giveaway.description.trim() || null,
    `Estado: **${GIVEAWAY_STATUS_LABEL[giveaway.status]}**`,
    giveaway.status === "scheduled"
      ? `Empieza <t:${starts}:R>`
      : `Termina <t:${ends}:R>`,
    `Ganadores: **${giveaway.winnerCount}**`,
    `Participantes: **${giveaway.entryCount}**`,
  ].filter((line): line is string => Boolean(line));
  if (giveaway.requiredRoleIds.length > 0) {
    lines.push(
      `Rol necesario: ${giveaway.requiredRoleIds.map((id) => `<@&${id}>`).join(" ")}`,
    );
  }
  if (giveaway.winnerIds.length > 0) {
    lines.push(
      `Ganadores: ${giveaway.winnerIds.map((id) => `<@${id}>`).join(" ")}`,
    );
  }
  const color =
    giveaway.status === "ended"
      ? 0x57f287
      : giveaway.status === "cancelled"
        ? 0xed4245
        : 0x5865f2;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(giveaway.prize.slice(0, 256))
    .setDescription(lines.join("\n").slice(0, 4096));
  return embed;
}

export function giveawayComponents(giveaway: Giveaway): ActionRowBuilder<ButtonBuilder>[] {
  if (giveaway.status !== "running") return [];
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${GIVEAWAY_JOIN_PREFIX}${giveaway.id}`.slice(0, 100))
      .setLabel("Participar")
      .setStyle(ButtonStyle.Success),
  );
  return [row];
}

export async function upsertGiveawayMessage(
  bot: Client,
  giveaway: Giveaway,
): Promise<string> {
  const channel = await fetchGiveawayChannel(bot, giveaway);
  const payload = {
    embeds: [giveawayEmbed(giveaway)],
    components: giveawayComponents(giveaway),
  };
  if (giveaway.messageId) {
    const existing = await channel.messages
      .fetch(giveaway.messageId)
      .catch(() => null);
    if (existing) {
      await existing.edit(payload);
      return existing.id;
    }
  }
  const sent = await channel.send(payload);
  return sent.id;
}

export async function announceGiveawayWinners(input: {
  bot: Client;
  giveaway: Giveaway;
  settings: GiveawaySettings;
  newWinnerIds: string[];
  isReroll: boolean;
}): Promise<void> {
  const channel = await fetchGiveawayChannel(input.bot, input.giveaway).catch(
    () => null,
  );
  const mentions =
    input.newWinnerIds.length > 0
      ? input.newWinnerIds.map((id) => `<@${id}>`).join(" ")
      : "Nadie participó.";
  const ping =
    input.settings.pingRoleId && !input.isReroll
      ? `<@&${input.settings.pingRoleId}> `
      : "";
  const text = input.isReroll
    ? `${ping}Reroll de **${input.giveaway.prize}**: ${mentions}`
    : `${ping}Sorteo **${input.giveaway.prize}** — ganador(es): ${mentions}`;
  if (channel) {
    await channel
      .send({
        content: text.slice(0, 2000),
        allowedMentions: {
          users: input.newWinnerIds,
          roles: input.settings.pingRoleId ? [input.settings.pingRoleId] : [],
        },
      })
      .catch((error: unknown) => {
        logger.warn({ err: error }, "giveaways: anuncio falló");
      });
  }
  if (input.settings.dmWinners) {
    for (const userId of input.newWinnerIds) {
      try {
        const user = await input.bot.users.fetch(userId);
        await user.send(
          `Has ganado el sorteo **${input.giveaway.prize}** en un servidor.`,
        );
      } catch {
        // DMs cerrados
      }
    }
  }
}
