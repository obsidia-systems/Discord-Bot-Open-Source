import { randomUUID } from "node:crypto";
import {
  EMBED_AUTHOR_MAX,
  EMBED_DESCRIPTION_MAX,
  EMBED_FOOTER_MAX,
  EMBED_TITLE_MAX,
  EMBED_TOTAL_MAX,
  type EmbedPayload,
  embedCharacterCount,
  MESSAGE_CONTENT_MAX,
  type MessageActionRowInput,
  parseEmbedHexColor,
  persistEmbedMediaUrl,
  type SendEmbedRequest,
  type SendEmbedResponse,
  type SendMessageRequest,
  type SendMessageResponse,
  sanitizeEmbedFields,
  sanitizeLinkActionRows,
} from "@adobos/shared";
import {
  ActionRowBuilder,
  type AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type Client,
  DiscordAPIError,
  EmbedBuilder,
  type Message,
  type SendableChannels,
} from "discord.js";
import { eq } from "drizzle-orm";
import { getDb, one } from "#db/client.js";
import { guildSettings, sentEmbeds } from "#db/schema.js";
import {
  EmbedMediaError,
  requireHttpUrl,
  resolveEmbedMedia,
  resolveMulterEmbedMedia,
} from "#lib/embedMedia.js";

export class MessageSendError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "MessageSendError";
  }
}

function isSendableChannel(channel: unknown): channel is SendableChannels {
  return (
    typeof channel === "object" &&
    channel !== null &&
    "send" in channel &&
    typeof (channel as SendableChannels).send === "function"
  );
}

function assertBotReady(bot: Client): void {
  if (!bot.isReady()) {
    throw new MessageSendError(
      "The Discord bot is not connected.",
      503,
      "BOT_NOT_READY",
    );
  }
}

function assertChannelId(channelId: string): string {
  const trimmed = channelId.trim();
  if (!/^\d{17,20}$/.test(trimmed)) {
    throw new MessageSendError(
      "Invalid channelId. It must be a numeric Discord snowflake.",
      400,
      "INVALID_CHANNEL_ID",
    );
  }
  return trimmed;
}

async function resolveSendableChannel(
  bot: Client,
  channelId: string,
  expectedGuildId: string,
): Promise<SendableChannels> {
  let channel: Awaited<ReturnType<typeof bot.channels.fetch>>;
  try {
    channel = await bot.channels.fetch(channelId);
  } catch {
    throw new MessageSendError(
      "Couldn't fetch the channel. Check the ID and the bot's permissions.",
      404,
      "CHANNEL_FETCH_FAILED",
    );
  }

  if (!channel) {
    throw new MessageSendError("Channel not found.", 404, "CHANNEL_NOT_FOUND");
  }

  const channelGuildId =
    "guildId" in channel && typeof channel.guildId === "string"
      ? channel.guildId
      : null;
  if (!channelGuildId || channelGuildId !== expectedGuildId) {
    throw new MessageSendError(
      "The channel does not belong to this server.",
      403,
      "CHANNEL_GUILD_MISMATCH",
    );
  }

  if (
    channel.type === ChannelType.GuildCategory ||
    channel.type === ChannelType.GuildVoice ||
    channel.type === ChannelType.GuildStageVoice ||
    channel.type === ChannelType.GuildForum ||
    !isSendableChannel(channel)
  ) {
    throw new MessageSendError(
      "The channel does not support text messages.",
      400,
      "CHANNEL_NOT_TEXT",
    );
  }

  return channel;
}

function optionalHttpUrl(
  value: string | undefined,
  field: string,
): string | undefined {
  try {
    return requireHttpUrl(value, field);
  } catch (error: unknown) {
    if (error instanceof EmbedMediaError) {
      throw new MessageSendError(error.message, error.status, error.code);
    }
    throw error;
  }
}

function resolveMediaOrThrow(
  value: string | undefined,
  field: string,
  attachmentName: string,
  files: AttachmentBuilder[],
): string | undefined {
  try {
    const resolved = resolveEmbedMedia(value, field, attachmentName);
    if (resolved.file) files.push(resolved.file);
    return resolved.url;
  } catch (error: unknown) {
    if (error instanceof EmbedMediaError) {
      throw new MessageSendError(error.message, error.status, error.code);
    }
    throw error;
  }
}

type UploadedEmbedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

export type EmbedUploadedFiles = {
  image?: UploadedEmbedFile;
  thumbnail?: UploadedEmbedFile;
  authorIcon?: UploadedEmbedFile;
  footerIcon?: UploadedEmbedFile;
};

function resolveMediaField(
  urlValue: string | undefined,
  uploaded: UploadedEmbedFile | undefined,
  field: string,
  attachmentName: string,
  files: AttachmentBuilder[],
): string | undefined {
  if (uploaded) {
    try {
      const resolved = resolveMulterEmbedMedia(uploaded, attachmentName);
      if (resolved.file) files.push(resolved.file);
      return resolved.url;
    } catch (error: unknown) {
      if (error instanceof EmbedMediaError) {
        throw new MessageSendError(error.message, error.status, error.code);
      }
      throw error;
    }
  }
  return resolveMediaOrThrow(urlValue, field, attachmentName, files);
}

function buildLinkRows(
  rows: MessageActionRowInput[] | undefined,
): ActionRowBuilder<ButtonBuilder>[] | undefined {
  const sanitized = sanitizeLinkActionRows(rows);
  if (!sanitized?.length) return undefined;

  return sanitized.map((row) => {
    const actionRow = new ActionRowBuilder<ButtonBuilder>();
    actionRow.addComponents(
      row.buttons.map((input, index) => {
        const button = new ButtonBuilder()
          .setLabel(input.label)
          .setStyle(ButtonStyle.Link)
          .setURL(input.url ?? "");
        if (input.disabled) button.setDisabled(true);
        if (input.emoji?.trim()) button.setEmoji(input.emoji.trim());
        if (!input.url) {
          throw new MessageSendError(
            `Link button #${index + 1}: a URL is required.`,
            400,
            "MISSING_BUTTON_URL",
          );
        }
        return button;
      }),
    );
    return actionRow;
  });
}

interface PreparedEmbed {
  content?: string;
  title?: string;
  url?: string;
  description?: string;
  colorHex?: string;
  authorName?: string;
  footerText?: string;
  fields: NonNullable<EmbedPayload["fields"]>;
  linkRows?: MessageActionRowInput[];
  includeTimestamp: boolean;
  hasEmbedBody: boolean;
  embed: EmbedBuilder | null;
  files: AttachmentBuilder[];
  components?: ActionRowBuilder<ButtonBuilder>[];
}

function preparedToSnapshot(
  prepared: PreparedEmbed,
  input: SendEmbedRequest,
  message: Message,
): EmbedPayload {
  const sent = message.embeds[0];
  return {
    content: prepared.content,
    title: prepared.title,
    url: prepared.url,
    description: prepared.description,
    color: prepared.colorHex,
    authorName: prepared.authorName,
    authorIconUrl: persistEmbedMediaUrl(
      input.authorIconUrl,
      sent?.author?.iconURL,
    ),
    thumbnailUrl: persistEmbedMediaUrl(
      input.thumbnailUrl,
      sent?.thumbnail?.url,
    ),
    imageUrl: persistEmbedMediaUrl(input.imageUrl, sent?.image?.url),
    footerText: prepared.footerText,
    footerIconUrl: persistEmbedMediaUrl(
      input.footerIconUrl,
      sent?.footer?.iconURL,
    ),
    timestamp: prepared.includeTimestamp,
    fields: prepared.fields.length ? prepared.fields : undefined,
    components: prepared.linkRows,
  };
}

function prepareEmbed(
  input: SendEmbedRequest,
  uploaded: EmbedUploadedFiles,
): PreparedEmbed {
  const title = input.title?.trim() || undefined;
  const description = input.description?.trim() || undefined;
  const content = input.content?.trim() || undefined;
  const authorName = input.authorName?.trim() || undefined;
  const footerText = input.footerText?.trim() || undefined;
  const files: AttachmentBuilder[] = [];
  const url = optionalHttpUrl(input.url, "url");
  const authorIconUrl = resolveMediaField(
    input.authorIconUrl,
    uploaded.authorIcon,
    "authorIconUrl",
    "author-icon",
    files,
  );
  const thumbnailUrl = resolveMediaField(
    input.thumbnailUrl,
    uploaded.thumbnail,
    "thumbnailUrl",
    "thumbnail",
    files,
  );
  const imageUrl = resolveMediaField(
    input.imageUrl,
    uploaded.image,
    "imageUrl",
    "image",
    files,
  );
  const footerIconUrl = resolveMediaField(
    input.footerIconUrl,
    uploaded.footerIcon,
    "footerIconUrl",
    "footer-icon",
    files,
  );
  const color = parseEmbedHexColor(input.color);
  if (input.color?.trim() && color === undefined) {
    throw new MessageSendError(
      "Invalid color. Use hex format (#RRGGBB).",
      400,
      "INVALID_COLOR",
    );
  }
  const includeTimestamp = Boolean(input.timestamp);
  const fields = sanitizeEmbedFields(input.fields) ?? [];
  const linkRows = sanitizeLinkActionRows(input.components);
  const components = buildLinkRows(linkRows);

  if (title && title.length > EMBED_TITLE_MAX) {
    throw new MessageSendError(
      "The title exceeds 256 characters.",
      400,
      "TITLE_TOO_LONG",
    );
  }
  if (description && description.length > EMBED_DESCRIPTION_MAX) {
    throw new MessageSendError(
      "The description exceeds 4096 characters.",
      400,
      "DESCRIPTION_TOO_LONG",
    );
  }
  if (authorName && authorName.length > EMBED_AUTHOR_MAX) {
    throw new MessageSendError(
      "The author exceeds 256 characters.",
      400,
      "AUTHOR_TOO_LONG",
    );
  }
  if (footerText && footerText.length > EMBED_FOOTER_MAX) {
    throw new MessageSendError(
      "The footer exceeds 2048 characters.",
      400,
      "FOOTER_TOO_LONG",
    );
  }
  if (content && content.length > MESSAGE_CONTENT_MAX) {
    throw new MessageSendError(
      "The content exceeds 2000 characters.",
      400,
      "CONTENT_TOO_LONG",
    );
  }
  if (
    embedCharacterCount({
      title,
      description,
      authorName,
      footerText,
      fields,
    }) > EMBED_TOTAL_MAX
  ) {
    throw new MessageSendError(
      "The embed exceeds 6000 characters in total.",
      400,
      "EMBED_TOO_LONG",
    );
  }

  const hasEmbedBody = Boolean(
    title ||
      description ||
      authorName ||
      thumbnailUrl ||
      imageUrl ||
      footerText ||
      url ||
      fields.length,
  );

  if (!hasEmbedBody && !content && !components?.length) {
    throw new MessageSendError(
      "You must provide at least an embed field, content or components.",
      400,
      "EMPTY_EMBED",
    );
  }

  let embed: EmbedBuilder | null = null;
  if (hasEmbedBody) {
    embed = new EmbedBuilder();
    if (title) embed.setTitle(title);
    if (url) embed.setURL(url);
    if (description) embed.setDescription(description);
    if (color !== undefined) embed.setColor(color);
    if (authorName) {
      embed.setAuthor({ name: authorName, iconURL: authorIconUrl });
    }
    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
    if (imageUrl) embed.setImage(imageUrl);
    if (footerText) {
      embed.setFooter({ text: footerText, iconURL: footerIconUrl });
    }
    if (fields.length) {
      embed.addFields(
        fields.map((field) => ({
          name: field.name,
          value: field.value,
          inline: Boolean(field.inline),
        })),
      );
    }
    if (includeTimestamp) embed.setTimestamp(new Date());
  }

  return {
    content,
    title,
    url,
    description,
    colorHex: input.color?.trim() || undefined,
    authorName,
    footerText,
    fields,
    linkRows,
    includeTimestamp,
    hasEmbedBody,
    embed,
    files,
    components,
  };
}

async function ensureGuildRow(guildId: string): Promise<void> {
  const existingGuild = await one(
    getDb()
      .select()
      .from(guildSettings)
      .where(eq(guildSettings.guildId, guildId))
      .limit(1),
  );
  if (!existingGuild) {
    await getDb().insert(guildSettings).values({
      guildId,
      prefix: "!",
      welcomeEnabled: false,
      updatedAt: new Date(),
    });
  }
}

/** Envía un mensaje de texto simple a un canal de Discord. */
export async function sendTextMessage(
  bot: Client,
  input: SendMessageRequest,
  expectedGuildId: string,
): Promise<SendMessageResponse> {
  assertBotReady(bot);
  const channelId = assertChannelId(input.channelId);
  const content = input.content.trim();

  if (!content) {
    throw new MessageSendError(
      "The message content can't be empty.",
      400,
      "EMPTY_CONTENT",
    );
  }

  if (content.length > MESSAGE_CONTENT_MAX) {
    throw new MessageSendError(
      "The message exceeds Discord's 2000-character limit.",
      400,
      "CONTENT_TOO_LONG",
    );
  }

  const channel = await resolveSendableChannel(bot, channelId, expectedGuildId);

  try {
    const message = await channel.send({ content });
    return {
      ok: true,
      messageId: message.id,
      channelId: message.channelId,
    };
  } catch (error: unknown) {
    const detail =
      error instanceof Error ? error.message : "Error desconocido al enviar.";
    throw new MessageSendError(detail, 502, "SEND_FAILED");
  }
}

/** Construye un EmbedBuilder (+ botones Link opcionales) y lo envía al canal. */
export async function sendEmbedMessage(
  bot: Client,
  input: SendEmbedRequest,
  uploaded: EmbedUploadedFiles = {},
  expectedGuildId: string,
): Promise<SendEmbedResponse> {
  assertBotReady(bot);
  const channelId = assertChannelId(input.channelId);
  const prepared = prepareEmbed(input, uploaded);
  const channel = await resolveSendableChannel(bot, channelId, expectedGuildId);

  try {
    const message = await channel.send({
      content: prepared.content,
      embeds: prepared.embed ? [prepared.embed] : undefined,
      components: prepared.components,
      files: prepared.files.length > 0 ? prepared.files : undefined,
    });

    const guildId = expectedGuildId;
    let sentId: string | undefined;
    if (/^\d{17,20}$/.test(guildId)) {
      await ensureGuildRow(guildId);
      sentId = randomUUID();
      const snapshot = preparedToSnapshot(prepared, input, message);
      const now = new Date();
      await getDb()
        .insert(sentEmbeds)
        .values({
          id: sentId,
          guildId,
          channelId: message.channelId,
          messageId: message.id,
          title: prepared.title ?? prepared.content?.slice(0, 80) ?? null,
          embedData: JSON.stringify(snapshot),
          createdAt: now,
          updatedAt: now,
        });
    }

    return {
      ok: true,
      messageId: message.id,
      channelId: message.channelId,
      sentId,
    };
  } catch (error: unknown) {
    if (error instanceof MessageSendError) throw error;
    const detail =
      error instanceof Error ? error.message : "Error desconocido al enviar.";
    throw new MessageSendError(detail, 502, "SEND_FAILED");
  }
}

function isUnknownMessage(error: unknown): boolean {
  return error instanceof DiscordAPIError && error.code === 10008;
}

/** Edita un mensaje embed existente en Discord. */
export async function editEmbedMessage(
  bot: Client,
  channelIdRaw: string,
  messageIdRaw: string,
  input: SendEmbedRequest,
  uploaded: EmbedUploadedFiles = {},
  expectedGuildId: string,
): Promise<{ orphaned: boolean; snapshot?: EmbedPayload }> {
  assertBotReady(bot);
  const channelId = assertChannelId(channelIdRaw);
  if (!/^\d{17,20}$/.test(messageIdRaw.trim())) {
    throw new MessageSendError("Invalid messageId.", 400, "INVALID_MESSAGE_ID");
  }
  const messageId = messageIdRaw.trim();
  const prepared = prepareEmbed(input, uploaded);
  const channel = await resolveSendableChannel(bot, channelId, expectedGuildId);

  try {
    const message = await channel.messages.fetch(messageId);
    const edited = await message.edit({
      content: prepared.content ?? null,
      embeds: prepared.embed ? [prepared.embed] : [],
      components: prepared.components ?? [],
      files: prepared.files.length > 0 ? prepared.files : undefined,
    });
    return {
      orphaned: false,
      snapshot: preparedToSnapshot(prepared, input, edited),
    };
  } catch (error: unknown) {
    if (isUnknownMessage(error)) {
      return { orphaned: true };
    }
    throw new MessageSendError(
      error instanceof Error ? error.message : "Couldn't edit the message.",
      502,
      "EDIT_FAILED",
    );
  }
}

/** Borra un mensaje en Discord; `orphaned` si ya no existía (10008). */
export async function deleteDiscordMessage(
  bot: Client,
  channelIdRaw: string,
  messageIdRaw: string,
  expectedGuildId: string,
): Promise<{ orphaned: boolean }> {
  assertBotReady(bot);
  const channelId = assertChannelId(channelIdRaw);
  const messageId = messageIdRaw.trim();
  const channel = await resolveSendableChannel(bot, channelId, expectedGuildId);
  try {
    const message = await channel.messages.fetch(messageId);
    await message.delete();
    return { orphaned: false };
  } catch (error: unknown) {
    if (isUnknownMessage(error)) {
      return { orphaned: true };
    }
    throw new MessageSendError(
      error instanceof Error ? error.message : "Couldn't delete the message.",
      502,
      "DELETE_FAILED",
    );
  }
}
