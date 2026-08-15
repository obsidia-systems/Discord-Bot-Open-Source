import {
  AttachmentBuilder,
  ChannelType,
  EmbedBuilder,
  type Client,
  type GuildMember,
  type Message,
  type OmitPartialGroupDMChannel,
  type TextBasedChannel,
  type VoiceState,
} from "discord.js";
import path from "node:path";
import { DEFAULT_LEVEL_UP_MESSAGE } from "@adobos/shared";
import { resolvePublicUploadPath } from "../../lib/dataPaths.js";
import {
  addUserXp,
  getLevelsConfigCached,
  randomTextXp,
  rewardsBetweenLevels,
  scaleXpAmount,
} from "./service.js";
import { scheduleLiveLeaderboardRefresh } from "./liveLeaderboard.js";

type GuildMessage = OmitPartialGroupDMChannel<Message<true>>;

const textCooldowns = new Map<string, number>();
const voiceSessions = new Map<
  string,
  { joinedAt: number; channelId: string }
>();

function voiceKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function isChannelIgnored(
  ignored: string[],
  channelId: string | null,
  parentId: string | null,
): boolean {
  if (channelId && ignored.includes(channelId)) return true;
  if (parentId && ignored.includes(parentId)) return true;
  return false;
}

function memberHasIgnoredRole(
  member: GuildMember,
  ignoredRoles: string[],
): boolean {
  if (ignoredRoles.length === 0) return false;
  return member.roles.cache.some((role) => ignoredRoles.includes(role.id));
}

function isVoiceInactive(state: VoiceState): boolean {
  return Boolean(
    state.selfMute ||
      state.selfDeaf ||
      state.serverMute ||
      state.serverDeaf ||
      state.suppress,
  );
}

async function applyLevelRewards(
  member: GuildMember,
  guildId: string,
  fromLevel: number,
  toLevel: number,
): Promise<string[]> {
  const rewards = rewardsBetweenLevels(guildId, fromLevel, toLevel);
  const granted: string[] = [];
  for (const reward of rewards) {
    if (member.roles.cache.has(reward.roleId)) {
      granted.push(reward.roleId);
      continue;
    }
    try {
      await member.roles.add(reward.roleId, `Rangos y XP — nivel ${reward.level}`);
      granted.push(reward.roleId);
    } catch (error) {
      console.warn(
        `[adobos] levels: no se pudo otorgar rol ${reward.roleId} (nivel ${reward.level}):`,
        error,
      );
    }
  }
  return granted;
}

function applyLevelUpTemplate(
  template: string,
  vars: { user: string; username: string; level: number; server: string },
): string {
  return (template || DEFAULT_LEVEL_UP_MESSAGE)
    .replaceAll("{user}", vars.user)
    .replaceAll("{username}", vars.username)
    .replaceAll("{level}", String(vars.level))
    .replaceAll("{server}", vars.server);
}

async function announceLevelUp(input: {
  client: Client;
  guildId: string;
  userId: string;
  username: string;
  newLevel: number;
  preferredChannel: TextBasedChannel | null;
}): Promise<void> {
  const config = getLevelsConfigCached(input.guildId);
  let channel: TextBasedChannel | null = input.preferredChannel;

  if (config.levelUpChannelId) {
    const dedicated = await input.client.channels
      .fetch(config.levelUpChannelId)
      .catch(() => null);
    if (dedicated?.isTextBased()) channel = dedicated;
  }

  if (!channel || !("send" in channel)) return;

  const guildName =
    input.client.guilds.cache.get(input.guildId)?.name ?? "el servidor";
  const content = applyLevelUpTemplate(config.levelUpMessage, {
    user: `<@${input.userId}>`,
    username: input.username,
    level: input.newLevel,
    server: guildName,
  });

  const format = config.levelUpFormat;

  try {
    if (format === "EMBED") {
      const embed = new EmbedBuilder()
        .setColor(0xe11d48)
        .setDescription(content)
        .setTimestamp(new Date());
      await channel.send({
        embeds: [embed],
        allowedMentions: { users: [input.userId] },
      });
      return;
    }

    if (format === "IMAGE" && config.levelUpImage) {
      const imagePath = config.levelUpImage.trim();
      const local = resolvePublicUploadPath(imagePath);
      if (local) {
        const file = new AttachmentBuilder(local, {
          name: path.basename(local),
        });
        const embed = new EmbedBuilder()
          .setColor(0xe11d48)
          .setDescription(content)
          .setImage(`attachment://${path.basename(local)}`)
          .setTimestamp(new Date());
        await channel.send({
          embeds: [embed],
          files: [file],
          allowedMentions: { users: [input.userId] },
        });
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(0xe11d48)
        .setDescription(content)
        .setImage(imagePath)
        .setTimestamp(new Date());
      await channel.send({
        embeds: [embed],
        allowedMentions: { users: [input.userId] },
      });
      return;
    }

    await channel.send({
      content,
      allowedMentions: { users: [input.userId] },
    });
  } catch (error) {
    console.warn("[adobos] levels: no se pudo anunciar level-up:", error);
  }
}

async function grantXpAndHandleLevelUp(input: {
  client: Client;
  guildId: string;
  member: GuildMember;
  amount: number;
  preferredChannel: TextBasedChannel | null;
}): Promise<void> {
  if (input.amount <= 0) return;
  const result = addUserXp(input.guildId, input.member.id, input.amount);

  scheduleLiveLeaderboardRefresh(input.client, input.guildId);

  if (!result.leveledUp) return;

  await applyLevelRewards(
    input.member,
    input.guildId,
    result.previousLevel,
    result.newLevel,
  );
  await announceLevelUp({
    client: input.client,
    guildId: input.guildId,
    userId: input.member.id,
    username: input.member.user.username,
    newLevel: result.newLevel,
    preferredChannel: input.preferredChannel,
  });
}

export async function onLevelsMessageCreate(
  message: Message | GuildMessage,
): Promise<void> {
  try {
    if (!message.guild || message.author.bot) return;
    if (!message.channel.isTextBased()) return;

    const guildId = message.guild.id;
    const config = getLevelsConfigCached(guildId);
    if (!config.enabled) return;

    const parentId =
      message.channel && "parentId" in message.channel
        ? message.channel.parentId
        : null;
    if (
      isChannelIgnored(
        config.ignoredChannels,
        message.channelId,
        parentId ?? null,
      )
    ) {
      return;
    }

    const member =
      message.member ??
      (await message.guild.members.fetch(message.author.id).catch(() => null));
    if (!member) return;
    if (memberHasIgnoredRole(member, config.ignoredRoles)) return;

    const key = voiceKey(guildId, message.author.id);
    const now = Date.now();
    const last = textCooldowns.get(key) ?? 0;
    if (now - last < config.cooldownSeconds * 1000) return;

    const amount = randomTextXp(config, member.roles.cache.keys());
    if (amount <= 0) return;

    textCooldowns.set(key, now);
    await grantXpAndHandleLevelUp({
      client: message.client as Client,
      guildId,
      member,
      amount,
      preferredChannel: message.channel,
    });
  } catch (error) {
    console.warn("[adobos] levels messageCreate falló:", error);
  }
}

async function settleVoiceSession(
  client: Client,
  state: VoiceState,
  reason: "leave" | "switch",
): Promise<void> {
  const guildId = state.guild.id;
  const userId = state.id;
  const key = voiceKey(guildId, userId);
  const session = voiceSessions.get(key);
  if (!session) return;
  voiceSessions.delete(key);

  const config = getLevelsConfigCached(guildId);
  if (!config.enabled || !config.voiceEnabled) return;
  if (isVoiceInactive(state)) return;

  const parentId = state.channel?.parentId ?? null;
  if (
    isChannelIgnored(
      config.ignoredChannels,
      session.channelId,
      parentId,
    )
  ) {
    return;
  }

  const member =
    state.member ??
    (await state.guild.members.fetch(userId).catch(() => null));
  if (!member || member.user.bot) return;
  if (memberHasIgnoredRole(member, config.ignoredRoles)) return;

  const elapsedMs = Date.now() - session.joinedAt;
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return;

  const amount = scaleXpAmount(
    config,
    minutes * config.voiceXpPerMinute,
    member.roles.cache.keys(),
  );
  if (amount <= 0) return;

  let preferred: TextBasedChannel | null = null;
  if (config.levelUpChannelId) {
    const ch = await client.channels.fetch(config.levelUpChannelId).catch(() => null);
    if (ch?.isTextBased()) preferred = ch;
  }

  await grantXpAndHandleLevelUp({
    client,
    guildId,
    member,
    amount,
    preferredChannel: preferred,
  });

  void reason;
}

export async function onLevelsVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  try {
    if (newState.member?.user.bot || oldState.member?.user.bot) return;

    const guildId = newState.guild.id;
    const config = getLevelsConfigCached(guildId);
    if (!config.enabled || !config.voiceEnabled) {
      // Limpiar sesión si el módulo se desactiva a mitad.
      if (oldState.channelId && !newState.channelId) {
        voiceSessions.delete(voiceKey(guildId, newState.id));
      }
      return;
    }

    const key = voiceKey(guildId, newState.id);
    const joined =
      !oldState.channelId && Boolean(newState.channelId);
    const left =
      Boolean(oldState.channelId) && !newState.channelId;
    const switched =
      Boolean(oldState.channelId) &&
      Boolean(newState.channelId) &&
      oldState.channelId !== newState.channelId;

    if (joined && newState.channelId) {
      if (
        newState.channel?.type === ChannelType.GuildStageVoice &&
        newState.suppress
      ) {
        return;
      }
      if (isVoiceInactive(newState)) return;
      voiceSessions.set(key, {
        joinedAt: Date.now(),
        channelId: newState.channelId,
      });
      return;
    }

    if (left) {
      await settleVoiceSession(newState.client as Client, oldState, "leave");
      return;
    }

    if (switched) {
      await settleVoiceSession(newState.client as Client, oldState, "switch");
      if (newState.channelId && !isVoiceInactive(newState)) {
        voiceSessions.set(key, {
          joinedAt: Date.now(),
          channelId: newState.channelId,
        });
      }
      return;
    }

    // Mute/deafen mid-session: pausar (cerrar) o reanudar.
    if (oldState.channelId && newState.channelId) {
      const wasInactive = isVoiceInactive(oldState);
      const nowInactive = isVoiceInactive(newState);
      if (!wasInactive && nowInactive) {
        await settleVoiceSession(newState.client as Client, oldState, "leave");
      } else if (wasInactive && !nowInactive && newState.channelId) {
        voiceSessions.set(key, {
          joinedAt: Date.now(),
          channelId: newState.channelId,
        });
      }
    }
  } catch (error) {
    console.warn("[adobos] levels voiceStateUpdate falló:", error);
  }
}

export function registerLevelsListeners(ctx: {
  on: <K extends keyof import("discord.js").ClientEvents>(
    event: K,
    handler: (...args: import("discord.js").ClientEvents[K]) => void,
  ) => void;
}): void {
  ctx.on("messageCreate", (message) => {
    void onLevelsMessageCreate(message);
  });
  ctx.on("voiceStateUpdate", (oldState, newState) => {
    void onLevelsVoiceStateUpdate(oldState, newState);
  });
}
