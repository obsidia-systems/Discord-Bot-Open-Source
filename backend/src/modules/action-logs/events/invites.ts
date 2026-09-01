import { AuditLogEvent, type Guild, type Invite } from "discord.js";
import { resolveAuditExecutor } from "../audit.js";
import { userTag } from "../helpers.js";
import { passesActionLogFilters, recordActionLog } from "../service.js";

function inviteGuild(invite: Invite): Guild | null {
  if (!invite.guild) return null;
  return invite.client.guilds.cache.get(invite.guild.id) ?? null;
}

export async function onInviteCreate(invite: Invite): Promise<void> {
  const guild = inviteGuild(invite);
  if (!guild) return;
  const inviter = invite.inviter;
  if (
    !await passesActionLogFilters(guild.id, "inviteCreate", {
      channelId: invite.channelId,
      actorIsBot: inviter?.bot,
    })
  ) {
    return;
  }
  await recordActionLog(invite.client, {
    guildId: guild.id,
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
  const guild = inviteGuild(invite);
  if (!guild) return;
  if (
    !await passesActionLogFilters(guild.id, "inviteDelete", {
      channelId: invite.channelId,
    })
  ) {
    return;
  }
  const executor = await resolveAuditExecutor(
    guild,
    AuditLogEvent.InviteDelete,
    null,
    { allowMissingTarget: true },
  );
  await recordActionLog(invite.client, {
    guildId: guild.id,
    eventKey: "inviteDelete",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: invite.code,
    targetTag: invite.code,
    channelId: invite.channelId,
    summary: `Invitación eliminada: discord.gg/${invite.code}`,
    details: { code: invite.code },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
  });
}
