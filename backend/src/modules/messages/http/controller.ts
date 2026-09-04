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
  EmbedBuilder,
} from "discord.js";
import { eq } from "drizzle-orm";
import type {
  BotGateway,
  PublishedEmbedMedia,
} from "#core/discord/botGateway.js";
import { BotGatewayError } from "#core/discord/botGateway.js";
import { attachmentsToOutgoingFiles } from "#core/discord/outgoing.js";
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

function assertBotReady(gateway: BotGateway): void {
  if (!gateway.isReady()) {
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

/** `BotGatewayError` (canal) pasa tal cual; el resto → 502 con `code`. */
function rethrowSend(error: unknown, code: string, verb: string): never {
  if (error instanceof MessageSendError || error instanceof BotGatewayError) {
    throw error;
  }
  throw new MessageSendError(
    error instanceof Error ? error.message : `Couldn't ${verb} the message.`,
    502,
    code,
  );
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
  media: PublishedEmbedMedia | undefined,
): EmbedPayload {
  return {
    content: prepared.content,
    title: prepared.title,
    url: prepared.url,
    description: prepared.description,
    color: prepared.colorHex,
    authorName: prepared.authorName,
    authorIconUrl: persistEmbedMediaUrl(
      input.authorIconUrl,
      media?.authorIconUrl,
    ),
    thumbnailUrl: persistEmbedMediaUrl(input.thumbnailUrl, media?.thumbnailUrl),
    imageUrl: persistEmbedMediaUrl(input.imageUrl, media?.imageUrl),
    footerText: prepared.footerText,
    footerIconUrl: persistEmbedMediaUrl(
      input.footerIconUrl,
      media?.footerIconUrl,
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
  gateway: BotGateway,
  input: SendMessageRequest,
  expectedGuildId: string,
): Promise<SendMessageResponse> {
  assertBotReady(gateway);
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

  try {
    const sent = await gateway.sendMessage(expectedGuildId, channelId, {
      content,
    });
    return { ok: true, messageId: sent.messageId, channelId: sent.channelId };
  } catch (error: unknown) {
    rethrowSend(error, "SEND_FAILED", "send");
  }
}

/** Construye un EmbedBuilder (+ botones Link opcionales) y lo envía al canal. */
export async function sendEmbedMessage(
  gateway: BotGateway,
  input: SendEmbedRequest,
  uploaded: EmbedUploadedFiles = {},
  expectedGuildId: string,
): Promise<SendEmbedResponse> {
  assertBotReady(gateway);
  const channelId = assertChannelId(input.channelId);
  const prepared = prepareEmbed(input, uploaded);

  let sent: Awaited<ReturnType<BotGateway["sendMessage"]>>;
  try {
    sent = await gateway.sendMessage(expectedGuildId, channelId, {
      content: prepared.content,
      embeds: prepared.embed ? [prepared.embed.toJSON()] : undefined,
      components: prepared.components?.map((row) => row.toJSON()),
      files: attachmentsToOutgoingFiles(prepared.files),
    });
  } catch (error: unknown) {
    rethrowSend(error, "SEND_FAILED", "send");
  }

  const guildId = expectedGuildId;
  let sentId: string | undefined;
  if (/^\d{17,20}$/.test(guildId)) {
    await ensureGuildRow(guildId);
    sentId = randomUUID();
    const snapshot = preparedToSnapshot(prepared, input, sent.embedMedia);
    const now = new Date();
    await getDb()
      .insert(sentEmbeds)
      .values({
        id: sentId,
        guildId,
        channelId: sent.channelId,
        messageId: sent.messageId,
        title: prepared.title ?? prepared.content?.slice(0, 80) ?? null,
        embedData: JSON.stringify(snapshot),
        createdAt: now,
        updatedAt: now,
      });
  }

  return {
    ok: true,
    messageId: sent.messageId,
    channelId: sent.channelId,
    sentId,
  };
}

/** Edita un mensaje embed existente en Discord. */
export async function editEmbedMessage(
  gateway: BotGateway,
  channelIdRaw: string,
  messageIdRaw: string,
  input: SendEmbedRequest,
  uploaded: EmbedUploadedFiles = {},
  expectedGuildId: string,
): Promise<{ orphaned: boolean; snapshot?: EmbedPayload }> {
  assertBotReady(gateway);
  const channelId = assertChannelId(channelIdRaw);
  if (!/^\d{17,20}$/.test(messageIdRaw.trim())) {
    throw new MessageSendError("Invalid messageId.", 400, "INVALID_MESSAGE_ID");
  }
  const messageId = messageIdRaw.trim();
  const prepared = prepareEmbed(input, uploaded);

  try {
    const { orphaned, embedMedia } = await gateway.editMessage(
      expectedGuildId,
      channelId,
      messageId,
      {
        content: prepared.content,
        embeds: prepared.embed ? [prepared.embed.toJSON()] : [],
        components: prepared.components?.map((row) => row.toJSON()) ?? [],
        files: attachmentsToOutgoingFiles(prepared.files),
      },
    );
    if (orphaned) return { orphaned: true };
    return {
      orphaned: false,
      snapshot: preparedToSnapshot(prepared, input, embedMedia),
    };
  } catch (error: unknown) {
    rethrowSend(error, "EDIT_FAILED", "edit");
  }
}

/** Borra un mensaje en Discord; `orphaned` si ya no existía (10008). */
export async function deleteDiscordMessage(
  gateway: BotGateway,
  channelIdRaw: string,
  messageIdRaw: string,
  expectedGuildId: string,
): Promise<{ orphaned: boolean }> {
  assertBotReady(gateway);
  const channelId = assertChannelId(channelIdRaw);
  const messageId = messageIdRaw.trim();
  try {
    return await gateway.deleteMessage(expectedGuildId, channelId, messageId);
  } catch (error: unknown) {
    rethrowSend(error, "DELETE_FAILED", "delete");
  }
}
