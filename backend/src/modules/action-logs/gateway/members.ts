import {
  AuditLogEvent,
  type GuildBan,
  type GuildMember,
  type PartialGuildMember,
} from "discord.js";
import { resolveAuditExecutor } from "../audit.js";
import { passesActionLogFilters, recordActionLog } from "../discord.js";
import { userTag } from "../helpers.js";

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
    summary: `${userTag(member.user)} joined the server`,
    description: `**Member joins** the server`,
    details: { accountCreatedAt: member.user.createdAt.toISOString() },
    actorIsBot: member.user.bot,
    actorRoleIds: [...member.roles.cache.keys()],
  });
}

export async function onGuildMemberRemove(
  member: GuildMember | PartialGuildMember,
): Promise<void> {
  const user = member.user;
  if (!user) return;
  const roleIds = "roles" in member ? [...member.roles.cache.keys()] : [];

  const leaveOk = await passesActionLogFilters(member.guild.id, "memberLeave", {
    actorIsBot: user.bot,
    actorRoleIds: roleIds,
  });
  const kickOk = await passesActionLogFilters(member.guild.id, "memberKick", {
    actorIsBot: false,
    actorRoleIds: roleIds,
  });
  if (!leaveOk && !kickOk) return;

  const kicker = kickOk
    ? await resolveAuditExecutor(
        member.guild,
        AuditLogEvent.MemberKick,
        user.id,
      )
    : null;

  if (kicker && kickOk) {
    await recordActionLog(member.client, {
      guildId: member.guild.id,
      eventKey: "memberKick",
      executorId: kicker.id,
      executorTag: kicker.tag,
      executorAvatarURL: kicker.avatarURL,
      targetId: user.id,
      targetTag: userTag(user),
      channelId: null,
      summary: `${userTag(user)} was kicked by ${kicker.tag}`,
      description: `**Member kicked** from the server`,
      details: { targetKind: "user" },
      actorIsBot: kicker.bot,
      actorRoleIds: kicker.roleIds,
    });
    return;
  }

  if (!leaveOk) return;
  await recordActionLog(member.client, {
    guildId: member.guild.id,
    eventKey: "memberLeave",
    executorId: member.id,
    executorTag: userTag(user),
    executorAvatarURL: user.displayAvatarURL({ size: 128 }),
    targetId: member.id,
    targetTag: userTag(user),
    channelId: null,
    summary: `${userTag(user)} left the server`,
    description: `**User left** the server`,
    details: {},
    actorIsBot: user.bot,
    actorRoleIds: roleIds,
  });
}

function activeTimeoutMs(
  member: GuildMember | PartialGuildMember,
): number | null {
  if (!("communicationDisabledUntilTimestamp" in member)) return null;
  const ts = member.communicationDisabledUntilTimestamp;
  if (typeof ts !== "number" || ts <= Date.now()) return null;
  return ts;
}

export async function onGuildMemberUpdate(
  oldMember: GuildMember | PartialGuildMember,
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
      summary: `Nickname: ${oldNick ?? "(none)"} → ${newNick ?? "(none)"}`,
      details: { oldContent: oldNick ?? "", newContent: newNick ?? "" },
      actorIsBot: newMember.user.bot,
      actorRoleIds: [...newMember.roles.cache.keys()],
    });
  }

  if (!oldMember.partial) {
    const oldUntil = activeTimeoutMs(oldMember);
    const newUntil = activeTimeoutMs(newMember);
    if (oldUntil !== newUntil) {
      const timedOut = newUntil != null;
      const eventKey = timedOut ? "memberTimeout" : "memberUntimeout";
      if (
        await passesActionLogFilters(newMember.guild.id, eventKey, {
          actorIsBot: newMember.user.bot,
          actorRoleIds: [...newMember.roles.cache.keys()],
        })
      ) {
        const executor = await resolveAuditExecutor(
          newMember.guild,
          AuditLogEvent.MemberUpdate,
          newMember.id,
        );
        const untilLabel = newUntil
          ? `<t:${Math.floor(newUntil / 1000)}:R>`
          : "lifted";
        await recordActionLog(newMember.client, {
          guildId: newMember.guild.id,
          eventKey,
          executorId: executor?.id ?? newMember.id,
          executorTag: executor?.tag ?? userTag(newMember.user),
          executorAvatarURL: executor?.avatarURL ?? null,
          targetId: newMember.id,
          targetTag: userTag(newMember.user),
          channelId: null,
          summary:
            timedOut && newUntil
              ? `${userTag(newMember.user)} timed out until ${new Date(newUntil).toISOString()}`
              : `${userTag(newMember.user)} is no longer timed out`,
          description: timedOut
            ? `**Timeout** ${untilLabel}`
            : `**Timeout lifted**`,
          details: {
            targetKind: "user",
            timedOutUntil: newUntil ? new Date(newUntil).toISOString() : null,
          },
          actorIsBot: executor?.bot ?? false,
          actorRoleIds: executor?.roleIds,
          executorUnknown: !executor,
        });
      }
    }
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
      oldContent: removed.map(roleName).join(", ") || "(none)",
      newContent: added.map(roleName).join(", ") || "(none)",
    },
    actorIsBot: newMember.user.bot,
    actorRoleIds: [...newMember.roles.cache.keys()],
  });
}

export async function onGuildBanAdd(ban: GuildBan): Promise<void> {
  const executor = await resolveAuditExecutor(
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
  const executor = await resolveAuditExecutor(
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
