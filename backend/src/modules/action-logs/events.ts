import {
  AuditLogEvent,
  type Guild,
  type GuildAuditLogsEntry,
  type GuildBan,
  type GuildEmoji,
  type GuildMember,
  type Message,
  type NonThreadGuildBasedChannel,
  type PartialMessage,
  type Role,
  type Sticker,
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
  const author = message.author;

  if (
    !passesActionLogFilters(message.guild.id, "messageDelete", {
      channelId,
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

  await recordActionLog(message.client, {
    guildId: message.guild.id,
    eventKey: "messageDelete",
    executorId: executor?.id ?? author?.id ?? null,
    executorTag: executor?.tag ?? (author ? userTag(author) : null),
    targetId: author?.id ?? null,
    targetTag: author ? userTag(author) : null,
    channelId,
    summary: `Mensaje eliminado en <#${channelId}>`,
    details: {
      oldContent: content,
      newContent: null,
      attachments,
      cached: !message.partial && Boolean(message.content || attachments.length),
    },
    actorIsBot: executor?.bot ?? author?.bot ?? false,
    actorRoleIds: executor?.roleIds,
    embedColor: 0xef4444,
  });

  if (attachments.length > 0) {
    await recordActionLog(message.client, {
      guildId: message.guild.id,
      eventKey: "messageAttachmentDelete",
      executorId: executor?.id ?? author?.id ?? null,
      executorTag: executor?.tag ?? (author ? userTag(author) : null),
      targetId: author?.id ?? null,
      targetTag: author ? userTag(author) : null,
      channelId,
      summary: `${attachments.length} adjunto(s) eliminado(s)`,
      details: { attachments, oldContent: content },
      actorIsBot: executor?.bot ?? author?.bot ?? false,
      actorRoleIds: executor?.roleIds,
      embedColor: 0xf97316,
    });
  }
}

export async function onMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage,
): Promise<void> {
  if (!newMessage.guild) return;
  const author = newMessage.author ?? oldMessage.author;

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
      targetId: author?.id ?? null,
      targetTag: author ? userTag(author) : null,
      channelId: newMessage.channelId,
      summary: `${removed.length} adjunto(s) eliminado(s) de un mensaje`,
      details: {
        removedAttachmentIds: removed,
        oldContent: oldMessage.content ?? null,
      },
      actorIsBot: author?.bot ?? false,
      embedColor: 0xf97316,
    });
    return;
  }

  if (
    !passesActionLogFilters(newMessage.guild.id, "messageUpdate", {
      channelId: newMessage.channelId,
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
    targetId: author?.id ?? null,
    targetTag: author ? userTag(author) : null,
    channelId: newMessage.channelId,
    summary: `Mensaje editado en <#${newMessage.channelId}>`,
    details: {
      oldContent,
      newContent,
      messageId: newMessage.id,
      cached: !oldMessage.partial,
    },
    actorIsBot: author?.bot ?? false,
    embedColor: 0x3b82f6,
  });
}

export async function onGuildMemberAdd(member: GuildMember): Promise<void> {
  await recordActionLog(member.client, {
    guildId: member.guild.id,
    eventKey: "memberJoin",
    executorId: null,
    executorTag: null,
    targetId: member.id,
    targetTag: userTag(member.user),
    channelId: null,
    summary: `${userTag(member.user)} se unió al servidor`,
    details: { accountCreatedAt: member.user.createdAt.toISOString() },
    actorIsBot: member.user.bot,
    actorRoleIds: [...member.roles.cache.keys()],
    embedColor: 0x22c55e,
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
    executorId: null,
    executorTag: null,
    targetId: member.id,
    targetTag: userTag(user),
    channelId: null,
    summary: `${userTag(user)} salió del servidor`,
    details: {},
    actorIsBot: user.bot,
    actorRoleIds: "roles" in member ? [...member.roles.cache.keys()] : [],
    embedColor: 0xf59e0b,
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
      embedColor: 0x8b5cf6,
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
    embedColor: 0xa855f7,
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
    embedColor: 0xdc2626,
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
    embedColor: 0x16a34a,
  });
}

export async function onRoleCreate(role: Role): Promise<void> {
  const executor = await fetchAuditExecutor(
    role.guild,
    AuditLogEvent.RoleCreate,
    role.id,
  );
  await recordActionLog(role.client, {
    guildId: role.guild.id,
    eventKey: "roleCreate",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: role.id,
    targetTag: `@${role.name}`,
    channelId: null,
    summary: `Rol creado: @${role.name}`,
    details: { name: role.name, color: role.hexColor },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
    embedColor: 0x22c55e,
  });
}

export async function onRoleDelete(role: Role): Promise<void> {
  const executor = await fetchAuditExecutor(
    role.guild,
    AuditLogEvent.RoleDelete,
    role.id,
  );
  await recordActionLog(role.client, {
    guildId: role.guild.id,
    eventKey: "roleDelete",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: role.id,
    targetTag: `@${role.name}`,
    channelId: null,
    summary: `Rol eliminado: @${role.name}`,
    details: { name: role.name, color: role.hexColor },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
    embedColor: 0xef4444,
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
  await recordActionLog(newRole.client, {
    guildId: newRole.guild.id,
    eventKey: "roleUpdate",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: newRole.id,
    targetTag: `@${newRole.name}`,
    channelId: null,
    summary: `Rol actualizado: @${newRole.name}`,
    details: {
      oldContent: `${oldRole.name} (${oldRole.hexColor})`,
      newContent: `${newRole.name} (${newRole.hexColor})`,
      oldName: oldRole.name,
      newName: newRole.name,
      oldColor: oldRole.hexColor,
      newColor: newRole.hexColor,
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
    embedColor: 0xf59e0b,
  });
}

function channelLabel(channel: { name?: string | null; id: string }): string {
  return channel.name ? `#${channel.name}` : channel.id;
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
  await recordActionLog(channel.client, {
    guildId: channel.guild.id,
    eventKey: "channelCreate",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: channel.id,
    targetTag: channelLabel(channel),
    channelId: channel.id,
    summary: `Canal creado: ${channelLabel(channel)}`,
    details: { name: channel.name, type: channel.type },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
    embedColor: 0x22c55e,
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
  await recordActionLog(channel.client, {
    guildId: channel.guild.id,
    eventKey: "channelDelete",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: channel.id,
    targetTag: channelLabel(channel),
    channelId: channel.id,
    summary: `Canal eliminado: ${channelLabel(channel)}`,
    details: { name: "name" in channel ? channel.name : null, type: channel.type },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
    embedColor: 0xef4444,
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
  await recordActionLog(newChannel.client, {
    guildId: newChannel.guild.id,
    eventKey: "channelUpdate",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: newChannel.id,
    targetTag: channelLabel(newChannel),
    channelId: newChannel.id,
    summary: `Canal actualizado: ${channelLabel(newChannel)}`,
    details: {
      oldContent: oldChannel.name ?? "",
      newContent: newChannel.name ?? "",
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
    embedColor: 0xf59e0b,
  });
}

export async function onEmojiCreate(emoji: GuildEmoji): Promise<void> {
  await recordActionLog(emoji.client, {
    guildId: emoji.guild.id,
    eventKey: "emojiCreate",
    executorId: null,
    targetId: emoji.id,
    targetTag: emoji.name,
    summary: `Emoji creado: :${emoji.name}:`,
    details: { name: emoji.name, url: emoji.imageURL() },
    actorIsBot: false,
    embedColor: 0xa855f7,
  });
}

export async function onEmojiDelete(emoji: GuildEmoji): Promise<void> {
  await recordActionLog(emoji.client, {
    guildId: emoji.guild.id,
    eventKey: "emojiDelete",
    targetId: emoji.id,
    targetTag: emoji.name,
    summary: `Emoji eliminado: :${emoji.name}:`,
    details: { name: emoji.name },
    actorIsBot: false,
    embedColor: 0xef4444,
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
    summary: `Emoji renombrado: :${oldEmoji.name}: → :${newEmoji.name}:`,
    details: {
      oldContent: oldEmoji.name ?? "",
      newContent: newEmoji.name ?? "",
    },
    actorIsBot: false,
    embedColor: 0xf59e0b,
  });
}

export async function onStickerCreate(sticker: Sticker): Promise<void> {
  if (!sticker.guildId || !sticker.guild) return;
  await recordActionLog(sticker.client, {
    guildId: sticker.guildId,
    eventKey: "stickerCreate",
    targetId: sticker.id,
    targetTag: sticker.name,
    summary: `Sticker creado: ${sticker.name}`,
    details: { name: sticker.name, description: sticker.description },
    actorIsBot: false,
    embedColor: 0xa855f7,
  });
}

export async function onStickerDelete(sticker: Sticker): Promise<void> {
  if (!sticker.guildId) return;
  await recordActionLog(sticker.client, {
    guildId: sticker.guildId,
    eventKey: "stickerDelete",
    targetId: sticker.id,
    targetTag: sticker.name,
    summary: `Sticker eliminado: ${sticker.name}`,
    details: { name: sticker.name },
    actorIsBot: false,
    embedColor: 0xef4444,
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
    details: {
      oldContent: oldSticker.name,
      newContent: newSticker.name,
    },
    actorIsBot: false,
    embedColor: 0xf59e0b,
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
      embedColor: 0xa855f7,
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
      embedColor: 0xef4444,
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
      embedColor: 0xf59e0b,
    });
  });
}
