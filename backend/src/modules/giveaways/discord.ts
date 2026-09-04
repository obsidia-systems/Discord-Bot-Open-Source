import type { Giveaway, GiveawaySettings } from "@adobos/shared";
import { GIVEAWAY_JOIN_PREFIX, GIVEAWAY_STATUS_LABEL } from "@adobos/shared";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import type { BotGateway, ChannelSummary } from "#core/discord/botGateway.js";
import { logger } from "#core/log.js";
import { GiveawaysError } from "./domain/giveaways.js";

function isGiveawayTextChannel(channel: ChannelSummary | null): boolean {
  return (
    channel !== null &&
    (channel.type === ChannelType.GuildText ||
      channel.type === ChannelType.GuildAnnouncement)
  );
}

export async function requireGuild(
  gateway: BotGateway,
  guildId: string,
): Promise<void> {
  const guild = await gateway.getGuild(guildId);
  if (!guild) {
    throw new GiveawaysError(
      "The bot is not in this server.",
      400,
      "GUILD_NOT_FOUND",
    );
  }
}

/** Valida que el canal del sorteo existe, es de este guild y admite texto. */
export async function requireGiveawayChannel(
  gateway: BotGateway,
  giveaway: Giveaway,
): Promise<void> {
  const channel = await gateway.getChannel(
    giveaway.guildId,
    giveaway.channelId,
  );
  if (!isGiveawayTextChannel(channel)) {
    throw new GiveawaysError(
      "The giveaway channel is not valid.",
      400,
      "INVALID_CHANNEL",
    );
  }
}

export function giveawayEmbed(giveaway: Giveaway): EmbedBuilder {
  const ends = Math.floor(new Date(giveaway.endsAt).getTime() / 1000);
  const starts = Math.floor(new Date(giveaway.startsAt).getTime() / 1000);
  const lines = [
    giveaway.description.trim() || null,
    `Status: **${GIVEAWAY_STATUS_LABEL[giveaway.status]}**`,
    giveaway.status === "scheduled"
      ? `Starts <t:${starts}:R>`
      : `Ends <t:${ends}:R>`,
    `Winners: **${giveaway.winnerCount}**`,
    `Entrants: **${giveaway.entryCount}**`,
  ].filter((line): line is string => Boolean(line));
  if (giveaway.requiredRoleIds.length > 0) {
    lines.push(
      `Required role: ${giveaway.requiredRoleIds.map((id) => `<@&${id}>`).join(" ")}`,
    );
  }
  if (giveaway.winnerIds.length > 0) {
    lines.push(
      `Winners: ${giveaway.winnerIds.map((id) => `<@${id}>`).join(" ")}`,
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

export function giveawayComponents(
  giveaway: Giveaway,
): ActionRowBuilder<ButtonBuilder>[] {
  if (giveaway.status !== "running") return [];
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${GIVEAWAY_JOIN_PREFIX}${giveaway.id}`.slice(0, 100))
      .setLabel("Enter")
      .setStyle(ButtonStyle.Success),
  );
  return [row];
}

export async function upsertGiveawayMessage(
  gateway: BotGateway,
  giveaway: Giveaway,
): Promise<string> {
  await requireGiveawayChannel(gateway, giveaway);
  const payload = {
    embeds: [giveawayEmbed(giveaway).toJSON()],
    components: giveawayComponents(giveaway).map((row) => row.toJSON()),
  };
  if (giveaway.messageId) {
    const { orphaned } = await gateway.editMessage(
      giveaway.guildId,
      giveaway.channelId,
      giveaway.messageId,
      payload,
    );
    if (!orphaned) return giveaway.messageId;
  }
  const sent = await gateway.sendMessage(
    giveaway.guildId,
    giveaway.channelId,
    payload,
  );
  return sent.messageId;
}

export async function announceGiveawayWinners(input: {
  gateway: BotGateway;
  giveaway: Giveaway;
  settings: GiveawaySettings;
  newWinnerIds: string[];
  isReroll: boolean;
}): Promise<void> {
  const mentions =
    input.newWinnerIds.length > 0
      ? input.newWinnerIds.map((id) => `<@${id}>`).join(" ")
      : "Nobody entered.";
  const ping =
    input.settings.pingRoleId && !input.isReroll
      ? `<@&${input.settings.pingRoleId}> `
      : "";
  const text = input.isReroll
    ? `${ping}Reroll of **${input.giveaway.prize}**: ${mentions}`
    : `${ping}Giveaway **${input.giveaway.prize}** — winner(s): ${mentions}`;

  await input.gateway
    .sendMessage(input.giveaway.guildId, input.giveaway.channelId, {
      content: text.slice(0, 2000),
      allowedMentions: {
        users: input.newWinnerIds,
        roles: input.settings.pingRoleId ? [input.settings.pingRoleId] : [],
      },
    })
    .catch((error: unknown) => {
      logger.warn({ err: error }, "giveaways: announcement failed");
    });

  if (input.settings.dmWinners) {
    for (const userId of input.newWinnerIds) {
      await input.gateway.sendDirectMessage(userId, {
        content: `You won the giveaway **${input.giveaway.prize}** in a server.`,
      });
    }
  }
}
