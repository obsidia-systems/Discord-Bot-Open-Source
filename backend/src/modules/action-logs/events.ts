import {
  AuditLogEvent,
  ChannelType,
  type Guild,
  type GuildAuditLogsEntry,
  type GuildBan,
  type GuildEmoji,
  type GuildMember,
  type Invite,
  type Message,
  type NonThreadGuildBasedChannel,
  type PartialMessage,
  type Role,
  type Sticker,
  type VoiceState,
} from "discord.js";
import { recordActionLog, passesActionLogFilters } from "./service.js";

function userTag(user: {
  username?: string | null;
  discriminator?: string | null;
  tag?: string | null;
  id?: string;
}): string {
  if (typeof user.tag === "string" && user.tag) return user.tag;
  if (user.username) {
    const disc =
      user.discriminator && user.discriminator !== "0"
        ? `#${user.discriminator}`
        : "";
    return `${user.username}${disc}`;
  }
  return user.id ?? "desconocido";
}

function channelTypeName(type: number): string {
  switch (type) {
    case ChannelType.GuildText:
      return "Texto";
    case ChannelType.GuildVoice:
      return "Voz";
    case ChannelType.GuildCategory:
      return "Categoría";
    case ChannelType.GuildAnnouncement:
      return "Anuncios";
    case ChannelType.GuildStageVoice:
      return "Escenario";
    case ChannelType.GuildForum:
      return "Foro";
    case ChannelType.GuildMedia:
      return "Media";
    default:
      return "Categoría/Otro";
  }
}

function safeChannelName(channel: { name?: string | null }): string {
  const name = typeof channel.name === "string" ? channel.name.trim() : "";
  return name || "canal-sin-nombre";
}

async function fetchAuditExecutor(
  guild: Guild,
  type: AuditLogEvent,
  targetId?: string | null,
): Promise<{ id: string; tag: string; bot: boolean; roleIds: string[] } | null> {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 6 });
    const entry = [...logs.entries.values()].find((e: GuildAuditLogsEntry) => {
      if (!targetId) return true;
      return e.targetId === targetId;
    });
    if (!entry?.executor) return null;
    const member = await guild.members
      .fetch(entry.executor.id)
      .catch(() => null);
    return {
      id: entry.executor.id,
      tag: userTag(entry.executor),
      bot: Boolean(entry.executor.bot),
      roleIds: member ? [...member.roles.cache.keys()] : [],
    };
  } catch {
    return null;
  }
}

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
    !passesActionLogFilters(message.guild.id, "messageDelete", {
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

  const executor = await fetchAuditExecutor(
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
      ? null
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
    // Solo adjuntos removidos
    const oldAtt = oldMessage.attachments
      ? [...oldMessage.attachments.keys()]
      : [];
    const newAtt = newMessage.attachments
      ? [...newMessage.attachments.keys()]
      : [];
    const removed = oldAtt.filter((id) => !newAtt.includes(id));
    if (removed.length === 0) return;

    if (
      !passesActionLogFilters(newMessage.guild.id, "messageAttachmentDelete", {
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
    !passesActionLogFilters(newMessage.guild.id, "messageUpdate", {
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
    executorAvatarURL: author?.displayAvatarURL?.({ size: 128 }) ?? null,
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

export async function onGuildMemberAdd(member: GuildMember): Promise<void> {
  await recordActionLog(member.client, {
    guildId: member.guild.id,
    eventKey: "memberJoin",
    executorId: member.id,
    executorTag: userTag(member.user),
    executorAvatarURL: member.user.displayAvatarURL({ size: 128 }),
    targetId: member.id,
    targetTag: userTag(member.user),
    channelId: null,
    summary: `${userTag(member.user)} se unió al servidor`,
    description: `**Miembro se une** al servidor`,
    details: { accountCreatedAt: member.user.createdAt.toISOString() },
    actorIsBot: member.user.bot,
    actorRoleIds: [...member.roles.cache.keys()],
  });
}

export async function onGuildMemberRemove(
  member: GuildMember | import("discord.js").PartialGuildMember,
): Promise<void> {
  const user = member.user;
  if (!user) return;
  await recordActionLog(member.client, {
    guildId: member.guild.id,
    eventKey: "memberLeave",
    executorId: member.id,
    executorTag: userTag(user),
    executorAvatarURL: user.displayAvatarURL({ size: 128 }),
    targetId: member.id,
    targetTag: userTag(user),
    channelId: null,
    summary: `${userTag(user)} salió del servidor`,
    description: `**Usuario abandonó** el servidor`,
    details: {},
    actorIsBot: user.bot,
    actorRoleIds: "roles" in member ? [...member.roles.cache.keys()] : [],
  });
}

export async function onGuildMemberUpdate(
  oldMember: GuildMember | import("discord.js").PartialGuildMember,
  newMember: GuildMember,
): Promise<void> {
  const oldNick = oldMember.nickname ?? null;
  const newNick = newMember.nickname ?? null;
  if (oldNick !== newNick) {
    await recordActionLog(newMember.client, {
      guildId: newMember.guild.id,
      eventKey: "memberNicknameUpdate",
      executorId: newMember.id,
      executorTag: userTag(newMember.user),
      targetId: newMember.id,
      targetTag: userTag(newMember.user),
      channelId: null,
      summary: `Apodo: ${oldNick ?? "(ninguno)"} → ${newNick ?? "(ninguno)"}`,
      details: { oldContent: oldNick ?? "", newContent: newNick ?? "" },
      actorIsBot: newMember.user.bot,
      actorRoleIds: [...newMember.roles.cache.keys()],
    });
  }

  const oldRoles = new Set(
    "roles" in oldMember ? [...oldMember.roles.cache.keys()] : [],
  );
  const newRoles = new Set([...newMember.roles.cache.keys()]);
  const added = [...newRoles].filter((id) => !oldRoles.has(id));
  const removed = [...oldRoles].filter((id) => !newRoles.has(id));
  if (added.length === 0 && removed.length === 0) return;

  const roleName = (id: string) =>
    newMember.guild.roles.cache.get(id)?.name ?? id;

  await recordActionLog(newMember.client, {
    guildId: newMember.guild.id,
    eventKey: "memberRoleUpdate",
    executorId: newMember.id,
    executorTag: userTag(newMember.user),
    targetId: newMember.id,
    targetTag: userTag(newMember.user),
    channelId: null,
    summary: [
      added.length ? `+ ${added.map(roleName).join(", ")}` : null,
      removed.length ? `− ${removed.map(roleName).join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    details: {
      added: added.map((id) => ({ id, name: roleName(id) })),
      removed: removed.map((id) => ({ id, name: roleName(id) })),
      oldContent: removed.map(roleName).join(", ") || "(ninguno)",
      newContent: added.map(roleName).join(", ") || "(ninguno)",
    },
    actorIsBot: newMember.user.bot,
    actorRoleIds: [...newMember.roles.cache.keys()],
  });
}

export async function onGuildBanAdd(ban: GuildBan): Promise<void> {
  const executor = await fetchAuditExecutor(
    ban.guild,
    AuditLogEvent.MemberBanAdd,
    ban.user.id,
  );
  await recordActionLog(ban.client, {
    guildId: ban.guild.id,
    eventKey: "memberBan",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: ban.user.id,
    targetTag: userTag(ban.user),
    channelId: null,
    summary: `${userTag(ban.user)} fue baneado`,
    details: { reason: ban.reason ?? null },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
  });
}

export async function onGuildBanRemove(ban: GuildBan): Promise<void> {
  const executor = await fetchAuditExecutor(
    ban.guild,
    AuditLogEvent.MemberBanRemove,
    ban.user.id,
  );
  await recordActionLog(ban.client, {
    guildId: ban.guild.id,
    eventKey: "memberUnban",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: ban.user.id,
    targetTag: userTag(ban.user),
    channelId: null,
    summary: `${userTag(ban.user)} fue desbaneado`,
    details: {},
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
  });
}

export async function onRoleCreate(role: Role): Promise<void> {
  const executor = await fetchAuditExecutor(
    role.guild,
    AuditLogEvent.RoleCreate,
    role.id,
  );
  const roleName = role.name?.trim() || "rol-sin-nombre";
  await recordActionLog(role.client, {
    guildId: role.guild.id,
    eventKey: "roleCreate",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: role.id,
    targetTag: roleName,
    channelId: null,
    summary: `Rol creado: ${roleName}`,
    description: `✨ **Rol creado:** \`${roleName}\``,
    details: {
      name: roleName,
      roleName,
      roleColor: role.hexColor,
      targetKind: "role",
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
  });
}

export async function onRoleDelete(role: Role): Promise<void> {
  const executor = await fetchAuditExecutor(
    role.guild,
    AuditLogEvent.RoleDelete,
    role.id,
  );
  const roleName = role.name?.trim() || "rol-sin-nombre";
  await recordActionLog(role.client, {
    guildId: role.guild.id,
    eventKey: "roleDelete",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: role.id,
    targetTag: roleName,
    channelId: null,
    summary: `Rol eliminado: ${roleName}`,
    description: `🗑️ **Rol eliminado:** \`${roleName}\``,
    details: {
      name: roleName,
      roleName,
      roleColor: role.hexColor,
      targetKind: "role",
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
  });
}

export async function onRoleUpdate(oldRole: Role, newRole: Role): Promise<void> {
  if (
    oldRole.name === newRole.name &&
    oldRole.hexColor === newRole.hexColor &&
    oldRole.permissions.bitfield === newRole.permissions.bitfield &&
    oldRole.hoist === newRole.hoist &&
    oldRole.mentionable === newRole.mentionable
  ) {
    return;
  }

  const executor = await fetchAuditExecutor(
    newRole.guild,
    AuditLogEvent.RoleUpdate,
    newRole.id,
  );
  const roleName = newRole.name?.trim() || "rol-sin-nombre";
  await recordActionLog(newRole.client, {
    guildId: newRole.guild.id,
    eventKey: "roleUpdate",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: newRole.id,
    targetTag: roleName,
    channelId: null,
    summary: `Rol actualizado: ${roleName}`,
    description: `🔧 **Rol actualizado:** \`${roleName}\``,
    details: {
      oldContent: `${oldRole.name} (${oldRole.hexColor})`,
      newContent: `${newRole.name} (${newRole.hexColor})`,
      oldName: oldRole.name,
      newName: newRole.name,
      oldColor: oldRole.hexColor,
      newColor: newRole.hexColor,
      roleName,
      roleColor: newRole.hexColor,
      targetKind: "role",
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
  });
}

function channelLabel(channel: { name?: string | null; id: string }): string {
  return `#${safeChannelName(channel)}`;
}

export async function onChannelCreate(
  channel: NonThreadGuildBasedChannel,
): Promise<void> {
  if (!channel.guild) return;
  const executor = await fetchAuditExecutor(
    channel.guild,
    AuditLogEvent.ChannelCreate,
    channel.id,
  );
  const name = safeChannelName(channel);
  const label = `#${name}`;
  const typeName = channelTypeName(channel.type);
  const parentName =
    "parent" in channel && channel.parent?.name
      ? channel.parent.name
      : "Ninguna";
  await recordActionLog(channel.client, {
    guildId: channel.guild.id,
    eventKey: "channelCreate",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: channel.id,
    targetTag: label,
    channelId: channel.id,
    summary: `Canal creado: ${label}`,
    description: `📁 **Canal creado:** \`${label}\` (Tipo: ${typeName})`,
    details: {
      name,
      type: channel.type,
      channelTypeName: typeName,
      parentName,
      targetKind: "channel",
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
  });
}

export async function onChannelDelete(
  channel: NonThreadGuildBasedChannel | import("discord.js").DMChannel,
): Promise<void> {
  if (!("guild" in channel) || !channel.guild) return;
  const executor = await fetchAuditExecutor(
    channel.guild,
    AuditLogEvent.ChannelDelete,
    channel.id,
  );
  const name = "name" in channel ? safeChannelName(channel) : "canal-sin-nombre";
  const label = `#${name}`;
  const typeName = channelTypeName(channel.type);
  const parentName =
    "parent" in channel && channel.parent?.name
      ? channel.parent.name
      : "Ninguna";
  await recordActionLog(channel.client, {
    guildId: channel.guild.id,
    eventKey: "channelDelete",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: channel.id,
    targetTag: label,
    // No mención viva: el canal ya no existe.
    channelId: null,
    parentId: "parentId" in channel ? channel.parentId : null,
    summary: `Canal eliminado: ${label}`,
    description: `🗑️ **Canal eliminado:** \`${label}\` (Tipo: ${typeName})`,
    details: {
      name,
      type: channel.type,
      channelLabel: label,
      channelDeleted: true,
      channelPlain: true,
      channelTypeName: typeName,
      parentName,
      targetKind: "channel",
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
  });
}

export async function onChannelUpdate(
  oldChannel: NonThreadGuildBasedChannel | import("discord.js").DMChannel,
  newChannel: NonThreadGuildBasedChannel | import("discord.js").DMChannel,
): Promise<void> {
  if (!("guild" in newChannel) || !newChannel.guild) return;
  if (!("name" in oldChannel) || !("name" in newChannel)) return;
  if (oldChannel.name === newChannel.name && oldChannel.type === newChannel.type) {
    return;
  }

  const executor = await fetchAuditExecutor(
    newChannel.guild,
    AuditLogEvent.ChannelUpdate,
    newChannel.id,
  );
  const label = channelLabel(newChannel);
  await recordActionLog(newChannel.client, {
    guildId: newChannel.guild.id,
    eventKey: "channelUpdate",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: newChannel.id,
    targetTag: label,
    channelId: newChannel.id,
    summary: `Canal actualizado: ${label}`,
    description: `🔧 **Canal actualizado:** \`${label}\``,
    details: {
      oldContent: oldChannel.name ?? "",
      newContent: newChannel.name ?? "",
      targetKind: "channel",
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
  });
}

export async function onEmojiCreate(emoji: GuildEmoji): Promise<void> {
  const emojiName = emoji.name?.trim() || "emoji-sin-nombre";
  const emojiUrl = emoji.imageURL() ?? emoji.url;
  await recordActionLog(emoji.client, {
    guildId: emoji.guild.id,
    eventKey: "emojiCreate",
    executorId: null,
    targetId: emoji.id,
    targetTag: emojiName,
    summary: `Emoji creado: :${emojiName}:`,
    description: `✨ **Emoji creado:** \`:${emojiName}:\``,
    details: {
      name: emojiName,
      url: emojiUrl,
      thumbnailUrl: emojiUrl,
      targetKind: "emoji",
    },
    actorIsBot: false,
  });
}

export async function onEmojiDelete(emoji: GuildEmoji): Promise<void> {
  const emojiName = emoji.name?.trim() || "emoji-sin-nombre";
  const emojiUrl = emoji.imageURL() ?? emoji.url;
  await recordActionLog(emoji.client, {
    guildId: emoji.guild.id,
    eventKey: "emojiDelete",
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
    actorIsBot: false,
  });
}

export async function onEmojiUpdate(
  oldEmoji: GuildEmoji,
  newEmoji: GuildEmoji,
): Promise<void> {
  if (oldEmoji.name === newEmoji.name) return;
  await recordActionLog(newEmoji.client, {
    guildId: newEmoji.guild.id,
    eventKey: "emojiUpdate",
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
    actorIsBot: false,
  });
}

export async function onStickerCreate(sticker: Sticker): Promise<void> {
  if (!sticker.guildId || !sticker.guild) return;
  const name = sticker.name?.trim() || "sticker-sin-nombre";
  const stickerUrl = sticker.url;
  await recordActionLog(sticker.client, {
    guildId: sticker.guildId,
    eventKey: "stickerCreate",
    targetId: sticker.id,
    targetTag: name,
    summary: `Sticker creado: ${name}`,
    description: `✨ **Sticker creado:** \`${name}\``,
    details: {
      name,
      description: sticker.description,
      thumbnailUrl: stickerUrl,
      targetKind: "sticker",
    },
    actorIsBot: false,
  });
}

export async function onStickerDelete(sticker: Sticker): Promise<void> {
  if (!sticker.guildId) return;
  const name = sticker.name?.trim() || "sticker-sin-nombre";
  const stickerUrl = sticker.url;
  await recordActionLog(sticker.client, {
    guildId: sticker.guildId,
    eventKey: "stickerDelete",
    targetId: sticker.id,
    targetTag: name,
    summary: `Sticker eliminado: ${name}`,
    description: `🗑️ **Sticker eliminado:** \`${name}\``,
    details: {
      name,
      thumbnailUrl: stickerUrl,
      targetKind: "sticker",
    },
    actorIsBot: false,
  });
}

export async function onStickerUpdate(
  oldSticker: Sticker,
  newSticker: Sticker,
): Promise<void> {
  if (!newSticker.guildId) return;
  if (oldSticker.name === newSticker.name && oldSticker.description === newSticker.description) {
    return;
  }
  await recordActionLog(newSticker.client, {
    guildId: newSticker.guildId,
    eventKey: "stickerUpdate",
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
    actorIsBot: false,
  });
}

export async function onVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  try {
    await handleVoiceStateUpdate(oldState, newState);
  } catch (err) {
    console.warn(
      "[action-logs] voiceStateUpdate falló (no se detiene el bot):",
      err,
    );
  }
}

async function handleVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  const guild = newState.guild ?? oldState.guild;
  if (!guild) return;
  const member = newState.member ?? oldState.member;
  const user = member?.user ?? newState.client.users.cache.get(newState.id);
  if (!user) return;

  const oldCh = oldState.channelId;
  const newCh = newState.channelId;
  if (oldCh === newCh) return;

  const channelToAudit = oldState.channel ?? newState.channel ?? null;
  const oldParent =
    oldState.channel?.parentId ?? channelToAudit?.parentId ?? null;
  const newParent = newState.channel?.parentId ?? null;
  const roleIds = member ? [...member.roles.cache.keys()] : [];

  if (!oldCh && newCh) {
    if (
      !passesActionLogFilters(guild.id, "voiceJoin", {
        channelId: newCh,
        parentId: newParent,
        actorIsBot: user.bot,
        actorRoleIds: roleIds,
      })
    ) {
      return;
    }
    await recordActionLog(newState.client, {
      guildId: guild.id,
      eventKey: "voiceJoin",
      executorId: user.id,
      executorTag: userTag(user),
      executorAvatarURL: user.displayAvatarURL({ size: 128 }),
      targetId: user.id,
      targetTag: userTag(user),
      channelId: newCh,
      parentId: newParent,
      summary: `${userTag(user)} entró a voz`,
      description: `**Usuario conectó** al canal de voz <#${newCh}>`,
      details: { channelId: newCh },
      actorIsBot: user.bot,
      actorRoleIds: roleIds,
      tone: "green",
    });
    return;
  }

  const isDisconnect = Boolean(oldCh && !newCh);
  if (isDisconnect) {
    const disconnectChannelId = oldCh ?? channelToAudit?.id ?? null;
    const disconnectParentId = oldParent ?? channelToAudit?.parentId ?? null;

    const leaveOk = passesActionLogFilters(guild.id, "voiceLeave", {
      channelId: disconnectChannelId,
      parentId: disconnectParentId,
      actorIsBot: user.bot,
      actorRoleIds: roleIds,
    });
    const kickOk = passesActionLogFilters(guild.id, "voiceKick", {
      channelId: disconnectChannelId,
      parentId: disconnectParentId,
      actorIsBot: false,
      actorRoleIds: roleIds,
    });
    if (!leaveOk && !kickOk) return;

    let kickedBy: { id: string; tag: string; avatarURL: string } | null = null;

    try {
      // Esperar a que Discord registre MemberDisconnect
      await new Promise((resolve) => setTimeout(resolve, 800));

      const logs = await guild.fetchAuditLogs({
        type: AuditLogEvent.MemberDisconnect,
        limit: 5,
      });

      for (const entry of logs.entries.values()) {
        if (!entry.executor) continue;
        if (Date.now() - entry.createdTimestamp >= 4000) continue;

        // Discord suele omitir targetId en MemberDisconnect; si viene, debe coincidir.
        const targetId =
          entry.targetId ??
          (entry.target &&
          typeof entry.target === "object" &&
          "id" in entry.target
            ? String((entry.target as { id: string }).id)
            : null);
        if (targetId && targetId !== user.id) continue;

        kickedBy = {
          id: entry.executor.id,
          tag: userTag(entry.executor),
          avatarURL: entry.executor.displayAvatarURL({ size: 128 }),
        };
        break;
      }
    } catch (err) {
      console.warn(
        "No se pudo consultar el AuditLog de desconexión de voz:",
        err,
      );
      // No abortar: continuar como desconexión estándar si leave está activo
    }

    if (kickedBy && kickOk) {
      await recordActionLog(newState.client, {
        guildId: guild.id,
        eventKey: "voiceKick",
        executorId: kickedBy.id,
        executorTag: kickedBy.tag,
        executorAvatarURL: kickedBy.avatarURL,
        targetId: user.id,
        targetTag: userTag(user),
        channelId: disconnectChannelId,
        parentId: disconnectParentId,
        summary: `${userTag(user)} expulsado de voz por ${kickedBy.tag}`,
        description: disconnectChannelId
          ? `**Usuario desconectado a la fuerza** del canal de voz <#${disconnectChannelId}>`
          : `**Usuario desconectado a la fuerza** de un canal de voz`,
        details: {
          channelId: disconnectChannelId,
          targetId: user.id,
          forced: true,
        },
        actorIsBot: false,
        actorRoleIds: roleIds,
        tone: "red",
      });
      return;
    }

    if (!leaveOk) return;
    await recordActionLog(newState.client, {
      guildId: guild.id,
      eventKey: "voiceLeave",
      executorId: user.id,
      executorTag: userTag(user),
      executorAvatarURL: user.displayAvatarURL({ size: 128 }),
      targetId: user.id,
      targetTag: userTag(user),
      channelId: disconnectChannelId,
      parentId: disconnectParentId,
      summary: `${userTag(user)} abandonó voz`,
      description: disconnectChannelId
        ? `**Usuario abandonó** el canal de voz <#${disconnectChannelId}>`
        : `**Usuario abandonó** un canal de voz`,
      details: { channelId: disconnectChannelId, forced: false },
      actorIsBot: user.bot,
      actorRoleIds: roleIds,
      tone: "blue",
    });
    return;
  }

  if (oldCh && newCh) {
    if (
      !passesActionLogFilters(guild.id, "voiceMove", {
        channelId: newCh,
        parentId: newParent,
        actorIsBot: user.bot,
        actorRoleIds: roleIds,
      })
    ) {
      return;
    }
    await recordActionLog(newState.client, {
      guildId: guild.id,
      eventKey: "voiceMove",
      executorId: user.id,
      executorTag: userTag(user),
      executorAvatarURL: user.displayAvatarURL({ size: 128 }),
      targetId: user.id,
      targetTag: userTag(user),
      channelId: newCh,
      parentId: newParent,
      summary: `${userTag(user)}: voz ${oldCh} → ${newCh}`,
      description: `**Usuario se movió** de <#${oldCh}> a <#${newCh}>`,
      details: {
        oldContent: `<#${oldCh}>`,
        newContent: `<#${newCh}>`,
        fromChannelId: oldCh,
        toChannelId: newCh,
      },
      actorIsBot: user.bot,
      actorRoleIds: roleIds,
      tone: "blue",
    });
  }
}

export async function onInviteCreate(invite: Invite): Promise<void> {
  if (!invite.guild) return;
  const inviter = invite.inviter;
  if (
    !passesActionLogFilters(invite.guild.id, "inviteCreate", {
      channelId: invite.channelId,
      actorIsBot: inviter?.bot,
    })
  ) {
    return;
  }
  await recordActionLog(invite.client, {
    guildId: invite.guild.id,
    eventKey: "inviteCreate",
    executorId: inviter?.id ?? null,
    executorTag: inviter ? userTag(inviter) : null,
    executorAvatarURL: inviter?.displayAvatarURL({ size: 128 }) ?? null,
    targetId: invite.code,
    targetTag: invite.code,
    channelId: invite.channelId,
    summary: `Invitación creada: discord.gg/${invite.code}`,
    details: {
      code: invite.code,
      maxUses: invite.maxUses,
      maxAge: invite.maxAge,
      temporary: invite.temporary,
    },
    actorIsBot: inviter?.bot ?? false,
  });
}

export async function onInviteDelete(invite: Invite): Promise<void> {
  if (!invite.guild) return;
  if (
    !passesActionLogFilters(invite.guild.id, "inviteDelete", {
      channelId: invite.channelId,
    })
  ) {
    return;
  }
  await recordActionLog(invite.client, {
    guildId: invite.guild.id,
    eventKey: "inviteDelete",
    targetId: invite.code,
    targetTag: invite.code,
    channelId: invite.channelId,
    summary: `Invitación eliminada: discord.gg/${invite.code}`,
    details: { code: invite.code },
    actorIsBot: false,
  });
}

/** Registra todos los listeners de Action Logs en el ModuleContext. */
export function registerActionLogListeners(ctx: {
  on: <K extends keyof import("discord.js").ClientEvents>(
    event: K,
    handler: (...args: import("discord.js").ClientEvents[K]) => void,
  ) => void;
}): void {
  ctx.on("messageDelete", (message) => {
    void onMessageDelete(message);
  });
  ctx.on("messageUpdate", (oldMessage, newMessage) => {
    void onMessageUpdate(oldMessage, newMessage);
  });
  ctx.on("guildMemberAdd", (member) => {
    void onGuildMemberAdd(member);
  });
  ctx.on("guildMemberRemove", (member) => {
    void onGuildMemberRemove(member);
  });
  ctx.on("guildMemberUpdate", (oldMember, newMember) => {
    void onGuildMemberUpdate(oldMember, newMember);
  });
  ctx.on("guildBanAdd", (ban) => {
    void onGuildBanAdd(ban);
  });
  ctx.on("guildBanRemove", (ban) => {
    void onGuildBanRemove(ban);
  });
  ctx.on("roleCreate", (role) => {
    void onRoleCreate(role);
  });
  ctx.on("roleDelete", (role) => {
    void onRoleDelete(role);
  });
  ctx.on("roleUpdate", (oldRole, newRole) => {
    void onRoleUpdate(oldRole, newRole);
  });
  ctx.on("channelCreate", (channel) => {
    if ("guild" in channel && channel.guild) {
      void onChannelCreate(channel as NonThreadGuildBasedChannel);
    }
  });
  ctx.on("channelDelete", (channel) => {
    void onChannelDelete(channel as NonThreadGuildBasedChannel);
  });
  ctx.on("channelUpdate", (oldChannel, newChannel) => {
    void onChannelUpdate(
      oldChannel as NonThreadGuildBasedChannel,
      newChannel as NonThreadGuildBasedChannel,
    );
  });
  ctx.on("emojiCreate", (emoji) => {
    void onEmojiCreate(emoji);
  });
  ctx.on("emojiDelete", (emoji) => {
    void onEmojiDelete(emoji);
  });
  ctx.on("emojiUpdate", (oldEmoji, newEmoji) => {
    void onEmojiUpdate(oldEmoji, newEmoji);
  });
  ctx.on("stickerCreate", (sticker) => {
    void onStickerCreate(sticker);
  });
  ctx.on("stickerDelete", (sticker) => {
    void onStickerDelete(sticker);
  });
  ctx.on("stickerUpdate", (oldSticker, newSticker) => {
    void onStickerUpdate(oldSticker, newSticker);
  });
  ctx.on("voiceStateUpdate", (oldState, newState) => {
    void onVoiceStateUpdate(oldState, newState).catch((err) => {
      console.warn("[action-logs] voiceStateUpdate listener:", err);
    });
  });
  ctx.on("inviteCreate", (invite) => {
    void onInviteCreate(invite);
  });
  ctx.on("inviteDelete", (invite) => {
    void onInviteDelete(invite);
  });

  // Soundboard: tipado débil — no todos los builds de d.js lo exponen en ClientEvents.
  const onAny = ctx.on as (event: string, handler: (...args: unknown[]) => void) => void;
  onAny("guildSoundboardSoundCreate", (sound) => {
    const s = sound as {
      guildId?: string | null;
      guild?: { id: string };
      client: import("discord.js").Client;
      name?: string;
      id: string;
    };
    const guildId = s.guildId ?? s.guild?.id;
    if (!guildId) return;
    if (!passesActionLogFilters(guildId, "soundboardCreate")) return;
    void recordActionLog(s.client, {
      guildId,
      eventKey: "soundboardCreate",
      targetId: s.id,
      targetTag: s.name ?? s.id,
      summary: `Sonido creado: ${s.name ?? s.id}`,
      details: { name: s.name ?? null },
      actorIsBot: false,
    });
  });
  onAny("guildSoundboardSoundDelete", (sound) => {
    const s = sound as {
      guildId?: string | null;
      guild?: { id: string };
      client: import("discord.js").Client;
      name?: string;
      id: string;
    };
    const guildId = s.guildId ?? s.guild?.id;
    if (!guildId) return;
    if (!passesActionLogFilters(guildId, "soundboardDelete")) return;
    void recordActionLog(s.client, {
      guildId,
      eventKey: "soundboardDelete",
      targetId: s.id,
      targetTag: s.name ?? s.id,
      summary: `Sonido eliminado: ${s.name ?? s.id}`,
      details: { name: s.name ?? null },
      actorIsBot: false,
    });
  });
  onAny("guildSoundboardSoundUpdate", (_oldSound, sound) => {
    const s = sound as {
      guildId?: string | null;
      guild?: { id: string };
      client: import("discord.js").Client;
      name?: string;
      id: string;
    };
    const guildId = s.guildId ?? s.guild?.id;
    if (!guildId) return;
    if (!passesActionLogFilters(guildId, "soundboardUpdate")) return;
    void recordActionLog(s.client, {
      guildId,
      eventKey: "soundboardUpdate",
      targetId: s.id,
      targetTag: s.name ?? s.id,
      summary: `Sonido actualizado: ${s.name ?? s.id}`,
      details: { name: s.name ?? null },
      actorIsBot: false,
    });
  });
}
