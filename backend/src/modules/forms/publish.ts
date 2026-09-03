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
import { channelBelongsToGuild } from "../../core/http/channelScope.js";
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
      "The Discord bot is not connected.",
      503,
      "BOT_NOT_READY",
    );
  }

  const form = input
    ? await updateForm(formId, input, guildId)
    : await getForm(formId, guildId);

  if (!form.publishChannelId) {
    throw new FormsError(
      "Select a publish channel in «Base Message».",
      400,
      "MISSING_PUBLISH_CHANNEL",
    );
  }
  if (!form.receptionChannelId) {
    throw new FormsError(
      "Select a reception channel in the «Reception» tab.",
      400,
      "MISSING_RECEPTION_CHANNEL",
    );
  }
  if (form.questions.length === 0) {
    throw new FormsError(
      "Add at least one question to the form.",
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
      "The publish channel is invalid or not a text channel.",
      400,
      "INVALID_PUBLISH_CHANNEL",
    );
  }
  if (!channelBelongsToGuild(channel, form.guildId)) {
    throw new FormsError(
      "The publish channel does not belong to this server.",
      403,
      "CHANNEL_GUILD_MISMATCH",
    );
  }

  const reception = await bot.channels
    .fetch(form.receptionChannelId)
    .catch(() => null);
  if (!reception || !channelBelongsToGuild(reception, form.guildId)) {
    throw new FormsError(
      "The reception channel does not belong to this server.",
      403,
      "CHANNEL_GUILD_MISMATCH",
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
          : "Invalid main image.",
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
        error instanceof Error ? error.message : "Invalid thumbnail.",
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

  const next = await setFormPublishedMessage(
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
    "Use publishFormMessage(formId). The forms API is now multi-form.",
    400,
    "DEPRECATED",
  );
}
