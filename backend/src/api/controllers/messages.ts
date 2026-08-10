import {
  ChannelType,
  EmbedBuilder,
  type Client,
  type ColorResolvable,
  type SendableChannels,
} from "discord.js";
import type {
  SendEmbedRequest,
  SendEmbedResponse,
  SendMessageRequest,
  SendMessageResponse,
} from "@adobos/shared";

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

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function optionalUrl(value: string | undefined, field: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!isHttpUrl(trimmed)) {
    throw new MessageSendError(
      `${field} debe ser una URL http(s) válida.`,
      400,
      "INVALID_URL",
    );
  }
  return trimmed;
}

/** Envía un mensaje de texto simple a un canal de Discord. */
export async function sendTextMessage(
  bot: Client,
  input: SendMessageRequest,
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

  const channel = await resolveSendableChannel(bot, channelId);

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

/** Construye un EmbedBuilder y lo envía al canal indicado. */
export async function sendEmbedMessage(
  bot: Client,
  input: SendEmbedRequest,
): Promise<SendEmbedResponse> {
  assertBotReady(bot);
  const channelId = assertChannelId(input.channelId);

  const title = input.title?.trim() || undefined;
  const description = input.description?.trim() || undefined;
  const content = input.content?.trim() || undefined;
  const authorName = input.authorName?.trim() || undefined;
  const footerText = input.footerText?.trim() || undefined;
  const authorIconUrl = optionalUrl(input.authorIconUrl, "authorIconUrl");
  const thumbnailUrl = optionalUrl(input.thumbnailUrl, "thumbnailUrl");
  const imageUrl = optionalUrl(input.imageUrl, "imageUrl");
  const footerIconUrl = optionalUrl(input.footerIconUrl, "footerIconUrl");
  const color = parseHexColor(input.color);

  const hasEmbedBody = Boolean(
    title ||
      description ||
      authorName ||
      thumbnailUrl ||
      imageUrl ||
      footerText,
  );

  if (!hasEmbedBody && !content) {
    throw new MessageSendError(
      "Debes indicar al menos un campo del embed o un content de texto.",
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
  embed.setTimestamp(new Date());

  const channel = await resolveSendableChannel(bot, channelId);

  try {
    const message = await channel.send({
      content,
      embeds: hasEmbedBody ? [embed] : undefined,
    });
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
