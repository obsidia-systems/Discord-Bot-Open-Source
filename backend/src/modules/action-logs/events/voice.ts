import { AuditLogEvent, type VoiceState } from "discord.js";
import { resolveAuditExecutor } from "../audit.js";
import { userTag } from "../helpers.js";
import { logger } from "../../../core/log.js";
import { passesActionLogFilters, recordActionLog } from "../service.js";

export async function onVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  try {
    await handleVoiceStateUpdate(oldState, newState);
  } catch (err) {
    logger.warn({ err: err }, "voiceStateUpdate falló (no se detiene el bot):");
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
      !await passesActionLogFilters(guild.id, "voiceJoin", {
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

    const leaveOk = await passesActionLogFilters(guild.id, "voiceLeave", {
      channelId: disconnectChannelId,
      parentId: disconnectParentId,
      actorIsBot: user.bot,
      actorRoleIds: roleIds,
    });
    const kickOk = await passesActionLogFilters(guild.id, "voiceKick", {
      channelId: disconnectChannelId,
      parentId: disconnectParentId,
      actorIsBot: false,
      actorRoleIds: roleIds,
    });
    if (!leaveOk && !kickOk) return;

    const kickedBy = kickOk
      ? await resolveAuditExecutor(
          guild,
          AuditLogEvent.MemberDisconnect,
          user.id,
          { allowMissingTarget: true },
        )
      : null;

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
      !await passesActionLogFilters(guild.id, "voiceMove", {
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
