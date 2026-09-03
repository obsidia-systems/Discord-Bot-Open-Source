import type {
  DiscordAuditCategory,
  DiscordAuditChangeItem,
  DiscordAuditEntry,
  DiscordAuditLogResponse,
  DiscordAuditTarget,
  DiscordAuditTargetKind,
  DiscordAuditTone,
} from "@adobos/shared";
import {
  AuditLogEvent,
  type Client,
  DiscordAPIError,
  type Guild,
  type GuildAuditLogsEntry,
  type User,
} from "discord.js";
import { logger } from "#core/log.js";
import { resolveMembersBatch, resolveUserPreview } from "#lib/discordMember.js";
import { consolidateAuditLogs } from "./consolidateAuditLogs.js";
import { ModerationError } from "./discord.js";

type ActionMeta = {
  label: string;
  category: Exclude<DiscordAuditCategory, "all">;
  tone: DiscordAuditTone;
  targetKind: DiscordAuditTargetKind;
};

const ACTION_META: Partial<Record<AuditLogEvent, ActionMeta>> = {
  [AuditLogEvent.GuildUpdate]: {
    label: "Updated the server",
    category: "server",
    tone: "update",
    targetKind: "guild",
  },
  [AuditLogEvent.ChannelCreate]: {
    label: "Created a channel",
    category: "channels",
    tone: "create",
    targetKind: "channel",
  },
  [AuditLogEvent.ChannelUpdate]: {
    label: "Updated a channel",
    category: "channels",
    tone: "update",
    targetKind: "channel",
  },
  [AuditLogEvent.ChannelDelete]: {
    label: "Deleted a channel",
    category: "channels",
    tone: "delete",
    targetKind: "channel",
  },
  [AuditLogEvent.ChannelOverwriteCreate]: {
    label: "Created a channel permission",
    category: "channels",
    tone: "create",
    targetKind: "channel",
  },
  [AuditLogEvent.ChannelOverwriteUpdate]: {
    label: "Updated a channel permission",
    category: "channels",
    tone: "update",
    targetKind: "channel",
  },
  [AuditLogEvent.ChannelOverwriteDelete]: {
    label: "Deleted a channel permission",
    category: "channels",
    tone: "delete",
    targetKind: "channel",
  },
  [AuditLogEvent.MemberKick]: {
    label: "Kicked a member",
    category: "members",
    tone: "delete",
    targetKind: "user",
  },
  [AuditLogEvent.MemberPrune]: {
    label: "Pruned inactive members",
    category: "members",
    tone: "delete",
    targetKind: "user",
  },
  [AuditLogEvent.MemberBanAdd]: {
    label: "Banned a member",
    category: "members",
    tone: "delete",
    targetKind: "user",
  },
  [AuditLogEvent.MemberBanRemove]: {
    label: "Unbanned a member",
    category: "members",
    tone: "create",
    targetKind: "user",
  },
  [AuditLogEvent.MemberUpdate]: {
    label: "Updated a member",
    category: "members",
    tone: "update",
    targetKind: "user",
  },
  [AuditLogEvent.MemberRoleUpdate]: {
    label: "Updated a member's roles",
    category: "members",
    tone: "update",
    targetKind: "user",
  },
  [AuditLogEvent.MemberMove]: {
    label: "Moved a member in voice",
    category: "members",
    tone: "update",
    targetKind: "user",
  },
  [AuditLogEvent.MemberDisconnect]: {
    label: "Disconnected a member from voice",
    category: "members",
    tone: "delete",
    targetKind: "user",
  },
  [AuditLogEvent.BotAdd]: {
    label: "Added a bot",
    category: "members",
    tone: "create",
    targetKind: "user",
  },
  [AuditLogEvent.RoleCreate]: {
    label: "Created a role",
    category: "roles",
    tone: "create",
    targetKind: "role",
  },
  [AuditLogEvent.RoleUpdate]: {
    label: "Updated a role",
    category: "roles",
    tone: "update",
    targetKind: "role",
  },
  [AuditLogEvent.RoleDelete]: {
    label: "Deleted a role",
    category: "roles",
    tone: "delete",
    targetKind: "role",
  },
  [AuditLogEvent.InviteCreate]: {
    label: "Created an invite",
    category: "server",
    tone: "create",
    targetKind: "invite",
  },
  [AuditLogEvent.InviteUpdate]: {
    label: "Updated an invite",
    category: "server",
    tone: "update",
    targetKind: "invite",
  },
  [AuditLogEvent.InviteDelete]: {
    label: "Deleted an invite",
    category: "server",
    tone: "delete",
    targetKind: "invite",
  },
  [AuditLogEvent.WebhookCreate]: {
    label: "Created a webhook",
    category: "server",
    tone: "create",
    targetKind: "webhook",
  },
  [AuditLogEvent.WebhookUpdate]: {
    label: "Updated a webhook",
    category: "server",
    tone: "update",
    targetKind: "webhook",
  },
  [AuditLogEvent.WebhookDelete]: {
    label: "Deleted a webhook",
    category: "server",
    tone: "delete",
    targetKind: "webhook",
  },
  [AuditLogEvent.EmojiCreate]: {
    label: "Created an emoji",
    category: "server",
    tone: "create",
    targetKind: "emoji",
  },
  [AuditLogEvent.EmojiUpdate]: {
    label: "Updated an emoji",
    category: "server",
    tone: "update",
    targetKind: "emoji",
  },
  [AuditLogEvent.EmojiDelete]: {
    label: "Deleted an emoji",
    category: "server",
    tone: "delete",
    targetKind: "emoji",
  },
  [AuditLogEvent.MessageDelete]: {
    label: "Deleted a message",
    category: "server",
    tone: "delete",
    targetKind: "message",
  },
  [AuditLogEvent.MessageBulkDelete]: {
    label: "Bulk-deleted messages",
    category: "server",
    tone: "delete",
    targetKind: "message",
  },
  [AuditLogEvent.MessagePin]: {
    label: "Pinned a message",
    category: "server",
    tone: "update",
    targetKind: "message",
  },
  [AuditLogEvent.MessageUnpin]: {
    label: "Unpinned a message",
    category: "server",
    tone: "update",
    targetKind: "message",
  },
  [AuditLogEvent.IntegrationCreate]: {
    label: "Created an integration",
    category: "server",
    tone: "create",
    targetKind: "integration",
  },
  [AuditLogEvent.IntegrationUpdate]: {
    label: "Updated an integration",
    category: "server",
    tone: "update",
    targetKind: "integration",
  },
  [AuditLogEvent.IntegrationDelete]: {
    label: "Deleted an integration",
    category: "server",
    tone: "delete",
    targetKind: "integration",
  },
  [AuditLogEvent.StageInstanceCreate]: {
    label: "Created a stage",
    category: "server",
    tone: "create",
    targetKind: "channel",
  },
  [AuditLogEvent.StageInstanceUpdate]: {
    label: "Updated a stage",
    category: "server",
    tone: "update",
    targetKind: "channel",
  },
  [AuditLogEvent.StageInstanceDelete]: {
    label: "Deleted a stage",
    category: "server",
    tone: "delete",
    targetKind: "channel",
  },
  [AuditLogEvent.StickerCreate]: {
    label: "Created a sticker",
    category: "server",
    tone: "create",
    targetKind: "sticker",
  },
  [AuditLogEvent.StickerUpdate]: {
    label: "Updated a sticker",
    category: "server",
    tone: "update",
    targetKind: "sticker",
  },
  [AuditLogEvent.StickerDelete]: {
    label: "Deleted a sticker",
    category: "server",
    tone: "delete",
    targetKind: "sticker",
  },
  [AuditLogEvent.GuildScheduledEventCreate]: {
    label: "Created an event",
    category: "server",
    tone: "create",
    targetKind: "unknown",
  },
  [AuditLogEvent.GuildScheduledEventUpdate]: {
    label: "Updated an event",
    category: "server",
    tone: "update",
    targetKind: "unknown",
  },
  [AuditLogEvent.GuildScheduledEventDelete]: {
    label: "Deleted an event",
    category: "server",
    tone: "delete",
    targetKind: "unknown",
  },
  [AuditLogEvent.ThreadCreate]: {
    label: "Created a thread",
    category: "channels",
    tone: "create",
    targetKind: "channel",
  },
  [AuditLogEvent.ThreadUpdate]: {
    label: "Updated a thread",
    category: "channels",
    tone: "update",
    targetKind: "channel",
  },
  [AuditLogEvent.ThreadDelete]: {
    label: "Deleted a thread",
    category: "channels",
    tone: "delete",
    targetKind: "channel",
  },
};

const CHANGE_KEY_LABELS: Record<string, string> = {
  name: "Name",
  topic: "Topic",
  bitrate: "Bitrate",
  nsfw: "NSFW",
  rate_limit_per_user: "Slowmode",
  position: "Position",
  color: "Color",
  hoist: "Display separately",
  mentionable: "Mentionable",
  permissions: "Permissions",
  allow: "Allow",
  deny: "Deny",
  code: "Code",
  channel_id: "Channel",
  inviter_id: "Inviter",
  max_uses: "Max uses",
  max_age: "Expiry",
  temporary: "Temporary",
  nick: "Nickname",
  mute: "Mute",
  deaf: "Deaf",
  communication_disabled_until: "Timeout",
  avatar_hash: "Avatar",
  icon_hash: "Icon",
  splash_hash: "Splash",
  banner_hash: "Banner",
  vanity_url_code: "URL vanity",
  description: "Description",
  preferred_locale: "Language",
  afk_channel_id: "AFK channel",
  afk_timeout: "AFK timeout",
  system_channel_id: "System channel",
  rules_channel_id: "Rules channel",
  public_updates_channel_id: "Updates channel",
  mfa_level: "MFA",
  verification_level: "Verification",
  explicit_content_filter: "Content filter",
  default_message_notifications: "Notifications",
  owner_id: "Owner",
  $add: "Roles added",
  $remove: "Roles removed",
};

function resolveGuild(bot: Client, guildId?: string): Guild {
  if (!bot.isReady()) {
    throw new ModerationError(
      "The Discord bot is not connected.",
      503,
      "BOT_NOT_READY",
    );
  }

  const id = (guildId ?? "").trim();
  if (!id) {
    throw new ModerationError("Missing guildId.", 400, "MISSING_GUILD_ID");
  }

  const guild = bot.guilds.cache.get(id);
  if (!guild) {
    throw new ModerationError(
      "The bot is not in that server.",
      404,
      "GUILD_NOT_FOUND",
    );
  }

  return guild;
}

function stringifyValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value || "—";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === "object" && "name" in item) {
          return String((item as { name: unknown }).name);
        }
        if (item && typeof item === "object" && "id" in item) {
          return String((item as { id: unknown }).id);
        }
        return stringifyValue(item);
      })
      .join(", ");
  }
  if (typeof value === "object" && value !== null && "name" in value) {
    return String((value as { name: unknown }).name);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function flattenChanges(entry: GuildAuditLogsEntry): DiscordAuditChangeItem[] {
  const changes = entry.changes ?? [];
  return changes.map((change) => {
    const key = String(change.key);
    const label = CHANGE_KEY_LABELS[key] ?? key;
    const oldValue = stringifyValue(change.old);
    const newValue = stringifyValue(change.new);

    let summary: string;
    if (key === "$add") {
      summary = `Added: ${newValue}`;
    } else if (key === "$remove") {
      summary = `Removed: ${oldValue !== "—" ? oldValue : newValue}`;
    } else if (oldValue === "—" && newValue !== "—") {
      summary = `${label}: ${newValue}`;
    } else if (newValue === "—" && oldValue !== "—") {
      summary = `${label} removed (was ${oldValue})`;
    } else if (key === "name") {
      summary = `Name changed to «${newValue}»`;
    } else {
      summary = `${label}: ${oldValue} → ${newValue}`;
    }

    return {
      key,
      summary,
      oldValue: oldValue === "—" ? undefined : oldValue,
      newValue: newValue === "—" ? undefined : newValue,
    };
  });
}

function resolveTarget(
  guild: Guild,
  entry: GuildAuditLogsEntry,
  meta: ActionMeta,
): DiscordAuditTarget {
  const targetId = entry.targetId ?? null;
  const target = entry.target as
    | {
        id?: string;
        username?: string;
        globalName?: string | null;
        name?: string;
        type?: number;
      }
    | null
    | undefined;

  if (target) {
    if (typeof target.username === "string") {
      return {
        id: target.id ?? targetId,
        kind: "user",
        label: `@${target.username}`,
      };
    }
    if (typeof target.name === "string") {
      if (meta.targetKind === "channel" || typeof target.type === "number") {
        return {
          id: target.id ?? targetId,
          kind: "channel",
          label: `#${target.name}`,
        };
      }
      if (meta.targetKind === "role") {
        return {
          id: target.id ?? targetId,
          kind: "role",
          label: `@${target.name}`,
        };
      }
      if (meta.targetKind === "guild") {
        return {
          id: target.id ?? targetId,
          kind: "guild",
          label: target.name,
        };
      }
      return {
        id: target.id ?? targetId,
        kind: meta.targetKind,
        label: target.name,
      };
    }
  }

  if (targetId) {
    const member = guild.members.cache.get(targetId);
    if (member) {
      return {
        id: targetId,
        kind: "user",
        label: `@${member.user.username}`,
      };
    }
    const channel = guild.channels.cache.get(targetId);
    if (channel) {
      return {
        id: targetId,
        kind: "channel",
        label: `#${channel.name}`,
      };
    }
    const role = guild.roles.cache.get(targetId);
    if (role) {
      return {
        id: targetId,
        kind: "role",
        label: `@${role.name}`,
      };
    }
    return {
      id: targetId,
      kind: meta.targetKind,
      label: `ID ${targetId}`,
    };
  }

  if (meta.targetKind === "guild") {
    return { id: guild.id, kind: "guild", label: guild.name };
  }

  return { id: null, kind: "unknown", label: "—" };
}

function actionKeyName(action: number): string {
  const found = Object.entries(AuditLogEvent).find(
    ([, value]) => value === action,
  );
  return found?.[0] ?? `Action_${action}`;
}

function resolveAuditRoleRef(
  guild: Guild,
  item: unknown,
): { id: string; name: string; color: string } | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as { id?: unknown; name?: unknown };
  const idRaw = raw.id;
  const id =
    typeof idRaw === "string"
      ? idRaw
      : typeof idRaw === "number" || typeof idRaw === "bigint"
        ? String(idRaw)
        : null;
  const fallbackName =
    typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null;

  if (id) {
    const cached = guild.roles.cache.get(id);
    if (cached) {
      return {
        id: cached.id,
        name: cached.name,
        color: cached.hexColor,
      };
    }
    // Rol ya no está en el servidor (o caché fría).
    return {
      id,
      name: fallbackName ?? "Deleted Role",
      color: "#000000",
    };
  }

  if (fallbackName) {
    const byName = guild.roles.cache.find((role) => role.name === fallbackName);
    if (byName) {
      return {
        id: byName.id,
        name: byName.name,
        color: byName.hexColor,
      };
    }
    return { id: fallbackName, name: fallbackName, color: "#000000" };
  }

  return null;
}

/** Discord API: `$add`/`$remove` llevan el array de roles parciales en `new` (a veces en `old`). */
function rolePartialListFromChange(change: {
  new?: unknown;
  old?: unknown;
}): unknown[] {
  if (Array.isArray(change.new)) return change.new;
  if (Array.isArray(change.old)) return change.old;
  return [];
}

function extractRoleRefsFromRaw(
  guild: Guild,
  entry: GuildAuditLogsEntry,
): {
  added: Array<{ id: string; name: string; color: string }>;
  removed: Array<{ id: string; name: string; color: string }>;
} {
  const added: Array<{ id: string; name: string; color: string }> = [];
  const removed: Array<{ id: string; name: string; color: string }> = [];
  const seenAdd = new Set<string>();
  const seenRem = new Set<string>();

  for (const change of entry.changes ?? []) {
    const key = String(change.key);
    if (key === "$add") {
      for (const item of rolePartialListFromChange(change)) {
        const ref = resolveAuditRoleRef(guild, item);
        if (!ref || seenAdd.has(ref.id)) continue;
        seenAdd.add(ref.id);
        added.push(ref);
      }
    }
    if (key === "$remove") {
      for (const item of rolePartialListFromChange(change)) {
        const ref = resolveAuditRoleRef(guild, item);
        if (!ref || seenRem.has(ref.id)) continue;
        seenRem.add(ref.id);
        removed.push(ref);
      }
    }
  }

  return { added, removed };
}

function mapEntry(guild: Guild, entry: GuildAuditLogsEntry): DiscordAuditEntry {
  const meta =
    ACTION_META[entry.action as AuditLogEvent] ??
    ({
      label: actionKeyName(entry.action),
      category: "server" as const,
      tone: "neutral" as const,
      targetKind: "unknown" as const,
    } satisfies ActionMeta);

  const changes = flattenChanges(entry);
  const reason = entry.reason?.trim() || null;
  const changesSummaryParts = [
    ...changes.map((item) => item.summary),
    reason ? `Reason: ${reason}` : null,
  ].filter(Boolean) as string[];

  const executorUser = entry.executor as User | null;
  const executorPreview = executorUser
    ? resolveUserPreview(guild, executorUser, 64)
    : null;
  const mapped: DiscordAuditEntry = {
    id: entry.id,
    createdAt: entry.createdAt.toISOString(),
    action: entry.action,
    actionKey: actionKeyName(entry.action),
    actionLabel: meta.label,
    category: meta.category,
    tone: meta.tone,
    executor: executorPreview
      ? {
          id: executorPreview.userId,
          username: executorPreview.username,
          displayName: executorPreview.displayName,
          avatarUrl: executorPreview.avatarUrl,
        }
      : null,
    target: resolveTarget(guild, entry, meta),
    reason,
    changes,
    changesSummary:
      changesSummaryParts.length > 0 ? changesSummaryParts.join(" · ") : "—",
  };

  if (entry.action === AuditLogEvent.MemberRoleUpdate) {
    const roles = extractRoleRefsFromRaw(guild, entry);
    mapped.addedRoles = roles.added;
    mapped.removedRoles = roles.removed;
    if (roles.added.length > 0 && roles.removed.length === 0) {
      mapped.roleKind = "ROLE_ADD";
      mapped.actionLabel = "Roles added";
      mapped.tone = "create";
    } else if (roles.removed.length > 0 && roles.added.length === 0) {
      mapped.roleKind = "ROLE_REMOVE";
      mapped.actionLabel = "Roles removed";
      mapped.tone = "delete";
    } else {
      mapped.roleKind = "ROLE_UPDATE";
      mapped.actionLabel = "Roles updated";
      mapped.tone = "update";
    }
  }

  return mapped;
}

export async function fetchDiscordAuditLog(
  bot: Client,
  options: {
    guildId?: string;
    limit?: number;
    userId?: string;
    actionType?: number;
  } = {},
): Promise<DiscordAuditLogResponse> {
  const guild = resolveGuild(bot, options.guildId);
  const safeLimit = Math.max(
    1,
    Math.min(100, Math.round(options.limit ?? 100)),
  );

  const fetchOptions: {
    limit: number;
    user?: string;
    type?: AuditLogEvent;
  } = { limit: safeLimit };

  if (options.userId?.trim()) {
    const userId = options.userId.trim();
    if (!/^\d{17,20}$/.test(userId)) {
      throw new ModerationError("Invalid userId.", 400, "INVALID_IDS");
    }
    fetchOptions.user = userId;
  }

  if (
    options.actionType != null &&
    Number.isFinite(options.actionType) &&
    options.actionType >= 1
  ) {
    fetchOptions.type = options.actionType as AuditLogEvent;
  }

  try {
    const logs = await guild.fetchAuditLogs(fetchOptions);
    const executorIds = [
      ...new Set(
        [...logs.entries.values()]
          .map((entry) => entry.executorId ?? entry.executor?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (executorIds.length > 0) {
      await resolveMembersBatch(guild, bot, executorIds, 64);
    }
    const rawEntries = [...logs.entries.values()].map((entry) =>
      mapEntry(guild, entry),
    );
    const entries = consolidateAuditLogs(rawEntries);

    return {
      entries,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error: unknown) {
    if (error instanceof DiscordAPIError) {
      if (error.code === 50013 || error.status === 403) {
        throw new ModerationError(
          "Missing the «View Audit Log» permission. Grant View Audit Log to the bot.",
          403,
          "MISSING_PERMISSIONS",
        );
      }
    }
    if (error instanceof ModerationError) throw error;
    logger.error({ err: error }, "Failed to fetch audit log:");
    throw new ModerationError(
      "Couldn't fetch the Discord audit log.",
      500,
      "AUDIT_FETCH_FAILED",
    );
  }
}
