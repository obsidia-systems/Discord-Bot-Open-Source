import {
  ChannelType,
  EmbedBuilder,
  type Client,
  type GuildMember,
  type Message,
  type OmitPartialGroupDMChannel,
  type VoiceState,
} from "discord.js";
import {
  addUserXp,
  getLevelsConfigCached,
  isUserXpFrozen,
  nextRewardAfter,
  randomTextXp,
  rewardAtLevel,
  rewardsBetweenLevels,
  scaleXpAmount,
} from "./service.js";
import { scheduleLiveLeaderboardRefresh } from "./liveLeaderboard.js";

/** Color fijo del anuncio de subida de nivel. */
const LEVEL_UP_EMBED_COLOR = 0x34e21d;

type GuildMessage = OmitPartialGroupDMChannel<Message<true>>;

const textCooldowns = new Map<string, number>();
const voiceSessions = new Map<
  string,
  {
    joinedAt: number;
    channelId: string;
    /** Ms sobrantes de un tramo anterior (< 1 min) para no perderlos al mutear. */
    carryMs: number;
  }
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

/** Mute/deaf propio, de servidor o suppress de escenario = no gana XP. */
function isVoiceInactive(state: VoiceState): boolean {
  return Boolean(
    state.selfMute ||
      state.selfDeaf ||
      state.serverMute ||
      state.serverDeaf ||
      state.suppress,
  );
}

function startVoiceSession(
  key: string,
  channelId: string,
  carryMs = 0,
): void {
  voiceSessions.set(key, {
    joinedAt: Date.now(),
    channelId,
    carryMs: Math.max(0, carryMs),
  });
}

async function applyLevelRewards(
  member: GuildMember,
  guildId: string,
  fromLevel: number,
  toLevel: number,
): Promise<void> {
  const rewards = rewardsBetweenLevels(guildId, fromLevel, toLevel);
  for (const reward of rewards) {
    if (member.roles.cache.has(reward.roleId)) continue;
    await member.roles
      .add(reward.roleId, `Rangos y XP — nivel ${reward.level}`)
      .catch(() => {});
  }
}

function buildLevelUpRewardsField(
  guildId: string,
  newLevel: number,
): string {
  const current = rewardAtLevel(guildId, newLevel);
  if (current) {
    return `🎉 Desbloqueaste el rol: <@&${current.roleId}>`;
  }
  const next = nextRewardAfter(guildId, newLevel);
  if (next) {
    return `🔒 Próxima recompensa: <@&${next.roleId}> al Nivel **${next.level}**.`;
  }
  return "🌟 ¡Has alcanzado el máximo nivel de recompensas!";
}

async function announceLevelUp(input: {
  client: Client;
  guildId: string;
  member: GuildMember;
  newLevel: number;
}): Promise<void> {
  const config = getLevelsConfigCached(input.guildId);
  if (!config.levelUpChannelId) return;

  const dedicated = await input.client.channels
    .fetch(config.levelUpChannelId)
    .catch(() => null);
  if (!dedicated?.isTextBased() || !("send" in dedicated)) return;

  const avatarUrl = input.member.user.displayAvatarURL({ size: 256 });
  const embed = new EmbedBuilder()
    .setColor(LEVEL_UP_EMBED_COLOR)
    .setTitle("¡Subida de Nivel!")
    .setThumbnail(avatarUrl)
    .setDescription(
      `¡Felicidades <@${input.member.id}>! Has alcanzado el **Nivel ${input.newLevel}**.`,
    )
    .addFields({
      name: "Recompensas",
      value: buildLevelUpRewardsField(input.guildId, input.newLevel),
    })
    .setTimestamp(new Date());

  await dedicated
    .send({
      embeds: [embed],
      allowedMentions: { users: [input.member.id], roles: [] },
    })
    .catch((error) => {
      console.warn("[adobos] levels: no se pudo anunciar level-up:", error);
    });
}

async function grantXpAndHandleLevelUp(input: {
  client: Client;
  guildId: string;
  member: GuildMember;
  amount: number;
}): Promise<void> {
  if (input.amount <= 0) return;
  if (isUserXpFrozen(input.guildId, input.member.id)) return;
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
    member: input.member,
    newLevel: result.newLevel,
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
    });
  } catch (error) {
    console.warn("[adobos] levels messageCreate falló:", error);
  }
}

/**
 * Cierra un tramo de voz activo y otorga XP acumulada.
 * - leave/switch: sale o cambia de canal.
 * - pause: mute/deaf — paga el intervalo activo (p. ej. 2 h) y no descarta
 *   por el mute actual del VoiceState (la sesión solo existía mientras activo).
 * Devuelve ms sobrantes (< 1 min) para reanudar sin perder fracciones.
 */
async function settleVoiceSession(
  client: Client,
  state: VoiceState,
  reason: "leave" | "switch" | "pause",
): Promise<number> {
  const guildId = state.guild.id;
  const userId = state.id;
  const key = voiceKey(guildId, userId);
  const session = voiceSessions.get(key);
  if (!session) return 0;
  voiceSessions.delete(key);

  const config = getLevelsConfigCached(guildId);
  if (!config.enabled || !config.voiceEnabled) return 0;

  const parentId = state.channel?.parentId ?? null;
  if (
    isChannelIgnored(
      config.ignoredChannels,
      session.channelId,
      parentId,
    )
  ) {
    return 0;
  }

  const member =
    state.member ??
    (await state.guild.members.fetch(userId).catch(() => null));
  if (!member || member.user.bot) return 0;
  if (memberHasIgnoredRole(member, config.ignoredRoles)) return 0;

  const elapsedMs = Date.now() - session.joinedAt + (session.carryMs || 0);
  const minutes = Math.floor(elapsedMs / 60_000);
  const remainderMs = elapsedMs % 60_000;

  if (minutes >= 1) {
    const amount = scaleXpAmount(
      config,
      minutes * config.voiceXpPerMinute,
      member.roles.cache.keys(),
    );
    if (amount > 0) {
      await grantXpAndHandleLevelUp({
        client,
        guildId,
        member,
        amount,
      });
    }
  }

  return reason === "pause" ? remainderMs : 0;
}

/** Resto <1 min guardado entre mute → unmute. */
const voicePauseCarryMs = new Map<string, number>();

export async function onLevelsVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  try {
    if (newState.member?.user.bot || oldState.member?.user.bot) return;

    const guildId = newState.guild.id;
    const config = getLevelsConfigCached(guildId);
    if (!config.enabled || !config.voiceEnabled) {
      if (oldState.channelId && !newState.channelId) {
        const key = voiceKey(guildId, newState.id);
        voiceSessions.delete(key);
        voicePauseCarryMs.delete(key);
      }
      return;
    }

    const key = voiceKey(guildId, newState.id);
    const joined = !oldState.channelId && Boolean(newState.channelId);
    const left = Boolean(oldState.channelId) && !newState.channelId;
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
      // Entra muteado: no abre sesión hasta desmutear.
      if (isVoiceInactive(newState)) return;
      startVoiceSession(key, newState.channelId);
      return;
    }

    if (left) {
      await settleVoiceSession(newState.client as Client, oldState, "leave");
      voicePauseCarryMs.delete(key);
      return;
    }

    if (switched) {
      await settleVoiceSession(newState.client as Client, oldState, "switch");
      voicePauseCarryMs.delete(key);
      if (newState.channelId && !isVoiceInactive(newState)) {
        startVoiceSession(key, newState.channelId);
      }
      return;
    }

    // Mismo canal: mute/deaf → liquidar XP del tramo; unmute → nuevo timestamp.
    if (oldState.channelId && newState.channelId) {
      const wasInactive = isVoiceInactive(oldState);
      const nowInactive = isVoiceInactive(newState);

      if (!wasInactive && nowInactive) {
        const remainder = await settleVoiceSession(
          newState.client as Client,
          oldState,
          "pause",
        );
        if (remainder > 0) voicePauseCarryMs.set(key, remainder);
        else voicePauseCarryMs.delete(key);
      } else if (wasInactive && !nowInactive) {
        const carry = voicePauseCarryMs.get(key) ?? 0;
        voicePauseCarryMs.delete(key);
        startVoiceSession(key, newState.channelId, carry);
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
