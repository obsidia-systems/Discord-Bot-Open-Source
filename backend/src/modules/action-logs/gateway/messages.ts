import {
  AuditLogEvent,
  type Message,
  type PartialMessage,
  type ReadonlyCollection,
  type Snowflake,
} from "discord.js";
import { resolveAuditExecutor, takeBotMessageDelete } from "../audit.js";
import {
  passesActionLogFilters,
  recordActionLog,
} from "../domain/action-logs.js";
import { userTag } from "../helpers.js";

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
    !(await passesActionLogFilters(message.guild.id, "messageDelete", {
      channelId,
      parentId,
      actorIsBot: author?.bot,
    }))
  ) {
    return;
  }

  const content =
    message.content ??
    (message.partial ? "(content unavailable — message not in cache)" : "");
  const attachments = message.attachments
    ? [...message.attachments.values()].map((a) => a.url)
    : [];

  const hinted = takeBotMessageDelete(message.guild.id, message.id);
  const executor = hinted
    ? { ...hinted.executor, roleIds: [] }
    : await resolveAuditExecutor(
        message.guild,
        AuditLogEvent.MessageDelete,
        author?.id,
      );
  const executorUnknown = !executor;
  const byAutoDelete = hinted?.source === "auto-delete";

  const channelName =
    message.channel && "name" in message.channel && message.channel.name
      ? String(message.channel.name)
      : "unnamed-channel";
  const channelPlain = `#${channelName}`;

  await recordActionLog(message.client, {
    guildId: message.guild.id,
    eventKey: "messageDelete",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    executorAvatarURL: executor
      ? executor.avatarURL
      : (author?.displayAvatarURL?.({ size: 128 }) ?? null),
    targetId: author?.id ?? null,
    targetTag: author ? userTag(author) : null,
    channelId,
    parentId,
    summary: `Message deleted in ${channelPlain}`,
    description: byAutoDelete
      ? `🗑️ **Message deleted** in \`${channelPlain}\` by Auto-Delete`
      : `🗑️ **Message deleted** in \`${channelPlain}\``,
    details: {
      oldContent: content,
      newContent: null,
      attachments,
      messageId: message.id,
      cached:
        !message.partial && Boolean(message.content || attachments.length),
      channelLabel: channelPlain,
      channelPlain: true,
      targetKind: "user",
      ...(byAutoDelete ? { source: "auto-delete" } : {}),
    },
    actorIsBot: author?.bot ?? false,
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
      summary: `${attachments.length} attachment(s) deleted`,
      description: `🗑️ **Images / attachments deleted** in \`${channelPlain}\``,
      details: {
        attachments,
        oldContent: content,
        messageId: message.id,
        channelLabel: channelPlain,
        channelPlain: true,
        targetKind: "user",
      },
      actorIsBot: author?.bot ?? false,
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
      !(await passesActionLogFilters(
        newMessage.guild.id,
        "messageAttachmentDelete",
        {
          channelId: newMessage.channelId,
          parentId,
          actorIsBot: author?.bot,
        },
      ))
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
      summary: `${removed.length} attachment(s) deleted from a message`,
      description: `**Images / attachments deleted** in <#${newMessage.channelId}>`,
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
    !(await passesActionLogFilters(newMessage.guild.id, "messageUpdate", {
      channelId: newMessage.channelId,
      parentId,
      actorIsBot: author?.bot,
    }))
  ) {
    return;
  }

  const oldContent =
    oldMessage.content ??
    (oldMessage.partial
      ? "(previous content unavailable — message not in cache)"
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
    summary: `Message edited in <#${newMessage.channelId}>`,
    description: `**Message edited** in <#${newMessage.channelId}>`,
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
  const guild = first?.guild;
  if (!first || !guild) return;
  const channelId = first.channelId;
  const parentId =
    first.channel && "parentId" in first.channel
      ? first.channel.parentId
      : null;

  if (
    !(await passesActionLogFilters(guild.id, "messageDeleteBulk", {
      channelId,
      parentId,
    }))
  ) {
    return;
  }

  const hintedIds = [...messages.keys()].filter((id) =>
    takeBotMessageDelete(guild.id, id),
  );
  const hinted = hintedIds.length > 0;
  const botUser = first.client.user;
  const executor = hinted
    ? botUser
      ? {
          id: botUser.id,
          tag: userTag(botUser),
          bot: true,
          roleIds: [] as string[],
          avatarURL: botUser.displayAvatarURL({ size: 128 }),
        }
      : null
    : await resolveAuditExecutor(
        guild,
        AuditLogEvent.MessageBulkDelete,
        channelId,
        { allowMissingTarget: true },
      );
  const channelName =
    first.channel && "name" in first.channel && first.channel.name
      ? String(first.channel.name)
      : "unnamed-channel";
  const channelPlain = `#${channelName}`;
  const count = messages.size;

  await recordActionLog(first.client, {
    guildId: guild.id,
    eventKey: "messageDeleteBulk",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    executorAvatarURL: executor?.avatarURL ?? null,
    targetId: channelId,
    targetTag: channelPlain,
    channelId,
    parentId,
    summary: `${count} messages deleted in ${channelPlain}`,
    description: hinted
      ? `🧹 **${count} messages deleted** in \`${channelPlain}\` by Auto-Delete`
      : `🧹 **${count} messages deleted** in \`${channelPlain}\``,
    details: {
      count,
      channelLabel: channelPlain,
      channelPlain: true,
      targetKind: "channel",
      messageIds: [...messages.keys()].slice(0, 50),
      ...(hinted ? { source: "auto-delete" } : {}),
    },
    actorIsBot: false,
    actorRoleIds: executor?.roleIds,
    executorUnknown: !executor,
  });
}
