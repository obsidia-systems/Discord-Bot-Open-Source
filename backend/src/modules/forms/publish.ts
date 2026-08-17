import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  type AttachmentBuilder,
  type Client,
  type TextChannel,
} from "discord.js";
import type { PublishFormResponse, UpdateFormRequest } from "@adobos/shared";
import { FORM_OPEN_PREFIX } from "@adobos/shared";
import { resolveEmbedMedia } from "../../lib/embedMedia.js";
import {
  FormsError,
  getForm,
  setFormPublishedMessage,
  updateForm,
} from "./service.js";

function embedColorInt(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(n) ? n : 0x5865f2;
}

export async function publishFormMessage(
  bot: Client,
  formId: number,
  guildId?: string,
  input?: UpdateFormRequest,
): Promise<PublishFormResponse> {
  if (!bot.isReady()) {
    throw new FormsError(
      "El bot de Discord no está conectado.",
      503,
      "BOT_NOT_READY",
    );
  }

  const form = input
    ? updateForm(formId, input, guildId)
    : getForm(formId, guildId);

  if (!form.publishChannelId) {
    throw new FormsError(
      "Selecciona un canal de publicación en «Mensaje Base».",
      400,
      "MISSING_PUBLISH_CHANNEL",
    );
  }
  if (!form.receptionChannelId) {
    throw new FormsError(
      "Selecciona un canal de recepción en la pestaña «Recepción».",
      400,
      "MISSING_RECEPTION_CHANNEL",
    );
  }
  if (form.questions.length === 0) {
    throw new FormsError(
      "Añade al menos una pregunta al formulario.",
      400,
      "NO_QUESTIONS",
    );
  }

  const channel = await bot.channels
    .fetch(form.publishChannelId)
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
  const openCustomId = `${FORM_OPEN_PREFIX}${form.id}`.slice(0, 100);

  const files: AttachmentBuilder[] = [];
  let imageUrl: string | undefined;
  let thumbnailUrl: string | undefined;

  if (form.embedImageUrl) {
    try {
      const resolved = resolveEmbedMedia(
        form.embedImageUrl,
        "embedImageUrl",
        "form-image",
      );
      if (resolved.file) files.push(resolved.file);
      imageUrl = resolved.url;
    } catch (error) {
      throw new FormsError(
        error instanceof Error
          ? error.message
          : "Imagen principal inválida.",
        400,
        "INVALID_IMAGE",
      );
    }
  }

  if (form.embedThumbnailUrl) {
    try {
      const resolved = resolveEmbedMedia(
        form.embedThumbnailUrl,
        "embedThumbnailUrl",
        "form-thumb",
      );
      if (resolved.file) files.push(resolved.file);
      thumbnailUrl = resolved.url;
    } catch (error) {
      throw new FormsError(
        error instanceof Error ? error.message : "Thumbnail inválido.",
        400,
        "INVALID_THUMBNAIL",
      );
    }
  }

  const embed = new EmbedBuilder()
    .setColor(embedColorInt(form.embedColor))
    .setTitle(form.embedTitle)
    .setDescription(form.embedDescription || "\u200b");
  if (imageUrl) embed.setImage(imageUrl);
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(openCustomId)
      .setLabel(form.buttonLabel.slice(0, 80))
      .setStyle(ButtonStyle.Primary),
  );

  let messageId = form.publishedMessageId;
  let channelId = form.publishedChannelId ?? form.publishChannelId;

  const payload = {
    embeds: [embed],
    components: [row],
    files: files.length > 0 ? files : undefined,
  };

  if (
    form.publishedMessageId &&
    form.publishedChannelId === form.publishChannelId
  ) {
    const existing = await textChannel.messages
      .fetch(form.publishedMessageId)
      .catch(() => null);
    if (existing) {
      await existing.edit(payload);
      messageId = existing.id;
      channelId = textChannel.id;
    } else {
      const sent = await textChannel.send(payload);
      messageId = sent.id;
      channelId = textChannel.id;
    }
  } else {
    const sent = await textChannel.send(payload);
    messageId = sent.id;
    channelId = textChannel.id;
  }

  const next = setFormPublishedMessage(
    form.id,
    channelId,
    messageId!,
    form.guildId,
  );
  return {
    form: next,
    messageId: messageId!,
    channelId,
  };
}

/** @deprecated — API multi-formulario. */
export async function publishFormsMessage(
  _bot: Client,
  _guildId?: string,
  _input?: UpdateFormRequest,
): Promise<PublishFormResponse> {
  throw new FormsError(
    "Usa publishFormMessage(formId). El API de formularios ahora es multi-formulario.",
    400,
    "DEPRECATED",
  );
}
