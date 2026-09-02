import { ChannelType, MessageFlags, type GuildMember, type VoiceChannel } from "discord.js";
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
  applyGhost,
  applyLock,
  assertCanControl,
  createInviteUrl,
  ensureTextChannel,
  fetchVoiceChannel,
  rejectTarget,
  permitTarget,
  setRoomBitrate,
  setRoomLimit,
  setRoomName,
  setRoomStatus,
  transferOwnerOverwrites,
} from "./rooms.js";
import {
  VoiceRoomsError,
  getGeneratorById,
  getRoomByChannel,
  getRoomByOwner,
  patchRoom,
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

function mappedAction(
  action: VoiceActionInput["action"],
): VoiceRoomAction {
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
        "El dueño sigue en la sala.",
        400,
        "OWNER_PRESENT",
      );
    }
    if (!channel.members.has(member.id)) {
      throw new VoiceRoomsError(
        "Tienes que estar en la sala para reclamarla.",
        400,
        "NOT_IN_ROOM",
      );
    }
    await transferOwnerOverwrites(channel, room.ownerId, member.id);
    await patchRoom(room.channelId, { ownerId: member.id });
    return "Ahora eres el dueño de la sala.";
  }

  switch (input.action) {
    case "name": {
      const name = sanitizeVoiceRoomName(input.name ?? "");
      await setRoomName(channel, name);
      return `Nombre: **${name}**.`;
    }
    case "limit": {
      const limit = clampVoiceUserLimit(input.limit ?? 0);
      await setRoomLimit(channel, limit);
      return limit === 0
        ? "Sin límite de usuarios."
        : `Límite: **${limit}**.`;
    }
    case "lock": {
      await applyLock(channel, true);
      await patchRoom(room.channelId, { locked: true });
      return "Sala cerrada. Nadie nuevo entra salvo permit.";
    }
    case "unlock": {
      await applyLock(channel, false);
      await patchRoom(room.channelId, { locked: false });
      return "Sala abierta.";
    }
    case "ghost": {
      await applyGhost(channel, true);
      await patchRoom(room.channelId, { ghosted: true });
      return "Sala oculta (ghost).";
    }
    case "unghost": {
      await applyGhost(channel, false);
      await patchRoom(room.channelId, { ghosted: false });
      return "Sala visible otra vez.";
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
        throw new VoiceRoomsError("Escribe un estado.", 400, "INVALID_STATUS");
      }
      await setRoomStatus(channel, status);
      return "Estado actualizado.";
    }
    case "text": {
      if (room.textChannelId) {
        return `Ya hay texto: <#${room.textChannelId}>.`;
      }
      const textId = await ensureTextChannel(channel.guild, channel, member);
      await patchRoom(room.channelId, { textChannelId: textId });
      return `Canal de texto: <#${textId}>.`;
    }
    case "permit": {
      const userId = input.targetUserId ?? null;
      const roleId = input.targetRoleId ?? null;
      if (!userId && !roleId) {
        throw new VoiceRoomsError(
          "Menciona un usuario o un rol.",
          400,
          "MISSING_TARGET",
        );
      }
      if (userId) await permitTarget(channel, userId);
      if (roleId) await permitTarget(channel, roleId);
      return "Permitido.";
    }
    case "reject": {
      const userId = input.targetUserId ?? null;
      const roleId = input.targetRoleId ?? null;
      if (!userId && !roleId) {
        throw new VoiceRoomsError(
          "Menciona un usuario o un rol.",
          400,
          "MISSING_TARGET",
        );
      }
      if (userId) await rejectTarget(channel, userId, false);
      if (roleId) await rejectTarget(channel, roleId, true);
      return "Rechazado.";
    }
    case "transfer": {
      const toId = input.targetUserId;
      if (!toId) {
        throw new VoiceRoomsError("Elige al nuevo dueño.", 400, "MISSING_TARGET");
      }
      if (toId === room.ownerId) {
        throw new VoiceRoomsError("Ya es el dueño.", 400, "ALREADY_OWNER");
      }
      if (!channel.members.has(toId)) {
        throw new VoiceRoomsError(
          "El nuevo dueño tiene que estar en la sala.",
          400,
          "NOT_IN_ROOM",
        );
      }
      const occupied = await getRoomByOwner(room.guildId, toId);
      if (occupied) {
        throw new VoiceRoomsError(
          "Esa persona ya tiene una sala.",
          400,
          "ALREADY_HAS_ROOM",
        );
      }
      await transferOwnerOverwrites(channel, room.ownerId, toId);
      await patchRoom(room.channelId, { ownerId: toId });
      return `Dueño: <@${toId}>.`;
    }
    case "invite": {
      const toId = input.targetUserId;
      if (!toId) {
        throw new VoiceRoomsError("Elige a quién invitar.", 400, "MISSING_TARGET");
      }
      const url = await createInviteUrl(channel);
      const note = input.inviteMessage?.trim();
      const body = note
        ? `${note}\n${url}`
        : `Te invitaron a una sala de voz: ${url}`;
      const user = await member.client.users.fetch(toId).catch(() => null);
      if (user) {
        const dm = await user.send(body).catch(() => null);
        if (dm) return `Invitación enviada a <@${toId}>.`;
      }
      return `No pude mandar DM. Enlace: ${url}`;
    }
    default:
      throw new VoiceRoomsError("Acción desconocida.", 400, "UNKNOWN_ACTION");
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
      "Entra a tu sala de voz primero.",
      400,
      "NOT_IN_VOICE",
    );
  }
  const room = await getRoomByChannel(voice.id);
  if (!room) {
    throw new VoiceRoomsError(
      "Esta no es una sala de Voice Rooms.",
      400,
      "NOT_A_ROOM",
    );
  }
  const generator = await getGeneratorById(room.generatorId, room.guildId);
  const channel = await fetchVoiceChannel(member.guild, room.channelId);
  if (!channel) {
    throw new VoiceRoomsError("La sala ya no existe.", 404, "ROOM_GONE");
  }
  return { room, generator, channel };
}

export const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const;
