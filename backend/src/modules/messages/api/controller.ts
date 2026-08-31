import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  DiscordAPIError,
  EmbedBuilder,
  type AttachmentBuilder,
  type Client,
  type ColorResolvable,
  type SendableChannels,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type {
  MessageActionRowInput,
  MessageButtonInput,
  MessageButtonStyle,
  SendEmbedRequest,
  SendEmbedResponse,
  SendMessageRequest,
  SendMessageResponse,
} from "@adobos/shared";
import { getDb, one } from "../../../db/client.js";
import { guildSettings, sentEmbeds } from "../../../db/schema.js";
import {
  EmbedMediaError,
  requireHttpUrl,
  resolveEmbedMedia,
  resolveMulterEmbedMedia,
} from "../../../lib/embedMedia.js";

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

const BUTTON_STYLE_MAP: Record<MessageButtonStyle, ButtonStyle> = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
  Link: ButtonStyle.Link,
};

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
      "El bot de Discord no está conectado.",
      503,
      "BOT_NOT_READY",
    );
  }
}

function assertChannelId(channelId: string): string {
  const trimmed = channelId.trim();
  if (!/^\d{17,20}$/.test(trimmed)) {
    throw new MessageSendError(
      "channelId inválido. Debe ser un snowflake numérico de Discord.",
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
  let channel;
  try {
    channel = await bot.channels.fetch(channelId);
  } catch {
    throw new MessageSendError(
      "No se pudo obtener el canal. Verifica el ID y los permisos del bot.",
      404,
      "CHANNEL_FETCH_FAILED",
    );
  }

  if (!channel) {
    throw new MessageSendError("Canal no encontrado.", 404, "CHANNEL_NOT_FOUND");
  }

  const channelGuildId =
    "guildId" in channel && typeof channel.guildId === "string"
      ? channel.guildId
      : null;
  if (!channelGuildId || channelGuildId !== expectedGuildId) {
    throw new MessageSendError(
      "El canal no pertenece a este servidor.",
      403,
      "CHANNEL_GUILD_MISMATCH",
    );
  }

  if (
    channel.type === ChannelType.GuildCategory ||
    channel.type === ChannelType.GuildVoice ||
    !isSendableChannel(channel)
  ) {
    throw new MessageSendError(
      "El canal no admite mensajes de texto.",
      400,
      "CHANNEL_NOT_TEXT",
    );
  }

  return channel;
}

function parseHexColor(color?: string): ColorResolvable | undefined {
  if (!color?.trim()) return undefined;
  const raw = color.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
    throw new MessageSendError(
      "Color inválido. Usa formato hex (#RRGGBB).",
      400,
      "INVALID_COLOR",
    );
  }
  return Number.parseInt(raw, 16);
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

function buildButton(input: MessageButtonInput, index: number): ButtonBuilder {
  const label = input.label.trim();
  if (!label || label.length > 80) {
    throw new MessageSendError(
      `Botón #${index + 1}: la etiqueta es obligatoria (máx. 80 caracteres).`,
      400,
      "INVALID_BUTTON_LABEL",
    );
  }

  const style = BUTTON_STYLE_MAP[input.style];
  if (!style) {
    throw new MessageSendError(
      `Botón #${index + 1}: estilo inválido.`,
      400,
      "INVALID_BUTTON_STYLE",
    );
  }

  const button = new ButtonBuilder().setLabel(label).setStyle(style);

  if (input.disabled) {
    button.setDisabled(true);
  }

  if (input.emoji?.trim()) {
    button.setEmoji(input.emoji.trim());
  }

  if (input.style === "Link") {
    const url = optionalHttpUrl(input.url, `buttons[${index}].url`);
    if (!url) {
      throw new MessageSendError(
        `Botón Link #${index + 1}: se requiere una URL.`,
        400,
        "MISSING_BUTTON_URL",
      );
    }
    button.setURL(url);
  } else {
    const customId = input.customId?.trim();
    if (!customId || customId.length > 100) {
      throw new MessageSendError(
        `Botón #${index + 1}: se requiere customId (máx. 100 caracteres).`,
        400,
        "MISSING_BUTTON_CUSTOM_ID",
      );
    }
    button.setCustomId(customId);
  }

  return button;
}

function buildActionRows(
  rows: MessageActionRowInput[] | undefined,
): ActionRowBuilder<ButtonBuilder>[] | undefined {
  if (!rows?.length) return undefined;

  if (rows.length > 5) {
    throw new MessageSendError(
      "Máximo 5 filas de componentes por mensaje.",
      400,
      "TOO_MANY_ROWS",
    );
  }

  return rows.map((row, rowIndex) => {
    if (!row.buttons?.length) {
      throw new MessageSendError(
        `La fila #${rowIndex + 1} no tiene botones.`,
        400,
        "EMPTY_ACTION_ROW",
      );
    }
    if (row.buttons.length > 5) {
      throw new MessageSendError(
        `La fila #${rowIndex + 1} supera 5 botones.`,
        400,
        "TOO_MANY_BUTTONS",
      );
    }

    const actionRow = new ActionRowBuilder<ButtonBuilder>();
    actionRow.addComponents(
      row.buttons.map((button, buttonIndex) =>
        buildButton(button, rowIndex * 5 + buttonIndex),
      ),
    );
    return actionRow;
  });
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
      "El contenido del mensaje no puede estar vacío.",
      400,
      "EMPTY_CONTENT",
    );
  }

  if (content.length > 2000) {
    throw new MessageSendError(
      "El mensaje supera el límite de 2000 caracteres de Discord.",
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

/** Construye un EmbedBuilder (+ botones opcionales) y lo envía al canal. */
export async function sendEmbedMessage(
  bot: Client,
  input: SendEmbedRequest,
  uploaded: EmbedUploadedFiles = {},
  expectedGuildId: string,
): Promise<SendEmbedResponse> {
  assertBotReady(bot);
  const channelId = assertChannelId(input.channelId);

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
  const color = parseHexColor(input.color);
  const includeTimestamp = Boolean(input.timestamp);
  const components = buildActionRows(input.components);

  const hasEmbedBody = Boolean(
    title ||
      description ||
      authorName ||
      thumbnailUrl ||
      imageUrl ||
      footerText ||
      url,
  );

  if (!hasEmbedBody && !content && !components?.length) {
    throw new MessageSendError(
      "Debes indicar al menos un campo del embed, content o componentes.",
      400,
      "EMPTY_EMBED",
    );
  }

  if (title && title.length > 256) {
    throw new MessageSendError("El título supera 256 caracteres.", 400, "TITLE_TOO_LONG");
  }
  if (description && description.length > 4096) {
    throw new MessageSendError(
      "La descripción supera 4096 caracteres.",
      400,
      "DESCRIPTION_TOO_LONG",
    );
  }
  if (content && content.length > 2000) {
    throw new MessageSendError(
      "El content supera 2000 caracteres.",
      400,
      "CONTENT_TOO_LONG",
    );
  }

  const embed = new EmbedBuilder();
  if (title) embed.setTitle(title);
  if (url) embed.setURL(url);
  if (description) embed.setDescription(description);
  if (color !== undefined) embed.setColor(color);
  if (authorName) {
    embed.setAuthor({
      name: authorName,
      iconURL: authorIconUrl,
    });
  }
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  if (imageUrl) embed.setImage(imageUrl);
  if (footerText) {
    embed.setFooter({
      text: footerText,
      iconURL: footerIconUrl,
    });
  }
  if (includeTimestamp) {
    embed.setTimestamp(new Date());
  }

  const channel = await resolveSendableChannel(bot, channelId, expectedGuildId);

  try {
    const message = await channel.send({
      content,
      embeds: hasEmbedBody ? [embed] : undefined,
      components,
      files: files.length > 0 ? files : undefined,
    });

    const guildId = expectedGuildId;

    let sentId: string | undefined;
    if (/^\d{17,20}$/.test(guildId)) {
      const existingGuild = await one(getDb()
        .select()
        .from(guildSettings)
        .where(eq(guildSettings.guildId, guildId))
        .limit(1));
      if (!existingGuild) {
        await getDb()
          .insert(guildSettings)
          .values({
            guildId,
            prefix: "!",
            welcomeEnabled: false,
            updatedAt: new Date(),
          })
          ;
      }

      sentId = randomUUID();
      const snapshot = {
        content,
        title,
        url,
        description,
        color: input.color?.trim() || undefined,
        authorName,
        authorIconUrl,
        thumbnailUrl,
        imageUrl,
        footerText,
        footerIconUrl,
        timestamp: includeTimestamp,
        components: input.components,
      };
      const now = new Date();
      await getDb()
        .insert(sentEmbeds)
        .values({
          id: sentId,
          guildId,
          channelId: message.channelId,
          messageId: message.id,
          title: title ?? content?.slice(0, 80) ?? null,
          embedData: JSON.stringify(snapshot),
          createdAt: now,
          updatedAt: now,
        })
        ;
    }

    return {
      ok: true,
      messageId: message.id,
      channelId: message.channelId,
      sentId,
    };
  } catch (error: unknown) {
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
): Promise<{ orphaned: boolean }> {
  assertBotReady(bot);
  const channelId = assertChannelId(channelIdRaw);
  if (!/^\d{17,20}$/.test(messageIdRaw.trim())) {
    throw new MessageSendError("messageId inválido.", 400, "INVALID_MESSAGE_ID");
  }
  const messageId = messageIdRaw.trim();

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
  const color = parseHexColor(input.color);
  const includeTimestamp = Boolean(input.timestamp);
  const components = buildActionRows(input.components);

  const hasEmbedBody = Boolean(
    title ||
      description ||
      authorName ||
      thumbnailUrl ||
      imageUrl ||
      footerText ||
      url,
  );

  const embed = new EmbedBuilder();
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
  if (includeTimestamp) embed.setTimestamp(new Date());

  const channel = await resolveSendableChannel(bot, channelId, expectedGuildId);

  try {
    const message = await channel.messages.fetch(messageId);
    await message.edit({
      content: content ?? null,
      embeds: hasEmbedBody ? [embed] : [],
      components: components ?? [],
      files: files.length > 0 ? files : undefined,
    });
    return { orphaned: false };
  } catch (error: unknown) {
    if (isUnknownMessage(error)) {
      return { orphaned: true };
    }
    throw new MessageSendError(
      error instanceof Error ? error.message : "No se pudo editar el mensaje.",
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
      error instanceof Error ? error.message : "No se pudo borrar el mensaje.",
      502,
      "DELETE_FAILED",
    );
  }
}
