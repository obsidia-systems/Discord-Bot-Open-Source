import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  type Client,
  type TextChannel,
} from "discord.js";
import type {
  PublishTicketPanelResponse,
  TicketButtonStyle,
  UpdateTicketPanelRequest,
} from "@adobos/shared";
import { ticketOpenCustomId } from "@adobos/shared";
import { channelBelongsToGuild } from "../../core/http/channelScope.js";
import {
  TicketsError,
  getTicketPanel,
  setPanelPublishedMessage,
  updateTicketPanel,
} from "./service.js";

function embedColorInt(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(n) ? n : 0x5865f2;
}

function asButtonStyle(style: TicketButtonStyle): ButtonStyle {
  if (style === "Success") return ButtonStyle.Success;
  if (style === "Danger") return ButtonStyle.Danger;
  if (style === "Secondary") return ButtonStyle.Secondary;
  return ButtonStyle.Primary;
}

export async function publishTicketPanel(
  bot: Client,
  panelId: number,
  guildId?: string,
  input?: UpdateTicketPanelRequest,
): Promise<PublishTicketPanelResponse> {
  if (!bot.isReady()) {
    throw new TicketsError(
      "El bot de Discord no está conectado.",
      503,
      "BOT_NOT_READY",
    );
  }
  const panel = input
    ? await updateTicketPanel(panelId, input, guildId)
    : await getTicketPanel(panelId, guildId);

  if (!panel.channelId) {
    throw new TicketsError(
      "Selecciona un canal de publicación para el panel.",
      400,
      "MISSING_PUBLISH_CHANNEL",
    );
  }
  if (panel.buttons.length === 0) {
    throw new TicketsError(
      "Añade al menos un botón / tipo de ticket.",
      400,
      "NO_BUTTONS",
    );
  }

  const channel = await bot.channels.fetch(panel.channelId).catch(() => null);
  if (
    !channel ||
    (channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement)
  ) {
    throw new TicketsError(
      "El canal de publicación no es válido o no es de texto.",
      400,
      "INVALID_PUBLISH_CHANNEL",
    );
  }
  if (!channelBelongsToGuild(channel, panel.guildId)) {
    throw new TicketsError(
      "El canal de publicación no pertenece a este servidor.",
      403,
      "CHANNEL_GUILD_MISMATCH",
    );
  }

  const textChannel = channel as TextChannel;
  const embed = new EmbedBuilder()
    .setColor(embedColorInt(panel.embedColor))
    .setTitle(panel.embedTitle.slice(0, 256))
    .setDescription(panel.embedDescription.slice(0, 4096) || null);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...panel.buttons.map((btn) =>
      new ButtonBuilder()
        .setCustomId(ticketOpenCustomId(panel.id, btn.typeKey))
        .setLabel(btn.label.slice(0, 80))
        .setStyle(asButtonStyle(btn.style)),
    ),
  );

  let messageId = panel.messageId;
  if (messageId) {
    const existing = await textChannel.messages.fetch(messageId).catch(() => null);
    if (existing) {
      await existing.edit({ embeds: [embed], components: [row] });
    } else {
      const sent = await textChannel.send({ embeds: [embed], components: [row] });
      messageId = sent.id;
    }
  } else {
    const sent = await textChannel.send({ embeds: [embed], components: [row] });
    messageId = sent.id;
  }

  const saved = await setPanelPublishedMessage(
    panel.id,
    textChannel.id,
    messageId,
  );
  return { panel: saved, messageId, channelId: textChannel.id };
}
