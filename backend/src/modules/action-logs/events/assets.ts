import {
  AuditLogEvent,
  type GuildEmoji,
  type Sticker,
} from "discord.js";
import { resolveAuditExecutor } from "../audit.js";
import { recordActionLog } from "../service.js";

export async function onEmojiCreate(emoji: GuildEmoji): Promise<void> {
  const executor = await resolveAuditExecutor(
    emoji.guild,
    AuditLogEvent.EmojiCreate,
    emoji.id,
  );
  const emojiName = emoji.name?.trim() || "emoji-sin-nombre";
  const emojiUrl = emoji.imageURL() ?? emoji.url;
  await recordActionLog(emoji.client, {
    guildId: emoji.guild.id,
    eventKey: "emojiCreate",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: emoji.id,
    targetTag: emojiName,
    summary: `Emoji created: :${emojiName}:`,
    description: `✨ **Emoji created:** \`:${emojiName}:\``,
    details: {
      name: emojiName,
      url: emojiUrl,
      thumbnailUrl: emojiUrl,
      targetKind: "emoji",
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
  });
}

export async function onEmojiDelete(emoji: GuildEmoji): Promise<void> {
  const executor = await resolveAuditExecutor(
    emoji.guild,
    AuditLogEvent.EmojiDelete,
    emoji.id,
  );
  const emojiName = emoji.name?.trim() || "emoji-sin-nombre";
  const emojiUrl = emoji.imageURL() ?? emoji.url;
  await recordActionLog(emoji.client, {
    guildId: emoji.guild.id,
    eventKey: "emojiDelete",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: emoji.id,
    targetTag: emojiName,
    summary: `Emoji eliminado: :${emojiName}:`,
    description: `🗑️ **Emoji eliminado:** \`:${emojiName}:\``,
    details: {
      name: emojiName,
      url: emojiUrl,
      thumbnailUrl: emojiUrl,
      targetKind: "emoji",
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
  });
}

export async function onEmojiUpdate(
  oldEmoji: GuildEmoji,
  newEmoji: GuildEmoji,
): Promise<void> {
  if (oldEmoji.name === newEmoji.name) return;
  const executor = await resolveAuditExecutor(
    newEmoji.guild,
    AuditLogEvent.EmojiUpdate,
    newEmoji.id,
  );
  await recordActionLog(newEmoji.client, {
    guildId: newEmoji.guild.id,
    eventKey: "emojiUpdate",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: newEmoji.id,
    targetTag: newEmoji.name,
    summary: `Emoji actualizado: :${newEmoji.name}:`,
    description: `🔧 **Emoji actualizado:** \`:${newEmoji.name}:\``,
    details: {
      oldContent: oldEmoji.name ?? "",
      newContent: newEmoji.name ?? "",
      thumbnailUrl: newEmoji.imageURL() ?? newEmoji.url,
      targetKind: "emoji",
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
  });
}

export async function onStickerCreate(sticker: Sticker): Promise<void> {
  if (!sticker.guildId || !sticker.guild) return;
  const executor = await resolveAuditExecutor(
    sticker.guild,
    AuditLogEvent.StickerCreate,
    sticker.id,
  );
  const name = sticker.name?.trim() || "sticker-sin-nombre";
  const stickerUrl = sticker.url;
  await recordActionLog(sticker.client, {
    guildId: sticker.guildId,
    eventKey: "stickerCreate",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: sticker.id,
    targetTag: name,
    summary: `Sticker created: ${name}`,
    description: `✨ **Sticker created:** \`${name}\``,
    details: {
      name,
      description: sticker.description,
      thumbnailUrl: stickerUrl,
      targetKind: "sticker",
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
  });
}

export async function onStickerDelete(sticker: Sticker): Promise<void> {
  if (!sticker.guildId || !sticker.guild) return;
  const executor = await resolveAuditExecutor(
    sticker.guild,
    AuditLogEvent.StickerDelete,
    sticker.id,
  );
  const name = sticker.name?.trim() || "sticker-sin-nombre";
  const stickerUrl = sticker.url;
  await recordActionLog(sticker.client, {
    guildId: sticker.guildId,
    eventKey: "stickerDelete",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: sticker.id,
    targetTag: name,
    summary: `Sticker eliminado: ${name}`,
    description: `🗑️ **Sticker eliminado:** \`${name}\``,
    details: {
      name,
      thumbnailUrl: stickerUrl,
      targetKind: "sticker",
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
  });
}

export async function onStickerUpdate(
  oldSticker: Sticker,
  newSticker: Sticker,
): Promise<void> {
  if (!newSticker.guildId || !newSticker.guild) return;
  if (oldSticker.name === newSticker.name && oldSticker.description === newSticker.description) {
    return;
  }
  const executor = await resolveAuditExecutor(
    newSticker.guild,
    AuditLogEvent.StickerUpdate,
    newSticker.id,
  );
  await recordActionLog(newSticker.client, {
    guildId: newSticker.guildId,
    eventKey: "stickerUpdate",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: newSticker.id,
    targetTag: newSticker.name,
    summary: `Sticker actualizado: ${newSticker.name}`,
    description: `🔧 **Sticker actualizado:** \`${newSticker.name?.trim() || "sticker-sin-nombre"}\``,
    details: {
      oldContent: oldSticker.name,
      newContent: newSticker.name,
      thumbnailUrl: newSticker.url,
      targetKind: "sticker",
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
  });
}
