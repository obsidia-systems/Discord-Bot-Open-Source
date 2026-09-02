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
  applyLevelsTokens,
  buildLevelsTokenMap,
  embedColorToInt,
  levelsTemplatePingsUser,
} from "@adobos/shared";
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
import { BoundedTtlMap } from "../../core/cache/boundedTtlMap.js";
import { logger } from "../../core/log.js";

type GuildMessage = OmitPartialGroupDMChannel<Message<true>>;

const textCooldowns = new BoundedTtlMap<string, number>(50_000, 5 * 60_000);
const voiceSessions = new Map<
  string,
  {
    joinedAt: number;
    channelId: string;
    /** Si el usuario estaba transmitiendo pantalla en este tramo. */
    streaming: boolean;
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
  options: { streaming?: boolean; carryMs?: number } = {},
): void {
  voiceSessions.set(key, {
    joinedAt: Date.now(),
    channelId,
    streaming: Boolean(options.streaming),
    carryMs: Math.max(0, options.carryMs ?? 0),
  });
}

async function applyLevelRewards(
  member: GuildMember,
  guildId: string,
  fromLevel: number,
  toLevel: number,
): Promise<void> {
  const rewards = await rewardsBetweenLevels(guildId, fromLevel, toLevel);
  for (const reward of rewards) {
    if (member.roles.cache.has(reward.roleId)) continue;
    await member.roles
      .add(reward.roleId, `Levels — nivel ${reward.level}`)
      .catch(() => {});
  }
}

async function buildLevelUpRewardsField(
  guildId: string,
  newLevel: number,
): Promise<string> {
  const current = await rewardAtLevel(guildId, newLevel);
  if (current) {
    return `🎉 Desbloqueaste el rol: <@&${current.roleId}>`;
  }
  const next = await nextRewardAfter(guildId, newLevel);
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
  xp: number;
}): Promise<void> {
  const config = await getLevelsConfigCached(input.guildId);
  if (!config.levelUpChannelId) return;

  const dedicated = await input.client.channels
    .fetch(config.levelUpChannelId)
    .catch(() => null);
  if (!dedicated?.isTextBased() || !("send" in dedicated)) return;

  const tokens = buildLevelsTokenMap({
    userId: input.member.id,
    username: input.member.user.username,
    level: input.newLevel,
    serverName: input.member.guild.name,
    xp: input.xp,
  });
  const title = applyLevelsTokens(config.levelUpEmbedTitle, tokens).slice(
    0,
    256,
  );
  const description = applyLevelsTokens(config.levelUpMessage, tokens).slice(
    0,
    4096,
  );
  const pingBlob = `${config.levelUpEmbedTitle}\n${config.levelUpMessage}`;

  const embed = new EmbedBuilder()
    .setColor(embedColorToInt(config.levelUpEmbedColor, 0x34e21d))
    .setTitle(title || "¡Subida de Nivel!")
    .setDescription(description)
    .addFields({
      name: "Recompensas",
      value: await buildLevelUpRewardsField(input.guildId, input.newLevel),
    })
    .setTimestamp(new Date());
  if (config.levelUpShowThumbnail) {
    embed.setThumbnail(input.member.user.displayAvatarURL({ size: 256 }));
  }

  await dedicated
    .send({
      embeds: [embed],
      allowedMentions: {
        parse: [],
        users: levelsTemplatePingsUser(pingBlob) ? [input.member.id] : [],
        roles: [],
      },
    })
    .catch((error) => {
      logger.warn({ err: error }, "levels: no se pudo anunciar level-up:");
    });
}

/**
 * Tras un cambio de XP: refresca el live LB; si subió de nivel, roles + anuncio.
 */
export async function syncLevelsProgress(input: {
  client: Client;
  guildId: string;
  userId: string;
  previousLevel: number;
  newLevel: number;
  xp: number;
}): Promise<void> {
  await scheduleLiveLeaderboardRefresh(input.client, input.guildId);
  if (input.newLevel <= input.previousLevel) return;

  const guild =
    input.client.guilds.cache.get(input.guildId) ??
    (await input.client.guilds.fetch(input.guildId).catch(() => null));
  if (!guild) return;
  const member = await guild.members.fetch(input.userId).catch(() => null);
  if (!member) return;

  await applyLevelRewards(
    member,
    input.guildId,
    input.previousLevel,
    input.newLevel,
  );
  await announceLevelUp({
    client: input.client,
    guildId: input.guildId,
    member,
    newLevel: input.newLevel,
    xp: input.xp,
  });
}

async function grantXpAndHandleLevelUp(input: {
  client: Client;
  guildId: string;
  member: GuildMember;
  amount: number;
}): Promise<void> {
  if (input.amount <= 0) return;
  if (await isUserXpFrozen(input.guildId, input.member.id)) return;
  const result = await addUserXp(input.guildId, input.member.id, input.amount);
  await syncLevelsProgress({
    client: input.client,
    guildId: input.guildId,
    userId: input.member.id,
    previousLevel: result.previousLevel,
    newLevel: result.newLevel,
    xp: result.xp,
  });
}

export async function onLevelsMessageCreate(
  message: Message | GuildMessage,
): Promise<void> {
  try {
    if (!message.guild || message.author.bot) return;
    if (!message.channel.isTextBased()) return;

    const guildId = message.guild.id;
    const config = await getLevelsConfigCached(guildId);
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

    const amount = randomTextXp(
      config,
      member.roles.cache.keys(),
      message.channelId,
    );
    if (amount <= 0) return;

    textCooldowns.set(key, now);
    await grantXpAndHandleLevelUp({
      client: message.client as Client,
      guildId,
      member,
      amount,
    });
  } catch (error) {
    logger.warn({ err: error }, "levels messageCreate falló:");
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

  const config = await getLevelsConfigCached(guildId);
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
      {
        channelId: session.channelId,
        streaming: session.streaming,
      },
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
    const config = await getLevelsConfigCached(guildId);
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
      startVoiceSession(key, newState.channelId, {
        streaming: Boolean(newState.streaming),
      });
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
        startVoiceSession(key, newState.channelId, {
          streaming: Boolean(newState.streaming),
        });
      }
      return;
    }

    // Mismo canal: mute/deaf → liquidar XP del tramo; unmute → nuevo timestamp.
    // Cambio de stream → liquidar con el multiplicador anterior y reiniciar.
    if (oldState.channelId && newState.channelId) {
      const wasInactive = isVoiceInactive(oldState);
      const nowInactive = isVoiceInactive(newState);
      const streamToggled =
        Boolean(oldState.streaming) !== Boolean(newState.streaming);

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
        startVoiceSession(key, newState.channelId, {
          streaming: Boolean(newState.streaming),
          carryMs: carry,
        });
      } else if (!wasInactive && !nowInactive && streamToggled) {
        const remainder = await settleVoiceSession(
          newState.client as Client,
          oldState,
          "pause",
        );
        startVoiceSession(key, newState.channelId, {
          streaming: Boolean(newState.streaming),
          carryMs: remainder,
        });
      }
    }
  } catch (error) {
    logger.warn({ err: error }, "levels voiceStateUpdate falló:");
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
