import { type Guild, type GuildMember, type VoiceState } from "discord.js";
import { VOICE_ROOM_EMPTY_GRACE_MS } from "@adobos/shared";
import type { ModuleContext } from "../../core/modules/types.js";
import { logger } from "../../core/log.js";
import {
  createOwnedRoom,
  destroyVoicePair,
  ensureTextChannel,
  fetchVoiceChannel,
  moveToChannel,
  syncTextMembership,
} from "./rooms.js";
import {
  deleteRoomRow,
  getGeneratorByHub,
  getRoomByChannel,
  getRoomByOwner,
  insertRoom,
  listGuildRooms,
  listHubChannelIds,
} from "./service.js";

const emptyTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearEmptyTimer(channelId: string): void {
  const timer = emptyTimers.get(channelId);
  if (timer) {
    clearTimeout(timer);
    emptyTimers.delete(channelId);
  }
}

function scheduleEmpty(guild: Guild, channelId: string): void {
  clearEmptyTimer(channelId);
  const timer = setTimeout(() => {
    emptyTimers.delete(channelId);
    void destroyIfEmpty(guild, channelId);
  }, VOICE_ROOM_EMPTY_GRACE_MS);
  emptyTimers.set(channelId, timer);
}

async function destroyIfEmpty(guild: Guild, channelId: string): Promise<void> {
  const room = await getRoomByChannel(channelId);
  if (!room) return;
  const channel = await fetchVoiceChannel(guild, channelId);
  if (channel && channel.members.size > 0) return;
  await destroyVoicePair(guild, room);
  await deleteRoomRow(channelId);
}

async function onJoinHub(member: GuildMember, hubId: string): Promise<void> {
  const generator = await getGeneratorByHub(member.guild.id, hubId);
  if (!generator) return;

  const existing = await getRoomByOwner(member.guild.id, member.id);
  if (existing) {
    const voice = await fetchVoiceChannel(member.guild, existing.channelId);
    if (voice) {
      clearEmptyTimer(existing.channelId);
      await moveToChannel(member, voice);
      return;
    }
    await deleteRoomRow(existing.channelId);
  }

  const created = await createOwnedRoom(member.guild, member, generator);
  let textId: string | null = null;
  try {
    if (generator.autoText) {
      try {
        textId = await ensureTextChannel(member.guild, created, member);
      } catch (error: unknown) {
        logger.warn({ err: error }, "Voice Rooms: auto-texto falló");
      }
    }
    await insertRoom({
      channelId: created.id,
      guildId: member.guild.id,
      generatorId: generator.id,
      ownerId: member.id,
      textChannelId: textId,
    });
    await moveToChannel(member, created);
  } catch (error: unknown) {
    if (textId) {
      const text = member.guild.channels.cache.get(textId);
      await text?.delete("Voice Rooms: rollback").catch(() => null);
    }
    await created.delete("Voice Rooms: rollback").catch(() => null);
    throw error;
  }
}

async function handleVoiceState(
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  const guild = newState.guild ?? oldState.guild;
  if (!guild) return;
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;

  const oldId = oldState.channelId;
  const newId = newState.channelId;
  if (oldId === newId) return;

  const hubs = await listHubChannelIds(guild.id);

  if (newId && hubs.includes(newId)) {
    await onJoinHub(member, newId);
  }

  if (oldId) {
    const left = await getRoomByChannel(oldId);
    if (left) {
      await syncTextMembership(guild, left, member.id, false);
      const ch = await fetchVoiceChannel(guild, oldId);
      if (!ch || ch.members.size === 0) scheduleEmpty(guild, oldId);
    }
  }

  if (newId && !hubs.includes(newId)) {
    const joined = await getRoomByChannel(newId);
    if (joined) {
      clearEmptyTimer(newId);
      await syncTextMembership(guild, joined, member.id, true);
    }
  }
}

export async function reconcileVoiceRooms(bot: import("discord.js").Client): Promise<void> {
  if (!bot.isReady()) return;
  for (const guild of bot.guilds.cache.values()) {
    const rooms = await listGuildRooms(guild.id);
    for (const room of rooms) {
      const channel = await fetchVoiceChannel(guild, room.channelId);
      if (!channel) {
        if (room.textChannelId) {
          const text = guild.channels.cache.get(room.textChannelId);
          await text?.delete("Voice Rooms: reconcile").catch(() => null);
        }
        await deleteRoomRow(room.channelId);
        continue;
      }
      if (channel.members.size === 0) {
        await destroyVoicePair(guild, room);
        await deleteRoomRow(room.channelId);
      }
    }
  }
}

export function registerVoiceRoomListeners(ctx: ModuleContext): void {
  ctx.on("voiceStateUpdate", (oldState, newState) => {
    void handleVoiceState(oldState, newState).catch((error: unknown) => {
      logger.warn({ err: error }, "voiceStateUpdate Voice Rooms:");
    });
  });
  ctx.once("ready", () => {
    void reconcileVoiceRooms(ctx.client).catch((error: unknown) => {
      logger.warn({ err: error }, "Voice Rooms: reconcile falló");
    });
  });
}
