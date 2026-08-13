import {
  ChannelType,
  DiscordAPIError,
  type Client,
  type Guild,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import { and, desc, eq } from "drizzle-orm";
import type {
  ModActionRequest,
  ModActionResponse,
  ModActionType,
  ModActiveBansResponse,
  ModActiveTimeoutsResponse,
  ModChannelInfoResponse,
  ModChannelSearchResponse,
  ModMemberInfoResponse,
  ModMemberSearchResponse,
} from "@adobos/shared";
import { MOD_ACTION_TYPES } from "@adobos/shared";
import { getDb } from "../../db/client.js";
import { guildSettings, modLogs, warnings } from "../../db/schema.js";
import { getEmbedTemplate } from "../messages/templates/service.js";
import {
  applySanctionTextVars,
  buildEmbedFromPayload,
  createOneUseInvite,
  interpolateEmbedPayload,
  type SanctionDmContext,
} from "./dm.js";

export class ModerationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ModerationError";
  }
}

function resolveGuild(bot: Client, guildId?: string): Guild {
  if (!bot.isReady()) {
    throw new ModerationError(
      "El bot de Discord no está conectado.",
      503,
      "BOT_NOT_READY",
    );
  }

  const id = (guildId ?? process.env.DISCORD_GUILD_ID ?? "").trim();
  if (!id) {
    throw new ModerationError(
      "Falta DISCORD_GUILD_ID (o guildId).",
      400,
      "MISSING_GUILD_ID",
    );
  }

  const guild = bot.guilds.cache.get(id);
  if (!guild) {
    throw new ModerationError(
      "El bot no está en ese servidor.",
      404,
      "GUILD_NOT_FOUND",
    );
  }

  return guild;
}

function assertSnowflake(value: string, field: string): string {
  const trimmed = value.trim();
  if (!/^\d{17,20}$/.test(trimmed)) {
    throw new ModerationError(
      `${field} inválido.`,
      400,
      "INVALID_IDS",
    );
  }
  return trimmed;
}

function ensureGuildRow(guildId: string): void {
  const db = getDb();
  const existing = db
    .select()
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId))
    .get();
  if (!existing) {
    db.insert(guildSettings)
      .values({
        guildId,
        prefix: "!",
        welcomeEnabled: false,
        updatedAt: new Date(),
      })
      .run();
  }
}

function mapDiscordError(error: unknown): never {
  if (error instanceof ModerationError) throw error;

  if (error instanceof DiscordAPIError) {
    if (error.code === 50013 || error.status === 403) {
      throw new ModerationError(
        "Permisos insuficientes o jerarquía de roles: el bot no puede aplicar esta acción.",
        403,
        "MISSING_PERMISSIONS",
      );
    }
    if (error.code === 50035) {
      throw new ModerationError(
        "Parámetros inválidos para Discord.",
        400,
        "INVALID_DISCORD_PARAMS",
      );
    }
    throw new ModerationError(
      error.message || "Error de la API de Discord.",
      error.status && error.status >= 400 ? error.status : 502,
      "DISCORD_API_ERROR",
    );
  }

  if (error instanceof Error) {
    throw new ModerationError(error.message, 502, "ACTION_FAILED");
  }

  throw new ModerationError("Error desconocido.", 500, "INTERNAL_ERROR");
}

function memberHit(member: GuildMember) {
  return {
    id: member.id,
    username: member.user.username,
    globalName: member.user.globalName,
    displayName: member.displayName,
    avatarUrl: member.user.displayAvatarURL({ size: 64 }),
    bot: member.user.bot,
  };
}

/**
 * Ranking case-insensitive:
 * 0 = coincidencia exacta, 1 = empieza con, 2 = contiene, 99 = no match.
 */
function relevanceWeight(haystacks: string[], needle: string): number {
  const q = needle.toLowerCase();
  if (!q) return 99;
  let best = 99;
  for (const raw of haystacks) {
    const h = raw.trim().toLowerCase();
    if (!h) continue;
    if (h === q) best = Math.min(best, 0);
    else if (h.startsWith(q)) best = Math.min(best, 1);
    else if (h.includes(q)) best = Math.min(best, 2);
  }
  return best;
}

function memberSearchFields(member: GuildMember): string[] {
  return [
    member.user.username,
    member.displayName,
    member.user.globalName ?? "",
    member.id,
  ];
}

function rankMembersByQuery(
  members: GuildMember[],
  query: string,
): GuildMember[] {
  return members
    .map((member) => ({
      member,
      weight: relevanceWeight(memberSearchFields(member), query),
    }))
    .filter((row) => row.weight < 99)
    .sort((a, b) => {
      if (a.weight !== b.weight) return a.weight - b.weight;
      return a.member.displayName.localeCompare(b.member.displayName, "es", {
        sensitivity: "base",
      });
    })
    .map((row) => row.member);
}

async function ensureMembersCached(guild: Guild): Promise<void> {
  // Con Intent GuildMembers, fetch() sin args descarga el roster completo.
  await guild.members.fetch().catch(() => undefined);
}

export async function searchMembers(
  bot: Client,
  queryRaw: string,
  guildId?: string,
): Promise<ModMemberSearchResponse> {
  const guild = resolveGuild(bot, guildId);
  const q = queryRaw.trim();

  try {
    await ensureMembersCached(guild);

    if (q.length < 1) {
      const all = [...guild.members.cache.values()].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, "es", {
          sensitivity: "base",
        }),
      );
      return { members: all.map(memberHit) };
    }

    if (/^\d{17,20}$/.test(q)) {
      const member =
        guild.members.cache.get(q) ??
        (await guild.members.fetch(q).catch(() => null));
      return { members: member ? [memberHit(member)] : [] };
    }

    const ranked = rankMembersByQuery([...guild.members.cache.values()], q);
    return { members: ranked.map(memberHit) };
  } catch (error: unknown) {
    mapDiscordError(error);
  }
}

export async function searchChannels(
  bot: Client,
  queryRaw: string,
  guildId?: string,
): Promise<ModChannelSearchResponse> {
  const guild = resolveGuild(bot, guildId);
  const q = queryRaw.trim().toLowerCase();

  const channels = [...guild.channels.cache.values()]
    .filter(
      (channel) =>
        channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildAnnouncement,
    )
    .filter((channel) => {
      if (!q) return true;
      if (/^\d{17,20}$/.test(q)) return channel.id === q;
      return channel.name.toLowerCase().includes(q);
    })
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .slice(0, 20)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
    }));

  return { channels };
}

export async function getMemberInfo(
  bot: Client,
  userIdRaw: string,
  guildId?: string,
): Promise<ModMemberInfoResponse> {
  const guild = resolveGuild(bot, guildId);
  const userId = assertSnowflake(userIdRaw, "userId");

  const warningRows = () =>
    getDb()
      .select()
      .from(warnings)
      .where(
        and(eq(warnings.guildId, guild.id), eq(warnings.userId, userId)),
      )
      .orderBy(desc(warnings.createdAt))
      .all()
      .map((row) => ({
        id: row.id,
        reason: row.reason,
        moderatorId: row.moderatorId,
        createdAt:
          row.createdAt instanceof Date
            ? row.createdAt.toISOString()
            : new Date(row.createdAt).toISOString(),
      }));

  try {
    const member = await guild.members.fetch(userId);
    return {
      id: member.id,
      username: member.user.username,
      displayName: member.displayName,
      avatarUrl: member.user.displayAvatarURL({ size: 256 }),
      joinedAt: member.joinedAt?.toISOString() ?? null,
      roles: member.roles.cache
        .filter((role) => role.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((role) => ({
          id: role.id,
          name: role.name,
          color: role.hexColor === "#000000" ? null : role.hexColor,
        }))
        .slice(0, 12),
      warnings: warningRows(),
      timedOutUntil: member.communicationDisabledUntil?.toISOString() ?? null,
    };
  } catch (memberError: unknown) {
    // Usuario baneado / fuera del servidor: expediente mínimo vía User API.
    try {
      const user = await bot.users.fetch(userId);
      return {
        id: user.id,
        username: user.username,
        displayName: user.globalName || user.username,
        avatarUrl: user.displayAvatarURL({ size: 256 }),
        joinedAt: null,
        roles: [],
        warnings: warningRows(),
        timedOutUntil: null,
      };
    } catch {
      mapDiscordError(memberError);
    }
  }
}

export async function listActiveBans(
  bot: Client,
  guildId?: string,
): Promise<ModActiveBansResponse> {
  const guild = resolveGuild(bot, guildId);
  try {
    const bans = await guild.bans.fetch();
    const items = [...bans.values()]
      .map((ban) => ({
        id: ban.user.id,
        username: ban.user.username,
        displayName: ban.user.globalName || ban.user.username,
        avatarUrl: ban.user.displayAvatarURL({ size: 64 }),
        reason: ban.reason?.trim() || null,
      }))
      .sort((a, b) =>
        a.displayName.localeCompare(b.displayName, "es", {
          sensitivity: "base",
        }),
      );
    return { bans: items };
  } catch (error: unknown) {
    mapDiscordError(error);
  }
}

export async function listActiveTimeouts(
  bot: Client,
  guildId?: string,
): Promise<ModActiveTimeoutsResponse> {
  const guild = resolveGuild(bot, guildId);
  try {
    try {
      await guild.members.fetch();
    } catch {
      // Si el fetch masivo falla, usamos la caché disponible.
    }

    const now = Date.now();
    const timeouts = [...guild.members.cache.values()]
      .filter((member) => {
        const until = member.communicationDisabledUntilTimestamp;
        return typeof until === "number" && until > now;
      })
      .map((member) => {
        const until = member.communicationDisabledUntilTimestamp as number;
        return {
          id: member.id,
          username: member.user.username,
          displayName: member.displayName,
          avatarUrl: member.user.displayAvatarURL({ size: 64 }),
          timedOutUntil: new Date(until).toISOString(),
          remainingSeconds: Math.max(0, Math.ceil((until - now) / 1000)),
        };
      })
      .sort((a, b) => a.remainingSeconds - b.remainingSeconds);

    return { timeouts };
  } catch (error: unknown) {
    mapDiscordError(error);
  }
}

export async function getChannelInfo(
  bot: Client,
  channelIdRaw: string,
  guildId?: string,
): Promise<ModChannelInfoResponse> {
  const guild = resolveGuild(bot, guildId);
  const channelId = assertSnowflake(channelIdRaw, "channelId");

  try {
    const channel = await guild.channels.fetch(channelId);
    if (
      !channel ||
      (channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement)
    ) {
      throw new ModerationError(
        "Canal de texto no encontrado.",
        404,
        "CHANNEL_NOT_FOUND",
      );
    }

    const text = channel as TextChannel;
    return {
      id: text.id,
      name: text.name,
      type: text.type,
      slowmodeSeconds: text.rateLimitPerUser ?? 0,
      topic: text.topic,
      nsfw: text.nsfw,
    };
  } catch (error: unknown) {
    mapDiscordError(error);
  }
}

function assertAction(raw: string): ModActionType {
  if (MOD_ACTION_TYPES.includes(raw as ModActionType)) {
    return raw as ModActionType;
  }
  throw new ModerationError("Acción inválida.", 400, "INVALID_ACTION");
}

function writeModLog(input: {
  guildId: string;
  action: string;
  targetUserId?: string | null;
  targetChannelId?: string | null;
  moderatorId: string;
  reason: string;
  meta?: Record<string, unknown>;
}): void {
  getDb()
    .insert(modLogs)
    .values({
      guildId: input.guildId,
      action: input.action,
      targetUserId: input.targetUserId ?? null,
      targetChannelId: input.targetChannelId ?? null,
      moderatorId: input.moderatorId,
      reason: input.reason,
      meta: input.meta ? JSON.stringify(input.meta) : null,
      createdAt: new Date(),
    })
    .run();
}

async function sendSanctionDm(options: {
  bot: Client;
  guild: Guild;
  userId: string;
  action: ModActionType;
  reason: string;
  dmMode?: string;
  dmText?: string;
  templateId?: number;
}): Promise<{ dmSent: boolean; dmSkipped: boolean; dmFailed: boolean }> {
  const { bot, guild, userId, action, reason } = options;

  if (action === "unban") {
    return { dmSent: false, dmSkipped: true, dmFailed: false };
  }

  const dmMode = options.dmMode ?? "none";
  if (dmMode === "none" || (dmMode !== "text" && dmMode !== "template")) {
    return { dmSent: false, dmSkipped: true, dmFailed: false };
  }

  let inviteUrl: string | undefined;
  if (action === "kick") {
    inviteUrl = (await createOneUseInvite(guild)) ?? undefined;
  }

  const user = await bot.users.fetch(userId);
  const member = await guild.members.fetch(userId).catch(() => null);
  const vars: SanctionDmContext = {
    userMention: `<@${userId}>`,
    username: user.username,
    displayName: member?.displayName || user.globalName || user.username,
    serverName: guild.name,
    reason,
    moderator: bot.user?.username ?? "Adobos Bot",
    action,
    inviteUrl,
  };

  try {
    if (dmMode === "text") {
      let content = applySanctionTextVars(
        (options.dmText ?? "").trim() ||
          `Has recibido una sanción (${action}) en {server}.\nRazón: {reason}`,
        vars,
      );
      if (inviteUrl) {
        content = `${content}\n\nPuedes volver con esta invitación (1 uso): ${inviteUrl}`;
      }
      await user.send({ content: content.slice(0, 2000) });
      return { dmSent: true, dmSkipped: false, dmFailed: false };
    }

    // template
    const templateId = Number(options.templateId);
    if (!Number.isFinite(templateId)) {
      throw new ModerationError(
        "templateId inválido.",
        400,
        "INVALID_TEMPLATE",
      );
    }
    const template = getEmbedTemplate(templateId, guild.id);
    const interpolated = interpolateEmbedPayload(template.embedData, vars);
    const built = buildEmbedFromPayload(interpolated);
    let content = built.content
      ? applySanctionTextVars(built.content, vars)
      : undefined;
    if (inviteUrl) {
      content = content
        ? `${content}\n\nPuedes volver con esta invitación (1 uso): ${inviteUrl}`
        : `Puedes volver con esta invitación (1 uso): ${inviteUrl}`;
    }
    await user.send({
      content,
      embeds: built.builder ? [built.builder] : undefined,
      files: built.files.length > 0 ? built.files : undefined,
    });
    return { dmSent: true, dmSkipped: false, dmFailed: false };
  } catch (error: unknown) {
    if (error instanceof ModerationError) throw error;
    console.warn(
      "[adobos] DM de sanción no enviado:",
      error instanceof Error ? error.message : error,
    );
    return { dmSent: false, dmSkipped: false, dmFailed: true };
  }
}

export async function executeModAction(
  bot: Client,
  input: ModActionRequest,
): Promise<ModActionResponse> {
  const action = assertAction(input.action);
  const guild = resolveGuild(bot, input.guildId);
  const reason = (input.reason ?? "").trim();

  if (
    !reason &&
    action !== "purge" &&
    action !== "slowmode" &&
    action !== "unban" &&
    action !== "untimeout"
  ) {
    throw new ModerationError(
      "La razón es obligatoria.",
      400,
      "MISSING_REASON",
    );
  }

  const auditReason = reason.slice(0, 400) || "Acción desde panel Adobos";
  const moderatorId = bot.user?.id ?? "dashboard";

  try {
    ensureGuildRow(guild.id);

    const userActions = new Set([
      "warn",
      "kick",
      "timeout",
      "ban",
      "unban",
      "untimeout",
    ]);
    let dmResult = {
      dmSent: false,
      dmSkipped: true,
      dmFailed: false,
    };

    if (
      userActions.has(action) &&
      action !== "unban" &&
      action !== "untimeout"
    ) {
      const userId = assertSnowflake(input.userId ?? "", "userId");
      dmResult = await sendSanctionDm({
        bot,
        guild,
        userId,
        action,
        reason: auditReason,
        dmMode: input.dmMode,
        dmText: input.dmText,
        templateId: input.templateId,
      });
    }

    let message = "";
    let targetUserId: string | null = null;
    let targetChannelId: string | null = null;

    switch (action) {
      case "warn": {
        const userId = assertSnowflake(input.userId ?? "", "userId");
        targetUserId = userId;
        await guild.members.fetch(userId).catch(() => {
          throw new ModerationError(
            "Miembro no encontrado.",
            404,
            "MEMBER_NOT_FOUND",
          );
        });
        getDb()
          .insert(warnings)
          .values({
            guildId: guild.id,
            userId,
            moderatorId,
            reason: auditReason,
            createdAt: new Date(),
          })
          .run();
        message = `Advertencia registrada para <@${userId}>.`;
        break;
      }

      case "kick": {
        const userId = assertSnowflake(input.userId ?? "", "userId");
        targetUserId = userId;
        const member = await guild.members.fetch(userId);
        await member.kick(auditReason);
        message = `${member.user.username} fue expulsado.`;
        break;
      }

      case "ban": {
        const userId = assertSnowflake(input.userId ?? "", "userId");
        targetUserId = userId;
        const days = Math.max(
          0,
          Math.min(7, Math.round(Number(input.deleteMessageDays ?? 0))),
        );
        await guild.members.ban(userId, {
          reason: auditReason,
          deleteMessageSeconds: days * 24 * 60 * 60,
        });
        message = `Usuario ${userId} baneado.`;
        break;
      }

      case "unban": {
        const userId = assertSnowflake(input.userId ?? "", "userId");
        targetUserId = userId;
        await guild.members.unban(userId, auditReason);
        message = `Usuario ${userId} desbaneado.`;
        dmResult = { dmSent: false, dmSkipped: true, dmFailed: false };
        break;
      }

      case "timeout": {
        const userId = assertSnowflake(input.userId ?? "", "userId");
        targetUserId = userId;
        const seconds = Math.round(Number(input.durationSeconds ?? 0));
        if (![60, 300, 3600, 86400, 604800].includes(seconds)) {
          throw new ModerationError(
            "Duración de timeout inválida.",
            400,
            "INVALID_TIMEOUT",
          );
        }
        const member = await guild.members.fetch(userId);
        await member.timeout(seconds * 1000, auditReason);
        message = `${member.user.username} en timeout (${seconds}s).`;
        break;
      }

      case "untimeout": {
        const userId = assertSnowflake(input.userId ?? "", "userId");
        targetUserId = userId;
        const member = await guild.members.fetch(userId);
        await member.timeout(null, auditReason);
        message = `Timeout removido de ${member.user.username}.`;
        dmResult = { dmSent: false, dmSkipped: true, dmFailed: false };
        break;
      }

      case "purge": {
        const channelId = assertSnowflake(input.channelId ?? "", "channelId");
        targetChannelId = channelId;
        const limit = Math.max(
          1,
          Math.min(100, Math.round(Number(input.purgeLimit ?? 10))),
        );
        const channel = await guild.channels.fetch(channelId);
        if (!channel || !channel.isTextBased() || channel.isDMBased()) {
          throw new ModerationError(
            "Canal no válido para purge.",
            400,
            "CHANNEL_NOT_TEXT",
          );
        }
        if (!("bulkDelete" in channel)) {
          throw new ModerationError(
            "Este canal no admite bulk delete.",
            400,
            "CHANNEL_NOT_TEXT",
          );
        }
        const deleted = await channel.bulkDelete(limit, true);
        message = `Se eliminaron ${deleted.size} mensajes en #${"name" in channel ? channel.name : channelId}.`;
        break;
      }

      case "slowmode": {
        const channelId = assertSnowflake(input.channelId ?? "", "channelId");
        targetChannelId = channelId;
        const seconds = Math.max(
          0,
          Math.min(21600, Math.round(Number(input.slowmodeSeconds ?? 0))),
        );
        const channel = await guild.channels.fetch(channelId);
        if (
          !channel ||
          (channel.type !== ChannelType.GuildText &&
            channel.type !== ChannelType.GuildAnnouncement)
        ) {
          throw new ModerationError(
            "Canal de texto no encontrado.",
            404,
            "CHANNEL_NOT_FOUND",
          );
        }
        await (channel as TextChannel).setRateLimitPerUser(
          seconds,
          auditReason,
        );
        message =
          seconds === 0
            ? `Slowmode desactivado en #${channel.name}.`
            : `Slowmode de ${seconds}s en #${channel.name}.`;
        break;
      }

      default:
        throw new ModerationError("Acción no implementada.", 400, "INVALID_ACTION");
    }

    writeModLog({
      guildId: guild.id,
      action,
      targetUserId,
      targetChannelId,
      moderatorId,
      reason: auditReason,
      meta: {
        dmMode: input.dmMode ?? "none",
        dmSent: dmResult.dmSent,
        dmFailed: dmResult.dmFailed,
      },
    });

    if (dmResult.dmFailed) {
      message = `${message} Sanción aplicada, pero el usuario tenía los DMs cerrados.`;
    }

    return {
      ok: true,
      action,
      message,
      dmSent: dmResult.dmSent,
      dmSkipped: dmResult.dmSkipped,
      dmFailed: dmResult.dmFailed,
    };
  } catch (error: unknown) {
    mapDiscordError(error);
  }
}
