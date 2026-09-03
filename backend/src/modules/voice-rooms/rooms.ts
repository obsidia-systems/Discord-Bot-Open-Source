import {
  applyVoiceRoomNameTemplate,
  clampVoiceBitrateKbps,
  clampVoiceUserLimit,
  VOICE_ROOM_SELECT_PREFIX,
  VOICE_ROOM_STATUS_MAX,
  type VoiceRoomAction,
  type VoiceRoomGenerator,
  type VoiceRoomLive,
} from "@adobos/shared";
import {
  ActionRowBuilder,
  ChannelType,
  type Client,
  type Guild,
  type GuildMember,
  OverwriteType,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  type VoiceChannel,
} from "discord.js";
import { logger } from "../../core/log.js";
import { VoiceRoomsError } from "./service.js";

const OWNER_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.Stream,
  PermissionFlagsBits.UseVAD,
];

function asVoice(channel: unknown): VoiceChannel | null {
  if (
    channel &&
    typeof channel === "object" &&
    "type" in channel &&
    (channel as { type: number }).type === ChannelType.GuildVoice
  ) {
    return channel as VoiceChannel;
  }
  return null;
}

export async function fetchVoiceChannel(
  guild: Guild,
  channelId: string,
): Promise<VoiceChannel | null> {
  const cached = guild.channels.cache.get(channelId);
  if (asVoice(cached)) return asVoice(cached);
  try {
    const fetched = await guild.channels.fetch(channelId);
    return asVoice(fetched);
  } catch {
    return null;
  }
}

export function isStaff(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.ManageChannels);
}

export function assertCanControl(
  member: GuildMember,
  room: VoiceRoomLive,
  action: VoiceRoomAction,
  allowed: Record<VoiceRoomAction, boolean>,
): void {
  if (!allowed[action] && !isStaff(member)) {
    throw new VoiceRoomsError(
      "Staff disabled that action.",
      403,
      "ACTION_DISABLED",
    );
  }
  if (action === "claim") return;
  if (member.id !== room.ownerId && !isStaff(member)) {
    throw new VoiceRoomsError(
      "Only the room owner can do that.",
      403,
      "NOT_OWNER",
    );
  }
}

function parentId(guild: Guild, generator: VoiceRoomGenerator): string | null {
  if (generator.categoryId) return generator.categoryId;
  const hub = guild.channels.cache.get(generator.hubChannelId);
  return hub && "parentId" in hub ? hub.parentId : null;
}

export async function createOwnedRoom(
  guild: Guild,
  member: GuildMember,
  generator: VoiceRoomGenerator,
): Promise<VoiceChannel> {
  const name = applyVoiceRoomNameTemplate(generator.nameTemplate, {
    displayName: member.displayName,
    username: member.user.username,
  });
  const bitrateKbps =
    generator.defaultBitrate > 0
      ? clampVoiceBitrateKbps(generator.defaultBitrate, guild.maximumBitrate)
      : null;
  const userLimit = clampVoiceUserLimit(generator.defaultUserLimit);
  const parent = parentId(guild, generator);
  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    parent: parent ?? undefined,
    userLimit,
    ...(bitrateKbps ? { bitrate: bitrateKbps * 1000 } : {}),
    permissionOverwrites: [
      {
        id: member.id,
        type: OverwriteType.Member,
        allow: OWNER_ALLOW,
      },
    ],
    reason: `Voice Rooms: ${member.user.tag}`,
  });
  return channel;
}

export async function moveToChannel(
  member: GuildMember,
  channel: VoiceChannel,
): Promise<void> {
  await member.voice.setChannel(channel, "Voice Rooms");
}

export async function destroyVoicePair(
  guild: Guild,
  room: VoiceRoomLive,
): Promise<void> {
  if (room.textChannelId) {
    const text = guild.channels.cache.get(room.textChannelId);
    if (text) {
      await text.delete("Voice Rooms: empty room").catch(() => null);
    }
  }
  const voice = await fetchVoiceChannel(guild, room.channelId);
  if (voice) {
    await voice.delete("Voice Rooms: empty room").catch(() => null);
  }
}

export async function applyLock(
  channel: VoiceChannel,
  locked: boolean,
): Promise<void> {
  await channel.permissionOverwrites.edit(
    channel.guild.roles.everyone,
    { Connect: locked ? false : null },
    { reason: locked ? "Voice Rooms: lock" : "Voice Rooms: unlock" },
  );
}

export async function applyGhost(
  channel: VoiceChannel,
  ghosted: boolean,
): Promise<void> {
  await channel.permissionOverwrites.edit(
    channel.guild.roles.everyone,
    { ViewChannel: ghosted ? false : null },
    { reason: ghosted ? "Voice Rooms: ghost" : "Voice Rooms: unghost" },
  );
}

export async function setRoomName(
  channel: VoiceChannel,
  name: string,
): Promise<void> {
  await channel.setName(name, "Voice Rooms: name");
}

export async function setRoomLimit(
  channel: VoiceChannel,
  limit: number,
): Promise<void> {
  await channel.setUserLimit(limit, "Voice Rooms: limit");
}

export async function setRoomBitrate(
  channel: VoiceChannel,
  kbps: number,
): Promise<void> {
  const clamped = clampVoiceBitrateKbps(kbps, channel.guild.maximumBitrate);
  await channel.setBitrate(clamped * 1000, "Voice Rooms: bitrate");
}

export async function setRoomStatus(
  channel: VoiceChannel,
  status: string,
): Promise<void> {
  const text = status.trim().slice(0, VOICE_ROOM_STATUS_MAX);
  const editable = channel as VoiceChannel & {
    setStatus?: (value: string | null, reason?: string) => Promise<unknown>;
  };
  if (typeof editable.setStatus === "function") {
    await editable.setStatus(text || null, "Voice Rooms: status");
    return;
  }
  await channel.edit({ status: text || null } as never);
}

export async function permitTarget(
  channel: VoiceChannel,
  targetId: string,
): Promise<void> {
  await channel.permissionOverwrites.edit(
    targetId,
    { ViewChannel: true, Connect: true },
    { reason: "Voice Rooms: permit" },
  );
}

export async function rejectTarget(
  channel: VoiceChannel,
  targetId: string,
  isRole: boolean,
): Promise<void> {
  await channel.permissionOverwrites.edit(
    targetId,
    { Connect: false, ViewChannel: false },
    { reason: "Voice Rooms: reject" },
  );
  for (const member of channel.members.values()) {
    const hit = isRole
      ? member.roles.cache.has(targetId)
      : member.id === targetId;
    if (hit) {
      await member.voice.disconnect("Voice Rooms: reject").catch(() => null);
    }
  }
}

export async function transferOwnerOverwrites(
  channel: VoiceChannel,
  fromId: string,
  toId: string,
): Promise<void> {
  await channel.permissionOverwrites.delete(fromId).catch(() => null);
  await channel.permissionOverwrites.edit(
    toId,
    {
      ViewChannel: true,
      Connect: true,
      Speak: true,
      Stream: true,
      UseVAD: true,
    },
    { reason: "Voice Rooms: transfer" },
  );
}

export async function ensureTextChannel(
  guild: Guild,
  voice: VoiceChannel,
  owner: GuildMember,
): Promise<string> {
  const text = await guild.channels.create({
    name: `${voice.name}-chat`.slice(0, 100),
    type: ChannelType.GuildText,
    parent: voice.parentId ?? undefined,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: owner.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ],
    reason: "Voice Rooms: texto ligado",
  });
  for (const member of voice.members.values()) {
    if (member.id === owner.id) continue;
    await text.permissionOverwrites
      .edit(member.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      })
      .catch(() => null);
  }
  await postControlMessage(text.id, guild.client, voice.id);
  return text.id;
}

export async function syncTextMembership(
  guild: Guild,
  room: VoiceRoomLive,
  memberId: string,
  joining: boolean,
): Promise<void> {
  if (!room.textChannelId) return;
  const channel = guild.channels.cache.get(room.textChannelId);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
  if (!("permissionOverwrites" in channel)) return;
  if (joining) {
    await channel.permissionOverwrites
      .edit(memberId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      })
      .catch(() => null);
  } else if (memberId !== room.ownerId) {
    await channel.permissionOverwrites.delete(memberId).catch(() => null);
  }
}

export async function createInviteUrl(channel: VoiceChannel): Promise<string> {
  const invite = await channel.createInvite({
    maxAge: 3600,
    maxUses: 1,
    unique: true,
    reason: "Voice Rooms: invite",
  });
  return invite.url;
}

export function buildControlSelect(
  voiceChannelId: string,
): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${VOICE_ROOM_SELECT_PREFIX}${voiceChannelId}`)
      .setPlaceholder("Manage the room")
      .addOptions(
        { label: "Lock", value: "lock", description: "Close to new people" },
        { label: "Unlock", value: "unlock", description: "Open the room" },
        { label: "Ghost", value: "ghost", description: "Hide from the list" },
        { label: "Unghost", value: "unghost", description: "Show again" },
        { label: "Claim", value: "claim", description: "Take ownership" },
      ),
  );
}

async function postControlMessage(
  textChannelId: string,
  bot: Client,
  voiceChannelId: string,
): Promise<void> {
  try {
    const channel = await bot.channels.fetch(textChannelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
    if (!("send" in channel)) return;
    await channel.send({
      content: "You own this room. Use `/voice` or the menu to manage it.",
      components: [buildControlSelect(voiceChannelId)],
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "Voice Rooms: couldn't publish the menu");
  }
}
