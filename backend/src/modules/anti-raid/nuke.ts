import {
  type AntiRaidSettings,
  isAntiRaidImmune,
  type NukeAction,
  nukeThresholdExceeded,
  recordAndCount,
} from "@adobos/shared";
import {
  AuditLogEvent,
  type Guild,
  type GuildAuditLogsEntry,
  type GuildMember,
  PermissionFlagsBits,
} from "discord.js";
import { can } from "../../core/entitlements/service.js";
import { logger } from "../../core/log.js";
import { resolveAlertChannel, sendAntiRaidAlert } from "./alerts.js";

const AUDIT_TO_NUKE: Partial<Record<AuditLogEvent, NukeAction>> = {
  [AuditLogEvent.ChannelCreate]: "channelCreate",
  [AuditLogEvent.ChannelDelete]: "channelDelete",
  [AuditLogEvent.RoleCreate]: "roleCreate",
  [AuditLogEvent.RoleDelete]: "roleDelete",
  [AuditLogEvent.MemberBanAdd]: "memberBan",
  [AuditLogEvent.MemberKick]: "memberKick",
  [AuditLogEvent.BotAdd]: "botAdd",
  [AuditLogEvent.WebhookCreate]: "webhookCreate",
};

const DANGEROUS =
  PermissionFlagsBits.Administrator |
  PermissionFlagsBits.ManageGuild |
  PermissionFlagsBits.ManageChannels |
  PermissionFlagsBits.ManageRoles |
  PermissionFlagsBits.BanMembers |
  PermissionFlagsBits.KickMembers |
  PermissionFlagsBits.ManageWebhooks;

const windows = new Map<string, number[]>();

function windowKey(
  guildId: string,
  userId: string,
  action: NukeAction,
): string {
  return `${guildId}:${userId}:${action}`;
}

async function stripDangerousRoles(member: GuildMember): Promise<number> {
  const me = member.guild.members.me;
  if (!me) return 0;
  let removed = 0;
  for (const role of member.roles.cache.values()) {
    if (role.id === member.guild.id) continue;
    if (!role.permissions.has(DANGEROUS)) continue;
    if (me.roles.highest.comparePositionTo(role) <= 0) continue;
    if (!role.editable) continue;
    try {
      await member.roles.remove(role, "Anti-Nuke strip");
      removed += 1;
    } catch (error: unknown) {
      logger.warn(
        { err: error, roleId: role.id },
        "anti-nuke: role not removed",
      );
    }
  }
  if (member.moderatable) {
    await member.timeout(3_600_000, "Anti-Nuke strip").catch(() => undefined);
  }
  return removed;
}

async function punish(
  member: GuildMember,
  settings: AntiRaidSettings,
  action: NukeAction,
): Promise<void> {
  const reason = `Anti-Nuke: ${action}`;
  if (settings.nukePunishment === "ban" && member.bannable) {
    await member
      .ban({ reason, deleteMessageSeconds: 0 })
      .catch(() => undefined);
    return;
  }
  if (settings.nukePunishment === "kick" && member.kickable) {
    await member.kick(reason).catch(() => undefined);
    return;
  }
  await stripDangerousRoles(member);
}

export async function onAntiNukeAudit(
  entry: GuildAuditLogsEntry,
  guild: Guild,
  settings: AntiRaidSettings,
): Promise<void> {
  if (!settings.nukeEnabled) return;
  if (!(await can(guild.id, "antinuke"))) return;

  const mapped = AUDIT_TO_NUKE[entry.action as AuditLogEvent];
  if (!mapped) return;
  const executor = entry.executor;
  if (!executor) return;

  const immune = isAntiRaidImmune({
    userId: executor.id,
    ownerId: guild.ownerId,
    botId: guild.client.user?.id ?? null,
    memberRoleIds: [],
    whitelistUserIds: settings.nukeWhitelistUserIds,
    whitelistRoleIds: settings.nukeWhitelistRoleIds,
  });
  if (immune) return;

  const member =
    guild.members.cache.get(executor.id) ??
    (await guild.members.fetch(executor.id).catch(() => null));
  if (!member) return;

  const withRoles = isAntiRaidImmune({
    userId: member.id,
    ownerId: guild.ownerId,
    botId: guild.client.user?.id ?? null,
    memberRoleIds: [...member.roles.cache.keys()],
    whitelistUserIds: settings.nukeWhitelistUserIds,
    whitelistRoleIds: settings.nukeWhitelistRoleIds,
  });
  if (withRoles) return;

  const now = Date.now();
  const key = windowKey(guild.id, member.id, mapped);
  const recorded = recordAndCount(
    windows.get(key) ?? [],
    now,
    settings.nukeWindowSeconds * 1000,
  );
  windows.set(key, recorded.next);

  const threshold = settings.nukeThresholds[mapped];
  if (!nukeThresholdExceeded(recorded.count, threshold)) return;

  await punish(member, settings, mapped);

  const alert = await resolveAlertChannel(guild, settings);
  await sendAntiRaidAlert(
    alert,
    "Anti-Nuke",
    `Sanction **${settings.nukePunishment}** on <@${member.id}> for **${mapped}** (${recorded.count}/${threshold} in ${settings.nukeWindowSeconds}s).`,
  );
}
