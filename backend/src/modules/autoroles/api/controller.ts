import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  type AttachmentBuilder,
  type Client,
  type ColorResolvable,
  type Message,
  type SendableChannels,
  type TextChannel,
} from "discord.js";
import type {
  ButtonRoleMappingInput,
  CreateAutoRoleRequest,
  CreateAutoRoleResponse,
  EmbedPayload,
  ReactionRoleMappingInput,
  SaveReactionRolesRequest,
  SaveReactionRolesResponse,
} from "@adobos/shared";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db/client.js";
import { guildSettings, reactionRolesMenus } from "../../../db/schema.js";
import {
  deleteReactionRolesForMessage,
  emojiKeyToResolvable,
  upsertReactionRoles,
} from "../../../db/reaction-roles.js";
import {
  fetchChannelInGuild,
  rethrowAsChannelError,
} from "../../../core/http/channelScope.js";
import {
  EmbedMediaError,
  requireHttpUrl,
  resolveEmbedMedia,
} from "../../../lib/embedMedia.js";

export class AutoRoleError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "AutoRoleError";
  }
}

const BUTTON_STYLE_MAP: Record<
  ButtonRoleMappingInput["style"],
  ButtonStyle
> = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

function ensureGuildRow(guildId: string): void {
  const db = getDb();
  const existing = db
    .select()
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId))
    .get();

  if (!existing) {
    db.insert(guildSettings)
      .values({
        guildId,
        prefix: "!",
        welcomeEnabled: false,
        updatedAt: new Date(),
      })
      .run();
  }
}

function assertSnowflake(value: string, field: string): string {
  const trimmed = value.trim();
  if (!/^\d{17,20}$/.test(trimmed)) {
    throw new AutoRoleError(
      `${field} debe ser un snowflake válido.`,
      400,
      "INVALID_IDS",
    );
  }
  return trimmed;
}

/** Acepta `custom:`, `unicode:`, `<:name:id>` o unicode crudo. */
export function normalizeEmojiKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new AutoRoleError("emojiKey vacío.", 400, "INVALID_EMOJI_KEY");
  }

  const mention = trimmed.match(/^<(a?):([\w]+):(\d{17,20})>$/);
  if (mention?.[3]) return `custom:${mention[3]}`;

  if (trimmed.startsWith("custom:") || trimmed.startsWith("unicode:")) {
    return trimmed;
  }

  return `unicode:${trimmed}`;
}

function parseHexColor(color?: string): ColorResolvable | undefined {
  if (!color?.trim()) return undefined;
  const raw = color.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
    throw new AutoRoleError("Color hex inválido.", 400, "INVALID_COLOR");
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
      throw new AutoRoleError(error.message, error.status, error.code);
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
      throw new AutoRoleError(error.message, error.status, error.code);
    }
    throw error;
  }
}

function buildEmbedFromPayload(embed: EmbedPayload): {
  builder: EmbedBuilder | null;
  files: AttachmentBuilder[];
} {
  const title = embed.title?.trim() || undefined;
  const description = embed.description?.trim() || undefined;
  const authorName = embed.authorName?.trim() || undefined;
  const footerText = embed.footerText?.trim() || undefined;
  const files: AttachmentBuilder[] = [];
  const url = optionalHttpUrl(embed.url, "url");
  const authorIconUrl = resolveMediaOrThrow(
    embed.authorIconUrl,
    "authorIconUrl",
    "author-icon",
    files,
  );
  const thumbnailUrl = resolveMediaOrThrow(
    embed.thumbnailUrl,
    "thumbnailUrl",
    "thumbnail",
    files,
  );
  const imageUrl = resolveMediaOrThrow(
    embed.imageUrl,
    "imageUrl",
    "image",
    files,
  );
  const footerIconUrl = resolveMediaOrThrow(
    embed.footerIconUrl,
    "footerIconUrl",
    "footer-icon",
    files,
  );
  const color = parseHexColor(embed.color);

  const hasBody = Boolean(
    title ||
      description ||
      authorName ||
      footerText ||
      thumbnailUrl ||
      imageUrl ||
      url,
  );
  if (!hasBody) return { builder: null, files };

  const builder = new EmbedBuilder();
  if (title) builder.setTitle(title);
  if (url) builder.setURL(url);
  if (description) builder.setDescription(description);
  if (color !== undefined) builder.setColor(color);
  if (authorName) builder.setAuthor({ name: authorName, iconURL: authorIconUrl });
  if (thumbnailUrl) builder.setThumbnail(thumbnailUrl);
  if (imageUrl) builder.setImage(imageUrl);
  if (footerText) builder.setFooter({ text: footerText, iconURL: footerIconUrl });
  if (embed.timestamp) builder.setTimestamp(new Date());
  return { builder, files };
}

function buildButtonRows(
  mappings: ButtonRoleMappingInput[],
): ActionRowBuilder<ButtonBuilder>[] {
  if (mappings.length === 0) {
    throw new AutoRoleError("Añade al menos un botón → rol.", 400, "EMPTY_BUTTONS");
  }
  if (mappings.length > 25) {
    throw new AutoRoleError("Máximo 25 botones (5×5).", 400, "TOO_MANY_BUTTONS");
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < mappings.length; i += 5) {
    const chunk = mappings.slice(i, i + 5);
    const row = new ActionRowBuilder<ButtonBuilder>();
    row.addComponents(
      chunk.map((mapping) => {
        const roleId = assertSnowflake(mapping.roleId, "roleId");
        const label = mapping.label.trim() || "Rol";
        const customId =
          mapping.customId.trim() || `autorole_${roleId}`;
        const button = new ButtonBuilder()
          .setCustomId(customId.slice(0, 100))
          .setLabel(label.slice(0, 80))
          .setStyle(BUTTON_STYLE_MAP[mapping.style] ?? ButtonStyle.Primary);

        if (mapping.emojiKey?.trim()) {
          const key = normalizeEmojiKey(mapping.emojiKey);
          if (key.startsWith("custom:")) {
            button.setEmoji({ id: key.slice("custom:".length) });
          } else if (key.startsWith("unicode:")) {
            button.setEmoji(key.slice("unicode:".length));
          }
        }

        return button;
      }),
    );
    rows.push(row);
  }
  return rows;
}

async function resolveSendableChannel(
  bot: Client,
  channelId: string,
  expectedGuildId: string,
): Promise<SendableChannels & TextChannel> {
  let channel;
  try {
    channel = await fetchChannelInGuild(bot, channelId, expectedGuildId);
  } catch (error: unknown) {
    rethrowAsChannelError(
      error,
      (message, status, code) => new AutoRoleError(message, status, code),
    );
  }
  if (
    channel.type === ChannelType.GuildCategory ||
    channel.type === ChannelType.GuildVoice ||
    !channel.isTextBased() ||
    !("send" in channel)
  ) {
    throw new AutoRoleError(
      "El canal no admite mensajes de texto.",
      400,
      "CHANNEL_NOT_TEXT",
    );
  }
  return channel as SendableChannels & TextChannel;
}

export function saveReactionRoleMappings(
  input: SaveReactionRolesRequest,
): SaveReactionRolesResponse {
  const guildId = assertSnowflake(input.guildId, "guildId");
  const channelId = assertSnowflake(input.channelId, "channelId");
  const messageId = assertSnowflake(input.messageId, "messageId");

  if (!Array.isArray(input.mappings) || input.mappings.length === 0) {
    throw new AutoRoleError(
      "Debes enviar al menos un mapping emoji → rol.",
      400,
      "EMPTY_MAPPINGS",
    );
  }

  const normalized = input.mappings.map((mapping) => ({
    emojiKey: normalizeEmojiKey(mapping.emojiKey),
    roleId: assertSnowflake(mapping.roleId, "roleId"),
  }));

  ensureGuildRow(guildId);
  deleteReactionRolesForMessage(messageId);
  upsertReactionRoles(
    normalized.map((mapping) => ({
      guildId,
      channelId,
      messageId,
      emojiKey: mapping.emojiKey,
      roleId: mapping.roleId,
    })),
  );

  return { ok: true, saved: normalized.length };
}

async function placeReactions(
  message: Message,
  mappings: ReactionRoleMappingInput[],
): Promise<void> {
  for (const mapping of mappings) {
    const key = normalizeEmojiKey(mapping.emojiKey);
    const emoji = emojiKeyToResolvable(key);
    if (!emoji) continue;
    await message.react(emoji).catch(() => undefined);
  }
}

function saveInteractiveMenu(input: {
  guildId: string;
  channelId: string;
  messageId: string;
  mode: "buttons" | "reactions";
  rolesMapping: unknown;
}): void {
  ensureGuildRow(input.guildId);
  const db = getDb();
  const now = new Date();
  const json = JSON.stringify(input.rolesMapping);
  const existing = db
    .select()
    .from(reactionRolesMenus)
    .where(eq(reactionRolesMenus.messageId, input.messageId))
    .get();

  if (existing) {
    db.update(reactionRolesMenus)
      .set({
        channelId: input.channelId,
        mode: input.mode,
        rolesMapping: json,
        updatedAt: now,
      })
      .where(eq(reactionRolesMenus.id, existing.id))
      .run();
    return;
  }

  db.insert(reactionRolesMenus)
    .values({
      guildId: input.guildId,
      channelId: input.channelId,
      messageId: input.messageId,
      mode: input.mode,
      rolesMapping: json,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

/** Endpoint todo-en-uno: crea mensaje (opcional) + guarda mappings. */
export async function createAutoRoleSetup(
  bot: Client,
  input: CreateAutoRoleRequest,
): Promise<CreateAutoRoleResponse> {
  if (!bot.isReady()) {
    throw new AutoRoleError("El bot no está conectado.", 503, "BOT_NOT_READY");
  }

  const guildId = assertSnowflake(input.guildId, "guildId");
  const channelId = assertSnowflake(input.channelId, "channelId");
  const channel = await resolveSendableChannel(bot, channelId, guildId);

  let messageId: string;
  let saved = 0;

  if (input.messageSource === "existing") {
    messageId = assertSnowflake(input.messageId ?? "", "messageId");
    const existing = await channel.messages.fetch(messageId).catch(() => null);
    if (!existing) {
      throw new AutoRoleError(
        "No se encontró ese mensaje en el canal.",
        404,
        "MESSAGE_NOT_FOUND",
      );
    }

    if (input.mode === "reactions") {
      const mappings = input.reactionMappings ?? [];
      const result = saveReactionRoleMappings({
        guildId,
        channelId,
        messageId,
        mappings,
      });
      await placeReactions(existing, mappings);
      saved = result.saved;
      saveInteractiveMenu({
        guildId,
        channelId,
        messageId,
        mode: "reactions",
        rolesMapping: mappings,
      });
    } else {
      const buttons = input.buttonMappings ?? [];
      if (buttons.length === 0) {
        throw new AutoRoleError(
          "Añade al menos un botón → rol.",
          400,
          "EMPTY_BUTTONS",
        );
      }
      const components = buildButtonRows(buttons);
      await existing.edit({ components }).catch((error: unknown) => {
        throw new AutoRoleError(
          error instanceof Error
            ? `No se pudo editar el mensaje: ${error.message}`
            : "No se pudo editar el mensaje (¿faltan permisos?).",
          403,
          "MESSAGE_EDIT_FAILED",
        );
      });
      saved = buttons.length;
      saveInteractiveMenu({
        guildId,
        channelId,
        messageId,
        mode: "buttons",
        rolesMapping: buttons,
      });
    }

    return { ok: true, messageId, channelId, saved };
  }

  // messageSource === "create"
  const embedPayload = input.embed ?? {};
  const content = embedPayload.content?.trim() || undefined;
  const { builder: embed, files } = buildEmbedFromPayload(embedPayload);

  if (input.mode === "reactions") {
    const mappings = input.reactionMappings ?? [];
    if (mappings.length === 0) {
      throw new AutoRoleError(
        "Añade al menos un emoji → rol.",
        400,
        "EMPTY_MAPPINGS",
      );
    }
    if (!embed && !content) {
      throw new AutoRoleError(
        "El embed/mensaje no puede estar vacío.",
        400,
        "EMPTY_EMBED",
      );
    }

    const message = await channel.send({
      content,
      embeds: embed ? [embed] : undefined,
      files: files.length > 0 ? files : undefined,
    });

    const result = saveReactionRoleMappings({
      guildId,
      channelId,
      messageId: message.id,
      mappings,
    });
    await placeReactions(message, mappings);
    saveInteractiveMenu({
      guildId,
      channelId,
      messageId: message.id,
      mode: "reactions",
      rolesMapping: mappings,
    });

    return {
      ok: true,
      messageId: message.id,
      channelId,
      saved: result.saved,
    };
  }

  // mode === buttons + create
  const buttonMappings = input.buttonMappings ?? [];
  const components = buildButtonRows(buttonMappings);
  if (!embed && !content) {
    throw new AutoRoleError(
      "El embed/mensaje no puede estar vacío.",
      400,
      "EMPTY_EMBED",
    );
  }

  const message = await channel.send({
    content,
    embeds: embed ? [embed] : undefined,
    components,
    files: files.length > 0 ? files : undefined,
  });

  saveInteractiveMenu({
    guildId,
    channelId,
    messageId: message.id,
    mode: "buttons",
    rolesMapping: buttonMappings,
  });

  return {
    ok: true,
    messageId: message.id,
    channelId,
    saved: buttonMappings.length,
  };
}
