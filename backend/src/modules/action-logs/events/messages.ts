import {
  AuditLogEvent,
  type Message,
  type PartialMessage,
  type ReadonlyCollection,
  type Snowflake,
} from "discord.js";
import { resolveAuditExecutor } from "../audit.js";
import { userTag } from "../helpers.js";
import { passesActionLogFilters, recordActionLog } from "../service.js";

export async function onMessageDelete(
  message: Message | PartialMessage,
): Promise<void> {
  if (!message.guild) return;
  const channelId = message.channelId;
  const parentId =
    message.channel && "parentId" in message.channel
      ? message.channel.parentId
      : null;
  const author = message.author;

  if (
    !await passesActionLogFilters(message.guild.id, "messageDelete", {
      channelId,
      parentId,
      actorIsBot: author?.bot,
    })
  ) {
    return;
  }

  const content =
    message.content ??
    (message.partial ? "(contenido no disponible — mensaje fuera de caché)" : "");
  const attachments = message.attachments
    ? [...message.attachments.values()].map((a) => a.url)
    : [];

  const executor = await resolveAuditExecutor(
    message.guild,
    AuditLogEvent.MessageDelete,
    author?.id,
  );
  const executorUnknown = !executor;

  const channelName =
    message.channel && "name" in message.channel && message.channel.name
      ? String(message.channel.name)
      : "canal-sin-nombre";
  const channelPlain = `#${channelName}`;

  await recordActionLog(message.client, {
    guildId: message.guild.id,
    eventKey: "messageDelete",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    executorAvatarURL: executor
      ? executor.avatarURL
      : author?.displayAvatarURL?.({ size: 128 }) ?? null,
    targetId: author?.id ?? null,
    targetTag: author ? userTag(author) : null,
    channelId,
    parentId,
    summary: `Mensaje eliminado en ${channelPlain}`,
    description: `🗑️ **Mensaje eliminado** en \`${channelPlain}\``,
    details: {
      oldContent: content,
      newContent: null,
      attachments,
      messageId: message.id,
      cached: !message.partial && Boolean(message.content || attachments.length),
      channelLabel: channelPlain,
      channelPlain: true,
      targetKind: "user",
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
    executorUnknown,
  });

  if (attachments.length > 0) {
    await recordActionLog(message.client, {
      guildId: message.guild.id,
      eventKey: "messageAttachmentDelete",
      executorId: executor?.id ?? null,
      executorTag: executor?.tag ?? null,
      targetId: author?.id ?? null,
      targetTag: author ? userTag(author) : null,
      channelId,
      parentId,
      summary: `${attachments.length} adjunto(s) eliminado(s)`,
      description: `🗑️ **Imágenes / adjuntos eliminados** en \`${channelPlain}\``,
      details: {
        attachments,
        oldContent: content,
        messageId: message.id,
        channelLabel: channelPlain,
        channelPlain: true,
        targetKind: "user",
      },
      actorIsBot: executor?.bot ?? false,
      actorRoleIds: executor?.roleIds,
      executorUnknown,
    });
  }
}

export async function onMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage,
): Promise<void> {
  if (!newMessage.guild) return;
  const author = newMessage.author ?? oldMessage.author;
  const parentId =
    newMessage.channel && "parentId" in newMessage.channel
      ? newMessage.channel.parentId
      : null;

  if (oldMessage.content === newMessage.content) {
    const oldAtt = oldMessage.attachments
      ? [...oldMessage.attachments.keys()]
      : [];
    const newAtt = newMessage.attachments
      ? [...newMessage.attachments.keys()]
      : [];
    const removed = oldAtt.filter((id) => !newAtt.includes(id));
    if (removed.length === 0) return;

    if (
      !await passesActionLogFilters(newMessage.guild.id, "messageAttachmentDelete", {
        channelId: newMessage.channelId,
        parentId,
        actorIsBot: author?.bot,
      })
    ) {
      return;
    }

    await recordActionLog(newMessage.client, {
      guildId: newMessage.guild.id,
      eventKey: "messageAttachmentDelete",
      executorId: author?.id ?? null,
      executorTag: author ? userTag(author) : null,
      executorAvatarURL: author?.displayAvatarURL?.({ size: 128 }) ?? null,
      targetId: author?.id ?? null,
      targetTag: author ? userTag(author) : null,
      channelId: newMessage.channelId,
      parentId,
      summary: `${removed.length} adjunto(s) eliminado(s) de un mensaje`,
      description: `**Imágenes / adjuntos eliminados** en <#${newMessage.channelId}>`,
      details: {
        removedAttachmentIds: removed,
        oldContent: oldMessage.content ?? null,
        messageId: newMessage.id,
      },
      actorIsBot: author?.bot ?? false,
    });
    return;
  }

  if (
    !await passesActionLogFilters(newMessage.guild.id, "messageUpdate", {
      channelId: newMessage.channelId,
      parentId,
      actorIsBot: author?.bot,
    })
  ) {
    return;
  }

  const oldContent =
    oldMessage.content ??
    (oldMessage.partial
      ? "(contenido anterior no disponible — mensaje fuera de caché)"
      : "");
  const newContent = newMessage.content ?? "";

  await recordActionLog(newMessage.client, {
    guildId: newMessage.guild.id,
    eventKey: "messageUpdate",
    executorId: author?.id ?? null,
    executorTag: author ? userTag(author) : null,
    executorAvatarURL: author?.displayAvatarURL({ size: 128 }) ?? null,
    targetId: author?.id ?? null,
    targetTag: author ? userTag(author) : null,
    channelId: newMessage.channelId,
    parentId,
    summary: `Mensaje editado en <#${newMessage.channelId}>`,
    description: `**Mensaje editado** en <#${newMessage.channelId}>`,
    details: {
      oldContent,
      newContent,
      messageId: newMessage.id,
      cached: !oldMessage.partial,
    },
    actorIsBot: author?.bot ?? false,
  });
}

export async function onMessageDeleteBulk(
  messages: ReadonlyCollection<Snowflake, Message | PartialMessage>,
): Promise<void> {
  const first = messages.first();
  if (!first?.guild) return;
  const channelId = first.channelId;
  const parentId =
    first.channel && "parentId" in first.channel
      ? first.channel.parentId
      : null;

  if (
    !await passesActionLogFilters(first.guild.id, "messageDeleteBulk", {
      channelId,
      parentId,
    })
  ) {
    return;
  }

  const executor = await resolveAuditExecutor(
    first.guild,
    AuditLogEvent.MessageBulkDelete,
    channelId,
    { allowMissingTarget: true },
  );
  const channelName =
    first.channel && "name" in first.channel && first.channel.name
      ? String(first.channel.name)
      : "canal-sin-nombre";
  const channelPlain = `#${channelName}`;
  const count = messages.size;

  await recordActionLog(first.client, {
    guildId: first.guild.id,
    eventKey: "messageDeleteBulk",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    executorAvatarURL: executor?.avatarURL ?? null,
    targetId: channelId,
    targetTag: channelPlain,
    channelId,
    parentId,
    summary: `${count} mensajes eliminados en ${channelPlain}`,
    description: `🧹 **${count} mensajes eliminados** en \`${channelPlain}\``,
    details: {
      count,
      channelLabel: channelPlain,
      channelPlain: true,
      targetKind: "channel",
      messageIds: [...messages.keys()].slice(0, 50),
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
    executorUnknown: !executor,
  });
}
