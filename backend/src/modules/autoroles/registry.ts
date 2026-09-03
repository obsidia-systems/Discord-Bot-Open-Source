import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  DiscordAPIError,
  StringSelectMenuBuilder,
  type AttachmentBuilder,
  type Client,
  type EmbedBuilder,
  type Message,
  type SendableChannels,
  type TextChannel,
} from "discord.js";
import { and, desc, eq } from "drizzle-orm";
import type {
  AutoroleMappingItem,
  AutoroleRegistryEntry,
  AutoroleRegistryType,
  CreateAutoroleCompactRequest,
  CreateAutoRoleResponse,
  DeleteAutoroleResponse,
  EmbedPayload,
  ListActiveAutorolesResponse,
  UpdateAutoroleContentRequest,
  UpdateAutoroleContentResponse,
  UpdateAutoroleMappingRequest,
  UpdateAutoroleMappingResponse,
} from "@adobos/shared";
import {
  AUTOROLE_BUTTONS_MAX,
  autoroleMappingLimit,
  isAutoroleSendChannelType,
} from "@adobos/shared";
import { getDb, one } from "../../db/client.js";
import { autorolesRegistry, guildSettings } from "../../db/schema.js";
import {
  deleteReactionRolesForMessage,
  emojiKeyToResolvable,
  upsertReactionRoles,
} from "../../db/reaction-roles.js";
import { getEmbedTemplate } from "../messages/templates/service.js";
import { buildEmbedFromPayload } from "../moderation/dm.js";
import { logger } from "../../core/log.js";
import { AutoRoleError } from "./errors.js";
import { assertAssignableRoleIds } from "./assignable.js";
import {
  createAutoRoleSetup,
  normalizeEmojiKey,
} from "./api/controller.js";
import {
  fetchChannelInGuild,
  rethrowAsChannelError,
} from "../../core/http/channelScope.js";

const BUTTON_STYLE_MAP: Record<
  NonNullable<AutoroleMappingItem["style"]>,
  ButtonStyle
> = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

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

function resolveGuildId(raw?: string): string {
  return assertSnowflake(
    raw?.trim() || "",
    "guildId",
  );
}

async function ensureGuildRow(guildId: string): Promise<void> {
  const existing = await one(getDb()
    .select()
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId))
    .limit(1));
  if (!existing) {
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
}

function isUnknownMessage(error: unknown): boolean {
  return error instanceof DiscordAPIError && error.code === 10008;
}

function parseMappings(raw: string): AutoroleMappingItem[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const items: AutoroleMappingItem[] = [];
    for (const [index, rawItem] of parsed.entries()) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const item = rawItem as Record<string, unknown>;
      const roleId = typeof item.roleId === "string" ? item.roleId : "";
      if (!/^\d{17,20}$/.test(roleId)) continue;
      let style: AutoroleMappingItem["style"] = "Primary";
      if (
        item.style === "Primary" ||
        item.style === "Secondary" ||
        item.style === "Success" ||
        item.style === "Danger"
      ) {
        style = item.style;
      }
      items.push({
        id:
          typeof item.id === "string"
            ? item.id
            : `map_${index}_${roleId}`,
        roleId,
        label: typeof item.label === "string" ? item.label : "Role",
        emojiKey:
          typeof item.emojiKey === "string"
            ? item.emojiKey
            : typeof item.emoji === "string"
              ? item.emoji
              : undefined,
        style,
      });
    }
    return items;
  } catch {
    return [];
  }
}

function normalizeMappings(
  mappings: AutoroleMappingItem[],
  type: AutoroleRegistryType,
): AutoroleMappingItem[] {
  if (!Array.isArray(mappings) || mappings.length === 0) {
    throw new AutoRoleError(
      "Add at least one role assignment.",
      400,
      "EMPTY_MAPPINGS",
    );
  }
  const limit = autoroleMappingLimit(type);
  if (mappings.length > limit) {
    throw new AutoRoleError(
      type === "REACTIONS"
        ? `At most ${limit} reactions per message.`
        : `At most ${limit} ${type === "SELECT" ? "menu options" : "buttons (5×5)"}.`,
      400,
      type === "REACTIONS" ? "TOO_MANY_REACTIONS" : type === "SELECT" ? "TOO_MANY_OPTIONS" : "TOO_MANY_BUTTONS",
    );
  }
  return mappings.map((item, index) => {
    const roleId = assertSnowflake(item.roleId, "roleId");
    return {
      id: item.id?.trim() || `map_${index}_${roleId}`,
      roleId,
      label: (item.label?.trim() || "Rol").slice(0, 80),
      emojiKey: item.emojiKey?.trim()
        ? normalizeEmojiKey(item.emojiKey)
        : undefined,
      style: item.style ?? "Primary",
    };
  });
}

function toEntry(row: {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string;
  title: string;
  type: string;
  rolesMapping: string;
  createdAt: Date | number;
  channelName?: string | null;
  orphaned?: boolean;
  isBotAuthor?: boolean | null;
}): AutoroleRegistryEntry {
  const type = (["BUTTONS", "SELECT", "REACTIONS"].includes(row.type)
    ? row.type
    : "BUTTONS") as AutoroleRegistryType;
  return {
    id: row.id,
    guildId: row.guildId,
    channelId: row.channelId,
    messageId: row.messageId,
    title: row.title,
    type,
    rolesMapping: parseMappings(row.rolesMapping),
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date(row.createdAt).toISOString(),
    channelName: row.channelName ?? null,
    orphaned: row.orphaned,
    isBotAuthor: row.isBotAuthor ?? null,
  };
}

async function upsertRegistry(input: {
  guildId: string;
  channelId: string;
  messageId: string;
  title: string;
  type: AutoroleRegistryType;
  mappings: AutoroleMappingItem[];
}): Promise<number> {
  await ensureGuildRow(input.guildId);
  const db = getDb();
  const now = new Date();
  const json = JSON.stringify(input.mappings);
  const existing = await one(
    db
    .select()
    .from(autorolesRegistry)
    .where(eq(autorolesRegistry.messageId, input.messageId))
    .limit(1)
  );

  if (existing) {
    await db.update(autorolesRegistry)
      .set({
        channelId: input.channelId,
        title: input.title,
        type: input.type,
        rolesMapping: json,
        updatedAt: now,
      })
      .where(eq(autorolesRegistry.id, existing.id))
      ;
    return existing.id;
  }

  const [inserted] = await db
    .insert(autorolesRegistry)
    .values({
      guildId: input.guildId,
      channelId: input.channelId,
      messageId: input.messageId,
      title: input.title,
      type: input.type,
      rolesMapping: json,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: autorolesRegistry.id });
  if (!inserted) {
    throw new AutoRoleError(
      "Couldn't register the autoroles menu.",
      500,
      "INSERT_FAILED",
    );
  }
  return inserted.id;
}

async function resolveChannel(
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

function buildButtonComponents(mappings: AutoroleMappingItem[]) {
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
        const button = new ButtonBuilder()
          .setCustomId(`autorole_${mapping.roleId}`.slice(0, 100))
          .setLabel(mapping.label.slice(0, 80))
          .setStyle(BUTTON_STYLE_MAP[mapping.style ?? "Primary"] ?? ButtonStyle.Primary);
        if (mapping.emojiKey) {
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

function buildSelectComponents(mappings: AutoroleMappingItem[]) {
  if (mappings.length > AUTOROLE_BUTTONS_MAX) {
    throw new AutoRoleError(
      `At most ${AUTOROLE_BUTTONS_MAX} menu options.`,
      400,
      "TOO_MANY_OPTIONS",
    );
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId("autorole_select")
    .setPlaceholder("Choose a role…")
    .addOptions(
      mappings.map((mapping) => {
        const base = {
          label: mapping.label.slice(0, 100),
          value: mapping.roleId,
        };
        if (!mapping.emojiKey) return base;
        const key = normalizeEmojiKey(mapping.emojiKey);
        if (key.startsWith("custom:")) {
          return { ...base, emoji: { id: key.slice("custom:".length) } };
        }
        if (key.startsWith("unicode:")) {
          return { ...base, emoji: key.slice("unicode:".length) };
        }
        return base;
      }),
    );
  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)];
}

async function applyComponentsOrReactions(
  message: Message,
  type: AutoroleRegistryType,
  mappings: AutoroleMappingItem[],
  guildId: string,
  channelId: string,
): Promise<void> {
  if (type === "REACTIONS") {
    const reactionMappings = mappings
      .filter((m) => m.emojiKey)
      .map((m) => ({
        emojiKey: m.emojiKey!,
        roleId: m.roleId,
      }));
    if (reactionMappings.length === 0) {
      throw new AutoRoleError(
        "Reactions require one emoji per role.",
        400,
        "EMPTY_EMOJI",
      );
    }
    await deleteReactionRolesForMessage(message.id);
    await upsertReactionRoles(
      reactionMappings.map((m) => ({
        guildId,
        channelId,
        messageId: message.id,
        emojiKey: normalizeEmojiKey(m.emojiKey),
        roleId: m.roleId,
      })),
    );
    for (const mapping of reactionMappings) {
      const emoji = emojiKeyToResolvable(normalizeEmojiKey(mapping.emojiKey));
      if (!emoji) continue;
      await message.react(emoji).catch(() => undefined);
    }
    await message.edit({ components: [] }).catch(() => undefined);
    return;
  }

  const components =
    type === "SELECT"
      ? buildSelectComponents(mappings)
      : buildButtonComponents(mappings);
  await message.edit({ components });
}

export async function listActiveAutoroles(
  bot: Client,
  guildIdRaw?: string,
): Promise<ListActiveAutorolesResponse> {
  const guildId = resolveGuildId(guildIdRaw);
  const rows = await getDb()
    .select()
    .from(autorolesRegistry)
    .where(eq(autorolesRegistry.guildId, guildId))
    .orderBy(desc(autorolesRegistry.createdAt))
    ;

  const guild = bot.guilds.cache.get(guildId);
  const botUserId = bot.user?.id ?? null;

  const entries = await Promise.all(
    rows.map(async (row) => {
      const channel = guild?.channels.cache.get(row.channelId);
      const channelName =
        channel && "name" in channel ? String(channel.name) : null;

      let isBotAuthor: boolean | null = null;
      let orphaned = false;

      try {
        const textChannel = await resolveChannel(bot, row.channelId, guildId);
        const message = await textChannel.messages.fetch(row.messageId);
        isBotAuthor = Boolean(botUserId && message.author.id === botUserId);
      } catch (error: unknown) {
        if (isUnknownMessage(error)) {
          orphaned = true;
          isBotAuthor = null;
        } else {
          isBotAuthor = null;
        }
      }

      return toEntry({
        ...row,
        channelName,
        orphaned,
        isBotAuthor,
      });
    }),
  );

  return { entries };
}

export async function createAutoroleCompact(
  bot: Client,
  input: CreateAutoroleCompactRequest,
): Promise<CreateAutoRoleResponse> {
  if (!bot.isReady()) {
    throw new AutoRoleError("The bot is not connected.", 503, "BOT_NOT_READY");
  }

  const guildId = assertSnowflake(input.guildId, "guildId");
  const channelId = assertSnowflake(input.channelId, "channelId");
  const type = input.type;
  const mappings = normalizeMappings(input.mappings, type);
  await assertAssignableRoleIds(
    bot,
    guildId,
    mappings.map((mapping) => mapping.roleId),
  );
  const title =
    input.title?.trim() ||
    (input.source === "template"
      ? "Autoroles (template)"
      : input.source === "existing"
        ? "Autoroles (existing message)"
        : "Autoroles");

  const mode = type === "REACTIONS" ? "reactions" : "buttons";

  let embed: EmbedPayload | undefined;
  let messageSource: "existing" | "create" = "create";
  let messageId = input.messageId;

  if (input.source === "existing") {
    messageSource = "existing";
    messageId = assertSnowflake(input.messageId ?? "", "messageId");
    const duplicate = await one(getDb()
      .select({ id: autorolesRegistry.id })
      .from(autorolesRegistry)
      .where(
        and(
          eq(autorolesRegistry.guildId, guildId),
          eq(autorolesRegistry.messageId, messageId),
        ),
      )
      .limit(1));
    if (duplicate) {
      throw new AutoRoleError(
        "This message already has an active autorole. Visit «Active Messages» to manage it.",
        409,
        "ALREADY_CONFIGURED",
      );
    }
  } else if (input.source === "template") {
    if (typeof input.templateId !== "number" || !Number.isFinite(input.templateId)) {
      throw new AutoRoleError(
        "Select an embed template.",
        400,
        "MISSING_TEMPLATE",
      );
    }
    const template = await getEmbedTemplate(input.templateId, guildId);
    embed = template.embedData;
  } else {
    const plain = input.plainContent?.trim();
    if (!plain) {
      throw new AutoRoleError(
        "Type the message text.",
        400,
        "EMPTY_CONTENT",
      );
    }
    embed = { content: plain };
  }

  // SELECT usa filas de botones en createAutoRoleSetup vía buttonMappings;
  // luego reescribimos components a select en registry apply.
  const result = await createAutoRoleSetup(bot, {
    mode: type === "REACTIONS" ? "reactions" : "buttons",
    guildId,
    channelId,
    messageSource,
    messageId,
    embed: messageSource === "create" ? embed : undefined,
    title,
    reactionMappings:
      mode === "reactions"
        ? mappings
            .filter((m) => m.emojiKey)
            .map((m) => ({ emojiKey: m.emojiKey!, roleId: m.roleId }))
        : undefined,
    buttonMappings:
      mode === "buttons"
        ? mappings.map((m) => ({
            roleId: m.roleId,
            label: m.label,
            style: m.style ?? "Primary",
            customId: `autorole_${m.roleId}`,
            emojiKey: m.emojiKey,
          }))
        : undefined,
  });

  if (type === "SELECT") {
    const channel = await resolveChannel(bot, channelId, guildId);
    const message = await channel.messages.fetch(result.messageId);
    await message.edit({ components: buildSelectComponents(mappings) });
  }

  const registryId = await upsertRegistry({
    guildId,
    channelId,
    messageId: result.messageId,
    title,
    type,
    mappings,
  });

  return { ...result, registryId };
}

export async function updateAutoroleMapping(
  bot: Client,
  idRaw: number,
  input: UpdateAutoroleMappingRequest,
  guildIdRaw?: string,
): Promise<UpdateAutoroleMappingResponse> {
  const guildId = resolveGuildId(guildIdRaw);
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    throw new AutoRoleError("Invalid ID.", 400, "INVALID_ID");
  }

  const row = await one(getDb()
    .select()
    .from(autorolesRegistry)
    .where(eq(autorolesRegistry.id, id))
    .limit(1));

  if (!row || row.guildId !== guildId) {
    throw new AutoRoleError("Record not found.", 404, "NOT_FOUND");
  }

  const type = row.type as AutoroleRegistryType;
  const mappings = normalizeMappings(input.mappings, type);
  await assertAssignableRoleIds(
    bot,
    guildId,
    mappings.map((mapping) => mapping.roleId),
  );
  const channel = await resolveChannel(bot, row.channelId, guildId);

  let orphaned = false;
  try {
    const message = await channel.messages.fetch(row.messageId);
    await applyComponentsOrReactions(
      message,
      type,
      mappings,
      guildId,
      row.channelId,
    );
  } catch (error: unknown) {
    if (isUnknownMessage(error)) {
      orphaned = true;
    } else {
      throw new AutoRoleError(
        error instanceof Error
          ? error.message
          : "Couldn't update the message on Discord.",
        502,
        "DISCORD_EDIT_FAILED",
      );
    }
  }

  const now = new Date();
  await getDb()
    .update(autorolesRegistry)
    .set({
      rolesMapping: JSON.stringify(mappings),
      updatedAt: now,
    })
    .where(eq(autorolesRegistry.id, id))
    ;

  const updated = await one(getDb()
    .select()
    .from(autorolesRegistry)
    .where(eq(autorolesRegistry.id, id))
    .limit(1));
  if (!updated) {
    throw new AutoRoleError("Record not found.", 404, "NOT_FOUND");
  }

  return {
    ok: true,
    orphaned,
    entry: toEntry({
      ...updated,
      orphaned,
      channelName: null,
    }),
  };
}

export async function updateAutoroleContent(
  bot: Client,
  idRaw: number,
  input: UpdateAutoroleContentRequest,
  guildIdRaw?: string,
): Promise<UpdateAutoroleContentResponse> {
  const guildId = resolveGuildId(guildIdRaw);
  const id = Number(idRaw);
  const row = await one(getDb()
    .select()
    .from(autorolesRegistry)
    .where(eq(autorolesRegistry.id, id))
    .limit(1));

  if (!row || row.guildId !== guildId) {
    throw new AutoRoleError("Record not found.", 404, "NOT_FOUND");
  }

  const channel = await resolveChannel(bot, row.channelId, guildId);
  let orphaned = false;
  let isBotAuthor: boolean | null = null;

  try {
    const message = await channel.messages.fetch(row.messageId);
    isBotAuthor = Boolean(bot.user && message.author.id === bot.user.id);

    if (!isBotAuthor) {
      throw new AutoRoleError(
        "Discord does not allow bots to edit the text or embed of messages sent by human users.",
        403,
        "NOT_BOT_AUTHOR",
      );
    }

    const patch: {
      content?: string;
      embeds?: EmbedBuilder[];
      files?: AttachmentBuilder[];
    } = {};

    // Partimos del embed existente para no perder campos no enviados.
    const existing = message.embeds[0];
    const baseEmbed: EmbedPayload = existing
      ? {
          title: existing.title ?? undefined,
          description: existing.description ?? undefined,
          url: existing.url ?? undefined,
          color: existing.hexColor ?? undefined,
          authorName: existing.author?.name ?? undefined,
          authorIconUrl: existing.author?.iconURL ?? undefined,
          thumbnailUrl: existing.thumbnail?.url ?? undefined,
          imageUrl: existing.image?.url ?? undefined,
          footerText: existing.footer?.text ?? undefined,
          footerIconUrl: existing.footer?.iconURL ?? undefined,
          timestamp: Boolean(existing.timestamp),
          content: message.content ?? undefined,
        }
      : { content: message.content ?? undefined };

    const nextEmbed: EmbedPayload = {
      ...baseEmbed,
      ...(input.embed ?? {}),
    };

    if (typeof input.content === "string") {
      nextEmbed.content = input.content;
    }

    const hasEmbedPatch = input.embed != null || typeof input.content === "string";
    if (hasEmbedPatch) {
      const built = buildEmbedFromPayload(nextEmbed);
      patch.content = built.content ?? nextEmbed.content ?? "";
      if (built.builder) {
        patch.embeds = [built.builder];
      } else if (message.embeds.length > 0 && input.embed) {
        // El formulario vació el cuerpo del embed → quitar embeds.
        const onlyContent =
          !nextEmbed.title?.trim() &&
          !nextEmbed.description?.trim() &&
          !nextEmbed.authorName?.trim() &&
          !nextEmbed.footerText?.trim() &&
          !nextEmbed.thumbnailUrl?.trim() &&
          !nextEmbed.imageUrl?.trim() &&
          !nextEmbed.url?.trim();
        if (onlyContent) {
          patch.embeds = [];
        }
      }
      if (built.files.length > 0) {
        patch.files = built.files;
      }
      await message.edit(patch);
    }
  } catch (error: unknown) {
    if (error instanceof AutoRoleError) throw error;
    if (isUnknownMessage(error)) {
      orphaned = true;
      isBotAuthor = null;
    } else {
      throw new AutoRoleError(
        error instanceof Error
          ? error.message
          : "Couldn't edit the content.",
        502,
        "DISCORD_EDIT_FAILED",
      );
    }
  }

  const title = input.title?.trim();
  if (title) {
    await getDb()
      .update(autorolesRegistry)
      .set({ title, updatedAt: new Date() })
      .where(eq(autorolesRegistry.id, id))
      ;
  }

  const updated = await one(getDb()
    .select()
    .from(autorolesRegistry)
    .where(eq(autorolesRegistry.id, id))
    .limit(1));
  if (!updated) {
    throw new AutoRoleError("Record not found.", 404, "NOT_FOUND");
  }

  return {
    ok: true,
    orphaned,
    entry: toEntry({
      ...updated,
      orphaned,
      channelName: null,
      isBotAuthor,
    }),
  };
}

export async function deleteAutorole(
  bot: Client,
  idRaw: number,
  guildIdRaw?: string,
): Promise<DeleteAutoroleResponse> {
  const guildId = resolveGuildId(guildIdRaw);
  const id = Number(idRaw);
  const row = await one(getDb()
    .select()
    .from(autorolesRegistry)
    .where(eq(autorolesRegistry.id, id))
    .limit(1));

  if (!row || row.guildId !== guildId) {
    throw new AutoRoleError("Record not found.", 404, "NOT_FOUND");
  }

  let orphaned = false;
  try {
    const channel = await resolveChannel(bot, row.channelId, guildId);
    const message = await channel.messages.fetch(row.messageId);
    if (row.type === "REACTIONS") {
      await deleteReactionRolesForMessage(row.messageId);
      await message.reactions.removeAll().catch(() => undefined);
    } else {
      await message.edit({ components: [] });
    }
  } catch (error: unknown) {
    if (isUnknownMessage(error)) {
      orphaned = true;
      await deleteReactionRolesForMessage(row.messageId);
    } else {
      // Aun así limpiamos el registro local si el usuario confirma.
      logger.warn({ err: error }, "deleteAutorole Discord:");
      orphaned = true;
    }
  }

  await getDb()
    .delete(autorolesRegistry)
    .where(eq(autorolesRegistry.id, id))
    ;

  return { ok: true, deletedId: id, orphaned };
}
