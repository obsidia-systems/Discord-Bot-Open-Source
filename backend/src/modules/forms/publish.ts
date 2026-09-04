import type { PublishFormResponse, UpdateFormRequest } from "@adobos/shared";
import { FORM_OPEN_PREFIX } from "@adobos/shared";
import {
  ActionRowBuilder,
  type AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import type { BotGateway, OutgoingMessage } from "#core/discord/botGateway.js";
import { attachmentsToOutgoingFiles } from "#core/discord/outgoing.js";
import { resolveEmbedMedia } from "#lib/embedMedia.js";
import {
  FormsError,
  getForm,
  setFormPublishedMessage,
  updateForm,
} from "./domain/forms.js";

function embedColorInt(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(n) ? n : 0x5865f2;
}

export async function publishFormMessage(
  gateway: BotGateway,
  formId: number,
  guildId?: string,
  input?: UpdateFormRequest,
): Promise<PublishFormResponse> {
  if (!gateway.isReady()) {
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

  const channel = await gateway.getChannel(form.guildId, form.publishChannelId);
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

  const reception = await gateway.getChannel(
    form.guildId,
    form.receptionChannelId,
  );
  if (!reception) {
    throw new FormsError(
      "The reception channel does not belong to this server.",
      403,
      "CHANNEL_GUILD_MISMATCH",
    );
  }

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
        error instanceof Error ? error.message : "Invalid main image.",
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

  const payload: OutgoingMessage = {
    embeds: [embed.toJSON()],
    components: [row.toJSON()],
    files: attachmentsToOutgoingFiles(files),
  };

  const publishChannelId = form.publishChannelId;
  let messageId = form.publishedMessageId;
  let channelId = form.publishedChannelId ?? publishChannelId;

  const canEditInPlace =
    Boolean(form.publishedMessageId) &&
    form.publishedChannelId === publishChannelId;

  if (canEditInPlace && form.publishedMessageId) {
    const { orphaned } = await gateway.editMessage(
      form.guildId,
      publishChannelId,
      form.publishedMessageId,
      payload,
    );
    if (!orphaned) {
      messageId = form.publishedMessageId;
      channelId = publishChannelId;
    } else {
      const sent = await gateway.sendMessage(
        form.guildId,
        publishChannelId,
        payload,
      );
      messageId = sent.messageId;
      channelId = sent.channelId;
    }
  } else {
    const sent = await gateway.sendMessage(
      form.guildId,
      publishChannelId,
      payload,
    );
    messageId = sent.messageId;
    channelId = sent.channelId;
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
export async function publishFormsMessage(): Promise<PublishFormResponse> {
  throw new FormsError(
    "Use publishFormMessage(formId). The forms API is now multi-form.",
    400,
    "DEPRECATED",
  );
}
