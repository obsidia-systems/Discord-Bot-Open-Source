import type {
  ButtonRoleMappingInput,
  CreateAutoRoleRequest,
  CreateAutoRoleResponse,
  EmbedPayload,
  ReactionRoleMappingInput,
  SaveReactionRolesRequest,
  SaveReactionRolesResponse,
} from "@adobos/shared";
import {
  AUTOROLE_BUTTONS_MAX,
  AUTOROLE_REACTIONS_MAX,
  isAutoroleSendChannelType,
  normalizeAutoroleEmojiKey,
} from "@adobos/shared";
import {
  ActionRowBuilder,
  type AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
  type ColorResolvable,
  EmbedBuilder,
  type Message,
  type SendableChannels,
  type TextChannel,
} from "discord.js";
import { eq } from "drizzle-orm";
import {
  fetchChannelInGuild,
  rethrowAsChannelError,
} from "../../../core/http/channelScope.js";
import { getDb, one } from "../../../db/client.js";
import {
  deleteReactionRolesForMessage,
  emojiKeyToResolvable,
  upsertReactionRoles,
} from "../../../db/reaction-roles.js";
import { guildSettings, reactionRolesMenus } from "../../../db/schema.js";
import {
  EmbedMediaError,
  requireHttpUrl,
  resolveEmbedMedia,
} from "../../../lib/embedMedia.js";
import { assertAssignableRoleIds } from "../assignable.js";
import { AutoRoleError } from "../errors.js";

export { AutoRoleError };

const BUTTON_STYLE_MAP: Record<ButtonRoleMappingInput["style"], ButtonStyle> = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

async function ensureGuildRow(guildId: string): Promise<void> {
  const db = getDb();
  const existing = await one(
    db
      .select()
      .from(guildSettings)
      .where(eq(guildSettings.guildId, guildId))
      .limit(1),
  );

  if (!existing) {
    await db.insert(guildSettings).values({
      guildId,
      prefix: "!",
      welcomeEnabled: false,
      updatedAt: new Date(),
    });
  }
}

function assertSnowflake(value: string, field: string): string {
  const trimmed = value.trim();
  if (!/^\d{17,20}$/.test(trimmed)) {
    throw new AutoRoleError(
      `${field} must be a valid snowflake.`,
      400,
      "INVALID_IDS",
    );
  }
  return trimmed;
}

/** Acepta `custom:`, `unicode:`, `<:name:id>` o unicode crudo. */
export function normalizeEmojiKey(raw: string): string {
  try {
    return normalizeAutoroleEmojiKey(raw);
  } catch {
    throw new AutoRoleError("emojiKey is empty.", 400, "INVALID_EMOJI_KEY");
  }
}

function parseHexColor(color?: string): ColorResolvable | undefined {
  if (!color?.trim()) return undefined;
  const raw = color.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
    throw new AutoRoleError("Invalid hex color.", 400, "INVALID_COLOR");
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
  if (authorName)
    builder.setAuthor({ name: authorName, iconURL: authorIconUrl });
  if (thumbnailUrl) builder.setThumbnail(thumbnailUrl);
  if (imageUrl) builder.setImage(imageUrl);
  if (footerText)
    builder.setFooter({ text: footerText, iconURL: footerIconUrl });
  if (embed.timestamp) builder.setTimestamp(new Date());
  return { builder, files };
}

function buildButtonRows(
  mappings: ButtonRoleMappingInput[],
): ActionRowBuilder<ButtonBuilder>[] {
  if (mappings.length === 0) {
    throw new AutoRoleError(
      "Add at least one button → role.",
      400,
      "EMPTY_BUTTONS",
    );
  }
  if (mappings.length > AUTOROLE_BUTTONS_MAX) {
    throw new AutoRoleError(
      `At most ${AUTOROLE_BUTTONS_MAX} buttons (5×5).`,
      400,
      "TOO_MANY_BUTTONS",
    );
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < mappings.length; i += 5) {
    const chunk = mappings.slice(i, i + 5);
    const row = new ActionRowBuilder<ButtonBuilder>();
    row.addComponents(
      chunk.map((mapping) => {
        const roleId = assertSnowflake(mapping.roleId, "roleId");
        const label = mapping.label.trim() || "Role";
        const customId = mapping.customId.trim() || `autorole_${roleId}`;
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
  let channel: Awaited<ReturnType<typeof fetchChannelInGuild>>;
  try {
    channel = await fetchChannelInGuild(bot, channelId, expectedGuildId);
  } catch (error: unknown) {
    rethrowAsChannelError(
      error,
      (message, status, code) => new AutoRoleError(message, status, code),
    );
  }
  if (
    !isAutoroleSendChannelType(channel.type) ||
    !channel.isTextBased() ||
    !("send" in channel)
  ) {
    throw new AutoRoleError(
      "The channel does not support text messages.",
      400,
      "CHANNEL_NOT_TEXT",
    );
  }
  return channel as SendableChannels & TextChannel;
}

export async function saveReactionRoleMappings(
  input: SaveReactionRolesRequest,
  bot: Client,
): Promise<SaveReactionRolesResponse> {
  const guildId = assertSnowflake(input.guildId, "guildId");
  const channelId = assertSnowflake(input.channelId, "channelId");
  const messageId = assertSnowflake(input.messageId, "messageId");

  if (!Array.isArray(input.mappings) || input.mappings.length === 0) {
    throw new AutoRoleError(
      "You must send at least one emoji → role mapping.",
      400,
      "EMPTY_MAPPINGS",
    );
  }
  if (input.mappings.length > AUTOROLE_REACTIONS_MAX) {
    throw new AutoRoleError(
      `At most ${AUTOROLE_REACTIONS_MAX} reactions per message.`,
      400,
      "TOO_MANY_REACTIONS",
    );
  }

  const normalized = input.mappings.map((mapping) => ({
    emojiKey: normalizeEmojiKey(mapping.emojiKey),
    roleId: assertSnowflake(mapping.roleId, "roleId"),
  }));
  await assertAssignableRoleIds(
    bot,
    guildId,
    normalized.map((mapping) => mapping.roleId),
  );

  await ensureGuildRow(guildId);
  await deleteReactionRolesForMessage(messageId);
  await upsertReactionRoles(
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

async function saveInteractiveMenu(input: {
  guildId: string;
  channelId: string;
  messageId: string;
  mode: "buttons" | "reactions";
  rolesMapping: unknown;
}): Promise<void> {
  await ensureGuildRow(input.guildId);
  const db = getDb();
  const now = new Date();
  const json = JSON.stringify(input.rolesMapping);
  const existing = await one(
    db
      .select()
      .from(reactionRolesMenus)
      .where(eq(reactionRolesMenus.messageId, input.messageId))
      .limit(1),
  );

  if (existing) {
    await db
      .update(reactionRolesMenus)
      .set({
        channelId: input.channelId,
        mode: input.mode,
        rolesMapping: json,
        updatedAt: now,
      })
      .where(eq(reactionRolesMenus.id, existing.id));
    return;
  }

  await db.insert(reactionRolesMenus).values({
    guildId: input.guildId,
    channelId: input.channelId,
    messageId: input.messageId,
    mode: input.mode,
    rolesMapping: json,
    createdAt: now,
    updatedAt: now,
  });
}

/** Endpoint todo-en-uno: crea mensaje (opcional) + guarda mappings. */
export async function createAutoRoleSetup(
  bot: Client,
  input: CreateAutoRoleRequest,
): Promise<CreateAutoRoleResponse> {
  if (!bot.isReady()) {
    throw new AutoRoleError("The bot is not connected.", 503, "BOT_NOT_READY");
  }

  const guildId = assertSnowflake(input.guildId, "guildId");
  const channelId = assertSnowflake(input.channelId, "channelId");
  const roleIds = [
    ...(input.reactionMappings ?? []).map((mapping) => mapping.roleId),
    ...(input.buttonMappings ?? []).map((mapping) => mapping.roleId),
  ];
  await assertAssignableRoleIds(bot, guildId, roleIds);
  const channel = await resolveSendableChannel(bot, channelId, guildId);

  let messageId: string;
  let saved = 0;

  if (input.messageSource === "existing") {
    messageId = assertSnowflake(input.messageId ?? "", "messageId");
    const existing = await channel.messages.fetch(messageId).catch(() => null);
    if (!existing) {
      throw new AutoRoleError(
        "That message was not found in the channel.",
        404,
        "MESSAGE_NOT_FOUND",
      );
    }

    if (input.mode === "reactions") {
      const mappings = input.reactionMappings ?? [];
      const result = await saveReactionRoleMappings(
        {
          guildId,
          channelId,
          messageId,
          mappings,
        },
        bot,
      );
      await placeReactions(existing, mappings);
      saved = result.saved;
      await saveInteractiveMenu({
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
          "Add at least one button → role.",
          400,
          "EMPTY_BUTTONS",
        );
      }
      const components = buildButtonRows(buttons);
      await existing.edit({ components }).catch((error: unknown) => {
        throw new AutoRoleError(
          error instanceof Error
            ? `Couldn't edit the message: ${error.message}`
            : "Couldn't edit the message (missing permissions?).",
          403,
          "MESSAGE_EDIT_FAILED",
        );
      });
      saved = buttons.length;
      await saveInteractiveMenu({
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
        "Add at least one emoji → role.",
        400,
        "EMPTY_MAPPINGS",
      );
    }
    if (!embed && !content) {
      throw new AutoRoleError(
        "The embed/message can't be empty.",
        400,
        "EMPTY_EMBED",
      );
    }

    const message = await channel.send({
      content,
      embeds: embed ? [embed] : undefined,
      files: files.length > 0 ? files : undefined,
    });

    const result = await saveReactionRoleMappings(
      {
        guildId,
        channelId,
        messageId: message.id,
        mappings,
      },
      bot,
    );
    await placeReactions(message, mappings);
    await saveInteractiveMenu({
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
      "The embed/message can't be empty.",
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

  await saveInteractiveMenu({
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
