import {
  AuditLogEvent,
  ChannelType,
  OverwriteType,
  type Guild,
  type NonThreadGuildBasedChannel,
  type PermissionOverwrites,
  type Role,
} from "discord.js";
import { resolveAuditExecutor } from "../audit.js";
import { channelTypeName, safeChannelName } from "../helpers.js";
import { diffGuildIdentity, snapshotGuildIdentity } from "../guildIdentity.js";
import { recordActionLog } from "../service.js";

export async function onRoleCreate(role: Role): Promise<void> {
  const executor = await resolveAuditExecutor(
    role.guild,
    AuditLogEvent.RoleCreate,
    role.id,
  );
  const roleName = role.name?.trim() || "unnamed-role";
  await recordActionLog(role.client, {
    guildId: role.guild.id,
    eventKey: "roleCreate",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: role.id,
    targetTag: roleName,
    channelId: null,
    summary: `Role created: ${roleName}`,
    description: `✨ **Role created:** \`${roleName}\``,
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
  const executor = await resolveAuditExecutor(
    role.guild,
    AuditLogEvent.RoleDelete,
    role.id,
  );
  const roleName = role.name?.trim() || "unnamed-role";
  await recordActionLog(role.client, {
    guildId: role.guild.id,
    eventKey: "roleDelete",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: role.id,
    targetTag: roleName,
    channelId: null,
    summary: `Role deleted: ${roleName}`,
    description: `🗑️ **Role deleted:** \`${roleName}\``,
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

  const executor = await resolveAuditExecutor(
    newRole.guild,
    AuditLogEvent.RoleUpdate,
    newRole.id,
  );
  const roleName = newRole.name?.trim() || "unnamed-role";
  await recordActionLog(newRole.client, {
    guildId: newRole.guild.id,
    eventKey: "roleUpdate",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: newRole.id,
    targetTag: roleName,
    channelId: null,
    summary: `Role updated: ${roleName}`,
    description: `🔧 **Role updated:** \`${roleName}\``,
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

export async function onChannelCreate(
  channel: NonThreadGuildBasedChannel,
): Promise<void> {
  if (!channel.guild) return;
  const executor = await resolveAuditExecutor(
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
      : "None";
  await recordActionLog(channel.client, {
    guildId: channel.guild.id,
    eventKey: "channelCreate",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: channel.id,
    targetTag: label,
    channelId: channel.id,
    summary: `Channel created: ${label}`,
    description: `📁 **Channel created:** \`${label}\` (Type: ${typeName})`,
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
  const executor = await resolveAuditExecutor(
    channel.guild,
    AuditLogEvent.ChannelDelete,
    channel.id,
  );
  const name = "name" in channel ? safeChannelName(channel) : "unnamed-channel";
  const label = `#${name}`;
  const typeName = channelTypeName(channel.type);
  const parentName =
    "parent" in channel && channel.parent?.name
      ? channel.parent.name
      : "None";
  await recordActionLog(channel.client, {
    guildId: channel.guild.id,
    eventKey: "channelDelete",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: channel.id,
    targetTag: label,
    channelId: null,
    parentId: "parentId" in channel ? channel.parentId : null,
    summary: `Channel deleted: ${label}`,
    description: `🗑️ **Channel deleted:** \`${label}\` (Type: ${typeName})`,
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
  if (!("guild" in oldChannel) || !oldChannel.guild) return;
  if (!("name" in oldChannel) || !("name" in newChannel)) return;

  const diffFields = buildChannelUpdateDiffFields(oldChannel, newChannel);
  if (diffFields.length === 0) return;

  const executor = await resolveAuditExecutor(
    newChannel.guild,
    AuditLogEvent.ChannelUpdate,
    newChannel.id,
  );
  const name = safeChannelName(newChannel);
  const label = `#${name}`;

  await recordActionLog(newChannel.client, {
    guildId: newChannel.guild.id,
    eventKey: "channelUpdate",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: newChannel.id,
    targetTag: label,
    channelId: null,
    parentId: newChannel.parentId ?? null,
    summary: `Channel updated: ${label} (${diffFields.length} change${diffFields.length === 1 ? "" : "s"})`,
    description: `✏️ **Channel updated:** \`${label}\``,
    details: {
      name,
      channelLabel: label,
      channelPlain: true,
      targetKind: "channel",
      diffFields,
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
    tone: "yellow",
  });
}

interface ChannelDiffField {
  name: string;
  value: string;
  inline?: boolean;
}

function readOptionalString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return String(value);
}

function formatOverwriteTarget(
  channel: NonThreadGuildBasedChannel,
  overwrite: PermissionOverwrites,
): string {
  if (overwrite.type === OverwriteType.Role) {
    const role = channel.guild.roles.cache.get(overwrite.id);
    return role ? `@${role.name}` : `Role ${overwrite.id}`;
  }
  const member = channel.guild.members.cache.get(overwrite.id);
  if (member) return `@${member.user.username}`;
  const user = channel.client.users.cache.get(overwrite.id);
  return user ? `@${user.username}` : `User ${overwrite.id}`;
}

function serializeOverwrite(ow: PermissionOverwrites): string {
  return `${ow.allow.bitfield.toString()}:${ow.deny.bitfield.toString()}`;
}

function diffPermissionOverwrites(
  oldChannel: NonThreadGuildBasedChannel,
  newChannel: NonThreadGuildBasedChannel,
): ChannelDiffField | null {
  if (
    !("permissionOverwrites" in oldChannel) ||
    !("permissionOverwrites" in newChannel)
  ) {
    return null;
  }

  const oldCache = oldChannel.permissionOverwrites.cache;
  const newCache = newChannel.permissionOverwrites.cache;
  const affected: string[] = [];
  const ids = new Set([...oldCache.keys(), ...newCache.keys()]);

  for (const id of ids) {
    const oldOw = oldCache.get(id);
    const newOw = newCache.get(id);
    if (!oldOw && newOw) {
      affected.push(`${formatOverwriteTarget(newChannel, newOw)} (added)`);
    } else if (oldOw && !newOw) {
      affected.push(`${formatOverwriteTarget(oldChannel, oldOw)} (removed)`);
    } else if (
      oldOw &&
      newOw &&
      serializeOverwrite(oldOw) !== serializeOverwrite(newOw)
    ) {
      affected.push(`${formatOverwriteTarget(newChannel, newOw)} (modified)`);
    }
  }

  if (affected.length === 0) return null;

  const preview = affected.slice(0, 8).join(", ");
  const extra =
    affected.length > 8 ? ` (+${affected.length - 8} more)` : "";
  return {
    name: "🔒 Permissions Updated",
    value: `${preview}${extra}`,
    inline: false,
  };
}

function buildChannelUpdateDiffFields(
  oldChannel: NonThreadGuildBasedChannel,
  newChannel: NonThreadGuildBasedChannel,
): ChannelDiffField[] {
  const diffs: ChannelDiffField[] = [];

  if (oldChannel.name !== newChannel.name) {
    diffs.push({
      name: "Name",
      value: `\`#${safeChannelName(oldChannel)}\` ➔ \`#${safeChannelName(newChannel)}\``,
      inline: false,
    });
  }

  const oldTopic =
    "topic" in oldChannel
      ? readOptionalString(
          (oldChannel as { topic?: string | null }).topic,
        )
      : undefined;
  const newTopic =
    "topic" in newChannel
      ? readOptionalString(
          (newChannel as { topic?: string | null }).topic,
        )
      : undefined;
  if (oldTopic !== undefined && newTopic !== undefined && oldTopic !== newTopic) {
    diffs.push({
      name: "Topic",
      value: `Before: ${oldTopic || "None"} ➔ After: ${newTopic || "None"}`,
      inline: false,
    });
  }

  const isVoiceLike =
    newChannel.type === ChannelType.GuildVoice ||
    newChannel.type === ChannelType.GuildStageVoice ||
    "userLimit" in newChannel;

  if (isVoiceLike) {
    const oldStatus = readOptionalString(
      (oldChannel as { status?: string | null }).status,
    );
    const newStatus = readOptionalString(
      (newChannel as { status?: string | null }).status,
    );
    if (oldStatus !== newStatus) {
      diffs.push({
        name: "Voice Status",
        value: `Before: ${oldStatus || "None"} ➔ After: ${newStatus || "None"}`,
        inline: false,
      });
    }
  }

  if (
    "rateLimitPerUser" in oldChannel &&
    "rateLimitPerUser" in newChannel
  ) {
    const oldSlow =
      (oldChannel as { rateLimitPerUser?: number | null }).rateLimitPerUser ?? 0;
    const newSlow =
      (newChannel as { rateLimitPerUser?: number | null }).rateLimitPerUser ?? 0;
    if (oldSlow !== newSlow) {
      diffs.push({
        name: "Slowmode",
        value: `${oldSlow}s ➔ ${newSlow}s`,
        inline: true,
      });
    }
  }

  if ("userLimit" in oldChannel && "userLimit" in newChannel) {
    const formatLimit = (n: number) => (n === 0 ? "Unlimited" : String(n));
    const oldLimit = (oldChannel as { userLimit: number }).userLimit;
    const newLimit = (newChannel as { userLimit: number }).userLimit;
    if (oldLimit !== newLimit) {
      diffs.push({
        name: "User Limit",
        value: `${formatLimit(oldLimit)} ➔ ${formatLimit(newLimit)}`,
        inline: true,
      });
    }
  }

  const oldParentId = oldChannel.parentId ?? null;
  const newParentId = newChannel.parentId ?? null;
  if (oldParentId !== newParentId) {
    diffs.push({
      name: "Category",
      value: `${oldChannel.parent?.name ?? "None"} ➔ ${newChannel.parent?.name ?? "None"}`,
      inline: true,
    });
  }

  const permDiff = diffPermissionOverwrites(oldChannel, newChannel);
  if (permDiff) diffs.push(permDiff);

  return diffs;
}

export async function onGuildUpdate(oldGuild: Guild, newGuild: Guild): Promise<void> {
  const diffFields = diffGuildIdentity(
    snapshotGuildIdentity(oldGuild),
    snapshotGuildIdentity(newGuild),
  );
  if (diffFields.length === 0) return;

  const executor = await resolveAuditExecutor(
    newGuild,
    AuditLogEvent.GuildUpdate,
    newGuild.id,
  );
  await recordActionLog(newGuild.client, {
    guildId: newGuild.id,
    eventKey: "guildUpdate",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: newGuild.id,
    targetTag: newGuild.name,
    channelId: null,
    summary: `Server updated: ${newGuild.name}`,
    description: `🏠 **Server updated:** \`${newGuild.name}\``,
    details: {
      name: newGuild.name,
      diffFields,
      iconUrl: newGuild.iconURL({ size: 128 }),
      targetKind: "resource",
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
    tone: "yellow",
  });
}
