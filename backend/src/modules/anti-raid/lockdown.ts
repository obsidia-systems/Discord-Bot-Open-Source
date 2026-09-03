import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
} from "discord.js";
import type { LockdownOverwriteSnapshot } from "@adobos/shared";
import { logger } from "../../core/log.js";
import {
  getAntiRaidSettings,
  getLockdownSnapshot,
  setLockdownState,
} from "./service.js";

const LOCK_PERMS = {
  SendMessages: false,
  AddReactions: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
  Connect: false,
  Speak: false,
} as const;

function lockable(channel: GuildBasedChannel): boolean {
  return (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildAnnouncement ||
    channel.type === ChannelType.GuildVoice ||
    channel.type === ChannelType.GuildStageVoice
  );
}

function canManage(guild: Guild, channel: GuildBasedChannel): boolean {
  const me = guild.members.me;
  if (!me) return false;
  if (!("permissionOverwrites" in channel)) return false;
  return Boolean(
    channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels),
  );
}

export async function applyGuildLockdown(
  guild: Guild,
  byUserId: string | null,
): Promise<{ channels: number }> {
  const current = await getAntiRaidSettings(guild.id);
  if (current.lockdownActive) return { channels: 0 };

  await setLockdownState({
    guildId: guild.id,
    active: true,
    byUserId,
    snapshot: [],
  });

  const everyoneId = guild.id;
  const snapshot: LockdownOverwriteSnapshot[] = [];
  let channels = 0;

  for (const channel of guild.channels.cache.values()) {
    if (!lockable(channel) || !canManage(guild, channel)) continue;
    if (!("permissionOverwrites" in channel)) continue;
    const existing = channel.permissionOverwrites.cache.get(everyoneId);
    snapshot.push({
      channelId: channel.id,
      existed: Boolean(existing),
      allow: existing ? existing.allow.bitfield.toString() : "0",
      deny: existing ? existing.deny.bitfield.toString() : "0",
    });
    try {
      await channel.permissionOverwrites.edit(everyoneId, LOCK_PERMS, {
        reason: "Anti-Raid lockdown",
      });
      channels += 1;
    } catch (error: unknown) {
      logger.warn(
        { err: error, channelId: channel.id },
        "anti-raid: couldn't lock channel",
      );
    }
  }

  await setLockdownState({
    guildId: guild.id,
    active: true,
    byUserId,
    snapshot,
  });
  return { channels };
}

export async function liftGuildLockdown(
  guild: Guild,
): Promise<{ channels: number }> {
  const snapshot = await getLockdownSnapshot(guild.id);
  const everyoneId = guild.id;
  let channels = 0;

  for (const item of snapshot) {
    const channel = guild.channels.cache.get(item.channelId);
    if (!channel || !("permissionOverwrites" in channel)) continue;
    if (!canManage(guild, channel)) continue;
    try {
      const rest = [
        ...channel.permissionOverwrites.cache
          .filter((overwrite) => overwrite.id !== everyoneId)
          .map((overwrite) => ({
            id: overwrite.id,
            type: overwrite.type,
            allow: overwrite.allow.bitfield,
            deny: overwrite.deny.bitfield,
          })),
      ];
      if (item.existed) {
        rest.push({
          id: everyoneId,
          type: 0 as const,
          allow: BigInt(item.allow || "0"),
          deny: BigInt(item.deny || "0"),
        });
      }
      await channel.permissionOverwrites.set(rest, "Anti-Raid unlock");
      channels += 1;
    } catch (error: unknown) {
      logger.warn(
        { err: error, channelId: item.channelId },
        "anti-raid: couldn't restore channel",
      );
    }
  }

  await setLockdownState({
    guildId: guild.id,
    active: false,
    byUserId: null,
    snapshot: [],
  });
  return { channels };
}
