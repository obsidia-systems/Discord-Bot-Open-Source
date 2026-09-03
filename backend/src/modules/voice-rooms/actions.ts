import {
  canClaimVoiceRoom,
  clampVoiceBitrateKbps,
  clampVoiceUserLimit,
  sanitizeVoiceRoomName,
  type VoiceRoomAction,
  type VoiceRoomGenerator,
  type VoiceRoomLive,
} from "@adobos/shared";
import {
  ChannelType,
  type GuildMember,
  MessageFlags,
  type VoiceChannel,
} from "discord.js";
import {
  applyGhost,
  applyLock,
  assertCanControl,
  createInviteUrl,
  ensureTextChannel,
  fetchVoiceChannel,
  permitTarget,
  rejectTarget,
  setRoomBitrate,
  setRoomLimit,
  setRoomName,
  setRoomStatus,
  transferOwnerOverwrites,
} from "./rooms.js";
import {
  getGeneratorById,
  getRoomByChannel,
  getRoomByOwner,
  patchRoom,
  VoiceRoomsError,
} from "./service.js";

export interface VoiceActionInput {
  member: GuildMember;
  room: VoiceRoomLive;
  generator: VoiceRoomGenerator;
  channel: VoiceChannel;
  action: VoiceRoomAction | "unlock" | "unghost";
  name?: string;
  limit?: number;
  bitrate?: number;
  status?: string;
  targetUserId?: string | null;
  targetRoleId?: string | null;
  inviteMessage?: string;
}

function mappedAction(action: VoiceActionInput["action"]): VoiceRoomAction {
  if (action === "unlock") return "lock";
  if (action === "unghost") return "ghost";
  return action;
}

export async function runVoiceRoomAction(
  input: VoiceActionInput,
): Promise<string> {
  const action = mappedAction(input.action);
  const { member, room, generator, channel } = input;
  assertCanControl(member, room, action, generator.allowedActions);

  if (action === "claim") {
    const ownerIn = channel.members.has(room.ownerId);
    if (
      !canClaimVoiceRoom({
        ownerId: room.ownerId,
        actorId: member.id,
        ownerInChannel: ownerIn,
      })
    ) {
      throw new VoiceRoomsError(
        "The owner is still in the room.",
        400,
        "OWNER_PRESENT",
      );
    }
    if (!channel.members.has(member.id)) {
      throw new VoiceRoomsError(
        "You have to be in the room to claim it.",
        400,
        "NOT_IN_ROOM",
      );
    }
    await transferOwnerOverwrites(channel, room.ownerId, member.id);
    await patchRoom(room.channelId, { ownerId: member.id });
    return "You are now the room owner.";
  }

  switch (input.action) {
    case "name": {
      const name = sanitizeVoiceRoomName(input.name ?? "");
      await setRoomName(channel, name);
      return `Name: **${name}**.`;
    }
    case "limit": {
      const limit = clampVoiceUserLimit(input.limit ?? 0);
      await setRoomLimit(channel, limit);
      return limit === 0 ? "No user limit." : `Limit: **${limit}**.`;
    }
    case "lock": {
      await applyLock(channel, true);
      await patchRoom(room.channelId, { locked: true });
      return "Room locked. No one new enters except via permit.";
    }
    case "unlock": {
      await applyLock(channel, false);
      await patchRoom(room.channelId, { locked: false });
      return "Room unlocked.";
    }
    case "ghost": {
      await applyGhost(channel, true);
      await patchRoom(room.channelId, { ghosted: true });
      return "Room hidden (ghost).";
    }
    case "unghost": {
      await applyGhost(channel, false);
      await patchRoom(room.channelId, { ghosted: false });
      return "Room visible again.";
    }
    case "bitrate": {
      const kbps = clampVoiceBitrateKbps(
        input.bitrate ?? 64,
        channel.guild.maximumBitrate,
      );
      await setRoomBitrate(channel, kbps);
      return `Bitrate: **${kbps} kbps**.`;
    }
    case "status": {
      const status = (input.status ?? "").trim();
      if (!status) {
        throw new VoiceRoomsError("Type a status.", 400, "INVALID_STATUS");
      }
      await setRoomStatus(channel, status);
      return "Status updated.";
    }
    case "text": {
      if (room.textChannelId) {
        return `Text channel already exists: <#${room.textChannelId}>.`;
      }
      const textId = await ensureTextChannel(channel.guild, channel, member);
      await patchRoom(room.channelId, { textChannelId: textId });
      return `Text channel: <#${textId}>.`;
    }
    case "permit": {
      const userId = input.targetUserId ?? null;
      const roleId = input.targetRoleId ?? null;
      if (!userId && !roleId) {
        throw new VoiceRoomsError(
          "Mention a user or a role.",
          400,
          "MISSING_TARGET",
        );
      }
      if (userId) await permitTarget(channel, userId);
      if (roleId) await permitTarget(channel, roleId);
      return "Permitted.";
    }
    case "reject": {
      const userId = input.targetUserId ?? null;
      const roleId = input.targetRoleId ?? null;
      if (!userId && !roleId) {
        throw new VoiceRoomsError(
          "Mention a user or a role.",
          400,
          "MISSING_TARGET",
        );
      }
      if (userId) await rejectTarget(channel, userId, false);
      if (roleId) await rejectTarget(channel, roleId, true);
      return "Rejected.";
    }
    case "transfer": {
      const toId = input.targetUserId;
      if (!toId) {
        throw new VoiceRoomsError(
          "Choose the new owner.",
          400,
          "MISSING_TARGET",
        );
      }
      if (toId === room.ownerId) {
        throw new VoiceRoomsError(
          "They are already the owner.",
          400,
          "ALREADY_OWNER",
        );
      }
      if (!channel.members.has(toId)) {
        throw new VoiceRoomsError(
          "The new owner has to be in the room.",
          400,
          "NOT_IN_ROOM",
        );
      }
      const occupied = await getRoomByOwner(room.guildId, toId);
      if (occupied) {
        throw new VoiceRoomsError(
          "That person already has a room.",
          400,
          "ALREADY_HAS_ROOM",
        );
      }
      await transferOwnerOverwrites(channel, room.ownerId, toId);
      await patchRoom(room.channelId, { ownerId: toId });
      return `Owner: <@${toId}>.`;
    }
    case "invite": {
      const toId = input.targetUserId;
      if (!toId) {
        throw new VoiceRoomsError(
          "Choose who to invite.",
          400,
          "MISSING_TARGET",
        );
      }
      const url = await createInviteUrl(channel);
      const note = input.inviteMessage?.trim();
      const body = note
        ? `${note}\n${url}`
        : `You were invited to a voice room: ${url}`;
      const user = await member.client.users.fetch(toId).catch(() => null);
      if (user) {
        const dm = await user.send(body).catch(() => null);
        if (dm) return `Invite sent to <@${toId}>.`;
      }
      return `I couldn't send a DM. Link: ${url}`;
    }
    default:
      throw new VoiceRoomsError("Unknown action.", 400, "UNKNOWN_ACTION");
  }
}

export async function loadRoomContext(member: GuildMember): Promise<{
  room: VoiceRoomLive;
  generator: VoiceRoomGenerator;
  channel: VoiceChannel;
}> {
  const voice = member.voice.channel;
  if (!voice || voice.type !== ChannelType.GuildVoice) {
    throw new VoiceRoomsError(
      "Join your voice room first.",
      400,
      "NOT_IN_VOICE",
    );
  }
  const room = await getRoomByChannel(voice.id);
  if (!room) {
    throw new VoiceRoomsError(
      "This is not a Voice Rooms room.",
      400,
      "NOT_A_ROOM",
    );
  }
  const generator = await getGeneratorById(room.generatorId, room.guildId);
  const channel = await fetchVoiceChannel(member.guild, room.channelId);
  if (!channel) {
    throw new VoiceRoomsError("The room no longer exists.", 404, "ROOM_GONE");
  }
  return { room, generator, channel };
}

export const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const;
