import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  type Client,
  type TextChannel,
} from "discord.js";
import {
  FORM_OPEN_PREFIX,
  type PublishFormsResponse,
  type UpdateFormsConfigRequest,
} from "@adobos/shared";
import {
  FormsError,
  getFormsConfig,
  setFormsPublishedMessage,
  updateFormsConfig,
} from "./service.js";

function embedColorInt(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(n) ? n : 0x5865f2;
}

export async function publishFormsMessage(
  bot: Client,
  guildId?: string,
  input?: UpdateFormsConfigRequest,
): Promise<PublishFormsResponse> {
  if (!bot.isReady()) {
    throw new FormsError(
      "El bot de Discord no está conectado.",
      503,
      "BOT_NOT_READY",
    );
  }

  const config = input
    ? updateFormsConfig(input, guildId)
    : getFormsConfig(guildId);

  if (!config.publishChannelId) {
    throw new FormsError(
      "Selecciona un canal de publicación en «Mensaje Base».",
      400,
      "MISSING_PUBLISH_CHANNEL",
    );
  }
  if (!config.receptionChannelId) {
    throw new FormsError(
      "Selecciona un canal de recepción en la pestaña «Recepción».",
      400,
      "MISSING_RECEPTION_CHANNEL",
    );
  }
  if (config.questions.length === 0) {
    throw new FormsError(
      "Añade al menos una pregunta al formulario.",
      400,
      "NO_QUESTIONS",
    );
  }

  const channel = await bot.channels
    .fetch(config.publishChannelId)
    .catch(() => null);
  if (
    !channel ||
    (channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement)
  ) {
    throw new FormsError(
      "El canal de publicación no es válido o no es de texto.",
      400,
      "INVALID_PUBLISH_CHANNEL",
    );
  }

  const textChannel = channel as TextChannel;
  const openCustomId = `${FORM_OPEN_PREFIX}${config.guildId}`.slice(0, 100);

  const embed = new EmbedBuilder()
    .setColor(embedColorInt(config.embedColor))
    .setTitle(config.embedTitle)
    .setDescription(config.embedDescription || "\u200b");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(openCustomId)
      .setLabel(config.buttonLabel.slice(0, 80))
      .setStyle(ButtonStyle.Primary),
  );

  let messageId = config.publishedMessageId;
  let channelId = config.publishedChannelId ?? config.publishChannelId;

  if (
    config.publishedMessageId &&
    config.publishedChannelId === config.publishChannelId
  ) {
    const existing = await textChannel.messages
      .fetch(config.publishedMessageId)
      .catch(() => null);
    if (existing) {
      await existing.edit({ embeds: [embed], components: [row] });
      messageId = existing.id;
      channelId = textChannel.id;
    } else {
      const sent = await textChannel.send({
        embeds: [embed],
        components: [row],
      });
      messageId = sent.id;
      channelId = textChannel.id;
    }
  } else {
    const sent = await textChannel.send({
      embeds: [embed],
      components: [row],
    });
    messageId = sent.id;
    channelId = textChannel.id;
  }

  const next = setFormsPublishedMessage(config.guildId, channelId, messageId!);
  return {
    config: next,
    messageId: messageId!,
    channelId,
  };
}
