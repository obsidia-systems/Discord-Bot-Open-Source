import { randomUUID } from "node:crypto";
import {
  ChannelType,
  EmbedBuilder,
  type Client,
  type Guild,
} from "discord.js";
import { and, desc, eq, gte, lt, lte, or, sql, like } from "drizzle-orm";
import type {
  ActionLogCategory,
  ActionLogChannelsMapping,
  ActionLogEnabledEvents,
  ActionLogEntry,
  ActionLogEventKey,
  ActionLogEventType,
  ActionLogRetentionDays,
  ActionLogsConfig,
  ActionLogsHistoryQuery,
  ActionLogsHistoryResponse,
  ActionLogsTestResponse,
  UpdateActionLogsConfigRequest,
} from "@adobos/shared";
import {
  defaultActionLogChannelsMapping,
  defaultActionLogEnabledEvents,
  normalizeChannelsMapping,
  normalizeRetentionDays,
  normalizeRoutingMode,
  type ActionLogEmbedTone,
} from "@adobos/shared";
import { getDb } from "../../db/client.js";
import {
  actionLogs,
  actionLogsConfig,
  guildSettings,
} from "../../db/schema.js";
import { buildActionLogEmbed } from "./embeds.js";
import { sendActionLogWebhook } from "./webhooks.js";

export class ActionLogsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ActionLogsError";
  }
}

const CATEGORY_ROUTE_KEY: Record<
  ActionLogCategory,
  keyof ActionLogChannelsMapping
> = {
  MESSAGES: "messages",
  MEMBERS: "members",
  ROLES: "roles",
  CHANNELS: "channels",
  ASSETS: "assets",
  VOICE: "voice",
  INVITES: "channels",
};

const EVENT_META: Record<
  ActionLogEventKey,
  {
    eventType: ActionLogEventType;
    category: ActionLogCategory;
    label: string;
    tone: ActionLogEmbedTone;
    emoji: string;
  }
> = {
  messageDelete: { eventType: "MESSAGE_DELETE", category: "MESSAGES", label: "Mensaje eliminado", tone: "red", emoji: "🗑️" },
  messageUpdate: { eventType: "MESSAGE_UPDATE", category: "MESSAGES", label: "Mensaje editado", tone: "yellow", emoji: "✏️" },
  messageAttachmentDelete: { eventType: "MESSAGE_ATTACHMENT_DELETE", category: "MESSAGES", label: "Adjunto eliminado", tone: "red", emoji: "🖼️" },
  memberJoin: { eventType: "MEMBER_JOIN", category: "MEMBERS", label: "Miembro se une", tone: "green", emoji: "📥" },
  memberLeave: { eventType: "MEMBER_LEAVE", category: "MEMBERS", label: "Miembro sale", tone: "yellow", emoji: "🚪" },
  memberRoleUpdate: { eventType: "MEMBER_ROLE_UPDATE", category: "MEMBERS", label: "Roles actualizados", tone: "blue", emoji: "🎭" },
  memberNicknameUpdate: { eventType: "MEMBER_NICKNAME_UPDATE", category: "MEMBERS", label: "Apodo cambiado", tone: "yellow", emoji: "🏷️" },
  memberBan: { eventType: "MEMBER_BAN", category: "MEMBERS", label: "Miembro baneado", tone: "red", emoji: "🔨" },
  memberUnban: { eventType: "MEMBER_UNBAN", category: "MEMBERS", label: "Miembro desbaneado", tone: "green", emoji: "🔓" },
  roleCreate: { eventType: "ROLE_CREATE", category: "ROLES", label: "Rol creado", tone: "green", emoji: "✨" },
  roleDelete: { eventType: "ROLE_DELETE", category: "ROLES", label: "Rol eliminado", tone: "red", emoji: "🗑️" },
  roleUpdate: { eventType: "ROLE_UPDATE", category: "ROLES", label: "Rol actualizado", tone: "yellow", emoji: "🔧" },
  channelCreate: { eventType: "CHANNEL_CREATE", category: "CHANNELS", label: "Canal creado", tone: "green", emoji: "📁" },
  channelDelete: { eventType: "CHANNEL_DELETE", category: "CHANNELS", label: "Canal eliminado", tone: "red", emoji: "📁" },
  channelUpdate: { eventType: "CHANNEL_UPDATE", category: "CHANNELS", label: "Canal actualizado", tone: "yellow", emoji: "🔧" },
  emojiCreate: { eventType: "EMOJI_CREATE", category: "ASSETS", label: "Emoji creado", tone: "green", emoji: "😀" },
  emojiDelete: { eventType: "EMOJI_DELETE", category: "ASSETS", label: "Emoji eliminado", tone: "red", emoji: "😀" },
  emojiUpdate: { eventType: "EMOJI_UPDATE", category: "ASSETS", label: "Emoji actualizado", tone: "yellow", emoji: "😀" },
  stickerCreate: { eventType: "STICKER_CREATE", category: "ASSETS", label: "Sticker creado", tone: "green", emoji: "🏷️" },
  stickerDelete: { eventType: "STICKER_DELETE", category: "ASSETS", label: "Sticker eliminado", tone: "red", emoji: "🏷️" },
  stickerUpdate: { eventType: "STICKER_UPDATE", category: "ASSETS", label: "Sticker actualizado", tone: "yellow", emoji: "🏷️" },
  soundboardCreate: { eventType: "SOUNDBOARD_CREATE", category: "ASSETS", label: "Sonido creado", tone: "green", emoji: "🔊" },
  soundboardDelete: { eventType: "SOUNDBOARD_DELETE", category: "ASSETS", label: "Sonido eliminado", tone: "red", emoji: "🔊" },
  soundboardUpdate: { eventType: "SOUNDBOARD_UPDATE", category: "ASSETS", label: "Sonido actualizado", tone: "yellow", emoji: "🔊" },
  voiceJoin: { eventType: "VOICE_JOIN", category: "VOICE", label: "Entrada a voz", tone: "green", emoji: "🔊" },
  voiceLeave: { eventType: "VOICE_LEAVE", category: "VOICE", label: "Salida de voz", tone: "blue", emoji: "🚪" },
  voiceKick: { eventType: "VOICE_KICK", category: "VOICE", label: "Kick de voz", tone: "red", emoji: "👢" },
  voiceMove: { eventType: "VOICE_MOVE", category: "VOICE", label: "Movimiento de voz", tone: "blue", emoji: "🔀" },
  inviteCreate: { eventType: "INVITE_CREATE", category: "INVITES", label: "Invitación creada", tone: "green", emoji: "🔗" },
  inviteDelete: { eventType: "INVITE_DELETE", category: "INVITES", label: "Invitación eliminada", tone: "red", emoji: "⛓️" },
};

export function getEventMeta(eventKey: ActionLogEventKey) {
  return EVENT_META[eventKey];
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
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

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? process.env.DISCORD_GUILD_ID ?? "").trim();
  if (!id) {
    throw new ActionLogsError(
      "Falta DISCORD_GUILD_ID (o guildId).",
      400,
      "MISSING_GUILD_ID",
    );
  }
  return id;
}

function resolveGuild(bot: Client, guildId?: string): Guild {
  if (!bot.isReady()) {
    throw new ActionLogsError(
      "El bot de Discord no está conectado.",
      503,
      "BOT_NOT_READY",
    );
  }
  const id = resolveGuildId(guildId);
  const guild = bot.guilds.cache.get(id);
  if (!guild) {
    throw new ActionLogsError(
      "El bot no está en ese servidor.",
      404,
      "GUILD_NOT_FOUND",
    );
  }
  return guild;
}

function mergeEnabledEvents(
  partial?: Partial<ActionLogEnabledEvents> | null,
): ActionLogEnabledEvents {
  return {
    ...defaultActionLogEnabledEvents(),
    ...(partial ?? {}),
  };
}

function mergeChannelsMapping(
  partial?: Partial<ActionLogChannelsMapping> | null,
): ActionLogChannelsMapping {
  return normalizeChannelsMapping(partial);
}

function rowToConfig(
  guildId: string,
  row: typeof actionLogsConfig.$inferSelect | undefined,
): ActionLogsConfig {
  if (!row) {
    return {
      guildId,
      enabled: false,
      routingMode: "SIMPLE",
      globalChannelId: null,
      channelsMapping: defaultActionLogChannelsMapping(),
      ignoredChannels: [],
      ignoredRoles: [],
      ignoreBots: true,
      enabledEvents: defaultActionLogEnabledEvents(),
      dataRetentionDays: 14,
      updatedAt: new Date().toISOString(),
    };
  }

  const mapping = mergeChannelsMapping(
    parseJson<Partial<ActionLogChannelsMapping>>(row.channelsMapping, {}),
  );
  const enabledEvents = mergeEnabledEvents(
    parseJson<Partial<ActionLogEnabledEvents>>(row.enabledEvents, {}),
  );

  return {
    guildId: row.guildId,
    enabled: Boolean(row.enabled),
    routingMode: normalizeRoutingMode(row.routingMode),
    globalChannelId: row.globalChannelId,
    channelsMapping: mapping,
    ignoredChannels: parseJson<string[]>(row.ignoredChannels, []),
    ignoredRoles: parseJson<string[]>(row.ignoredRoles, []),
    ignoreBots: Boolean(row.ignoreBots),
    enabledEvents,
    dataRetentionDays: normalizeRetentionDays(row.dataRetentionDays),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function getActionLogsConfig(guildId?: string): ActionLogsConfig {
  const id = resolveGuildId(guildId);
  const row = getDb()
    .select()
    .from(actionLogsConfig)
    .where(eq(actionLogsConfig.guildId, id))
    .get();
  return rowToConfig(id, row);
}

export function updateActionLogsConfig(
  input: UpdateActionLogsConfigRequest,
  guildId?: string,
): ActionLogsConfig {
  const id = resolveGuildId(guildId);
  ensureGuildRow(id);

  const current = getActionLogsConfig(id);
  const mappingPatch = {
    ...current.channelsMapping,
    ...(input.channelsMapping ?? {}),
    ...(input.channelsMap ?? {}),
  };
  const next: ActionLogsConfig = {
    ...current,
    enabled: input.enabled ?? current.enabled,
    routingMode: normalizeRoutingMode(
      input.routingMode ?? current.routingMode,
    ),
    globalChannelId:
      input.globalChannelId === undefined
        ? current.globalChannelId
        : input.globalChannelId,
    channelsMapping: mergeChannelsMapping(mappingPatch),
    ignoredChannels: input.ignoredChannels ?? current.ignoredChannels,
    ignoredRoles: input.ignoredRoles ?? current.ignoredRoles,
    ignoreBots: input.ignoreBots ?? current.ignoreBots,
    enabledEvents: mergeEnabledEvents({
      ...current.enabledEvents,
      ...(input.enabledEvents ?? {}),
    }),
    dataRetentionDays: normalizeRetentionDays(
      input.dataRetentionDays ?? current.dataRetentionDays,
    ),
    updatedAt: new Date().toISOString(),
  };

  if (next.routingMode !== "SIMPLE" && next.routingMode !== "ADVANCED") {
    throw new ActionLogsError(
      "routingMode inválido (SIMPLE | ADVANCED).",
      400,
      "INVALID_ROUTING_MODE",
    );
  }

  const now = new Date();
  getDb()
    .insert(actionLogsConfig)
    .values({
      guildId: id,
      enabled: next.enabled,
      routingMode: next.routingMode,
      globalChannelId: next.globalChannelId,
      channelsMapping: JSON.stringify(next.channelsMapping),
      ignoredChannels: JSON.stringify(next.ignoredChannels),
      ignoredRoles: JSON.stringify(next.ignoredRoles),
      ignoreBots: next.ignoreBots,
      enabledEvents: JSON.stringify(next.enabledEvents),
      dataRetentionDays: next.dataRetentionDays,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: actionLogsConfig.guildId,
      set: {
        enabled: next.enabled,
        routingMode: next.routingMode,
        globalChannelId: next.globalChannelId,
        channelsMapping: JSON.stringify(next.channelsMapping),
        ignoredChannels: JSON.stringify(next.ignoredChannels),
        ignoredRoles: JSON.stringify(next.ignoredRoles),
        ignoreBots: next.ignoreBots,
        enabledEvents: JSON.stringify(next.enabledEvents),
        dataRetentionDays: next.dataRetentionDays,
        updatedAt: now,
      },
    })
    .run();

  // Compat: sincroniza log_channel_id legacy con el canal global.
  if (next.globalChannelId) {
    getDb()
      .update(guildSettings)
      .set({
        logChannelId: next.globalChannelId,
        updatedAt: now,
      })
      .where(eq(guildSettings.guildId, id))
      .run();
  }

  return getActionLogsConfig(id);
}

export function resolveLogChannelId(
  config: ActionLogsConfig,
  category: ActionLogCategory,
): string | null {
  if (config.routingMode === "ADVANCED") {
    const key = CATEGORY_ROUTE_KEY[category];
    const mapped = config.channelsMapping[key];
    if (typeof mapped === "string" && mapped) return mapped;
  }
  return config.globalChannelId;
}

/** Chequeo barato para abortar listeners antes de audit/CPU. */
export function passesActionLogFilters(
  guildId: string,
  eventKey: ActionLogEventKey,
  ctx: {
    channelId?: string | null;
    /** parentId del canal (categoría) — si está en ignoredChannels, se aborta. */
    parentId?: string | null;
    actorIsBot?: boolean;
    actorRoleIds?: string[];
  } = {},
): boolean {
  const config = getActionLogsConfig(guildId);
  if (!config.enabled) return false;
  if (config.ignoreBots && ctx.actorIsBot) return false;
  if (isChannelIgnored(config.ignoredChannels, ctx.channelId, ctx.parentId)) {
    return false;
  }
  if (
    ctx.actorRoleIds?.length &&
    ctx.actorRoleIds.some((roleId) => config.ignoredRoles.includes(roleId))
  ) {
    return false;
  }
  if (!config.enabledEvents[eventKey]) return false;
  return true;
}

function isChannelIgnored(
  ignored: string[],
  channelId?: string | null,
  parentId?: string | null,
): boolean {
  if (!ignored.length) return false;
  if (channelId && ignored.includes(channelId)) return true;
  if (parentId && ignored.includes(parentId)) return true;
  return false;
}

export interface RecordActionLogInput {
  guildId: string;
  eventKey: ActionLogEventKey;
  executorId?: string | null;
  executorTag?: string | null;
  /** Avatar del ejecutor para el webhook (username + avatarURL). */
  executorAvatarURL?: string | null;
  targetId?: string | null;
  targetTag?: string | null;
  channelId?: string | null;
  parentId?: string | null;
  summary: string;
  /** Descripción markdown del embed Discord (negritas + menciones). */
  description?: string;
  details?: Record<string, unknown>;
  /** Si true, el actor es un bot. */
  actorIsBot?: boolean;
  /** Roles del ejecutor o del miembro involucrado para filtros. */
  actorRoleIds?: string[];
  /** Override del tono Enterprise (red/yellow/green/blue). */
  tone?: ActionLogEmbedTone;
  /** Ejecutor desconocido (Author = autor original / afectado). */
  executorUnknown?: boolean;
}

/**
 * Pipeline de filtros (temprano) + insert SQLite + embed Discord vía webhook.
 * Retorna null si se aborta por filtros.
 */
export async function recordActionLog(
  bot: Client,
  input: RecordActionLogInput,
): Promise<ActionLogEntry | null> {
  const config = getActionLogsConfig(input.guildId);

  // Pipeline: enabled → ignore bots → canales/categoría/roles → switch evento
  if (!config.enabled) return null;
  if (config.ignoreBots && input.actorIsBot) return null;
  if (
    isChannelIgnored(
      config.ignoredChannels,
      input.channelId,
      input.parentId,
    )
  ) {
    return null;
  }
  if (
    input.actorRoleIds?.length &&
    input.actorRoleIds.some((roleId) => config.ignoredRoles.includes(roleId))
  ) {
    return null;
  }

  const meta = EVENT_META[input.eventKey];
  if (!config.enabledEvents[input.eventKey]) return null;

  const destinationId = resolveLogChannelId(config, meta.category);
  const details = input.details ?? {};
  const id = randomUUID();
  const createdAt = new Date();

  getDb()
    .insert(actionLogs)
    .values({
      id,
      guildId: input.guildId,
      category: meta.category,
      eventType: meta.eventType,
      executorId: input.executorId ?? null,
      executorTag: input.executorTag ?? null,
      targetId: input.targetId ?? null,
      targetTag: input.targetTag ?? null,
      channelId: input.channelId ?? null,
      summary: input.summary,
      details: JSON.stringify(details),
      createdAt,
    })
    .run();

  const entry: ActionLogEntry = {
    id,
    guildId: input.guildId,
    category: meta.category,
    eventType: meta.eventType,
    executorId: input.executorId ?? null,
    executorTag: input.executorTag ?? null,
    targetId: input.targetId ?? null,
    targetTag: input.targetTag ?? null,
    channelId: input.channelId ?? null,
    summary: input.summary,
    details,
    createdAt: createdAt.toISOString(),
  };

  if (destinationId) {
    try {
      let authorAvatar = input.executorAvatarURL ?? null;
      let authorTag = input.executorTag ?? null;
      const executorUnknown = Boolean(input.executorUnknown);

      // Author = ejecutor; si es desconocido, Author = afectado/autor original
      const authorUserId = executorUnknown
        ? (input.targetId ?? null)
        : (input.executorId ?? input.targetId ?? null);

      if (authorUserId && (!authorAvatar || !authorTag)) {
        try {
          const user = await bot.users.fetch(authorUserId);
          authorTag = authorTag ?? user.tag;
          authorAvatar = authorAvatar ?? user.displayAvatarURL({ size: 128 });
        } catch {
          // ignore
        }
      }

      // Si el ejecutor es desconocido, preferimos tag/avatar del target
      if (executorUnknown && input.targetId) {
        try {
          const target = await bot.users.fetch(input.targetId);
          authorTag = input.targetTag ?? target.tag;
          authorAvatar = target.displayAvatarURL({ size: 128 });
        } catch {
          authorTag = input.targetTag ?? authorTag;
        }
      }

      const channelPart = entry.channelId ? ` en <#${entry.channelId}>` : "";
      const description =
        input.description?.trim() ||
        `**${meta.label}**${channelPart}`;

      const messageId =
        typeof details.messageId === "string" ? details.messageId : null;

      const embed = buildActionLogEmbed({
        entry,
        description,
        emoji: meta.emoji,
        tone: input.tone ?? meta.tone,
        authorTag,
        authorAvatarURL: authorAvatar,
        executorUnknown,
        affectedUserId: entry.targetId,
        messageId,
        footerUserId: entry.executorId ?? entry.targetId,
      });

      await sendActionLogWebhook(bot, {
        guildId: input.guildId,
        channelId: destinationId,
        embeds: [embed],
      });
    } catch (error) {
      console.warn(
        `[adobos] action-logs: no se pudo enviar webhook a ${destinationId}:`,
        error,
      );
    }
  }

  return entry;
}

/** Borra logs SQLite anteriores a la retención del guild. */
export function purgeExpiredActionLogs(guildId?: string): number {
  const id = resolveGuildId(guildId);
  const config = getActionLogsConfig(id);
  const days = config.dataRetentionDays as ActionLogRetentionDays;
  if (!days || days <= 0) return 0;

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = getDb()
    .delete(actionLogs)
    .where(
      and(eq(actionLogs.guildId, id), lt(actionLogs.createdAt, cutoff)),
    )
    .run();
  return result.changes ?? 0;
}

/** Limpia retención de todos los guilds con config (job periódico). */
export function purgeAllExpiredActionLogs(): number {
  const rows = getDb().select({ guildId: actionLogsConfig.guildId }).from(actionLogsConfig).all();
  let total = 0;
  for (const row of rows) {
    try {
      total += purgeExpiredActionLogs(row.guildId);
    } catch (error) {
      console.warn(
        `[adobos] action-logs: purge falló para ${row.guildId}:`,
        error,
      );
    }
  }
  return total;
}

export function listActionLogsHistory(
  query: ActionLogsHistoryQuery = {},
): ActionLogsHistoryResponse {
  const guildId = resolveGuildId(query.guildId);
  // Limpieza oportunista al consultar historial
  try {
    purgeExpiredActionLogs(guildId);
  } catch {
    // ignore
  }
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(50, Math.max(1, query.limit ?? 50));
  const offset = (page - 1) * limit;

  const conditions = [eq(actionLogs.guildId, guildId)];

  if (query.category && query.category !== "all") {
    conditions.push(eq(actionLogs.category, query.category));
  }

  if (query.from) {
    const fromDate = new Date(query.from);
    if (!Number.isNaN(fromDate.getTime())) {
      conditions.push(gte(actionLogs.createdAt, fromDate));
    }
  }
  if (query.to) {
    const toDate = new Date(query.to);
    if (!Number.isNaN(toDate.getTime())) {
      conditions.push(lte(actionLogs.createdAt, toDate));
    }
  }

  const q = query.q?.trim();
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        like(actionLogs.executorTag, pattern),
        like(actionLogs.executorId, pattern),
        like(actionLogs.targetTag, pattern),
        like(actionLogs.targetId, pattern),
        like(actionLogs.summary, pattern),
        like(actionLogs.eventType, pattern),
      )!,
    );
  }

  const where = and(...conditions);
  const db = getDb();

  const totalRow = db
    .select({ count: sql<number>`count(*)` })
    .from(actionLogs)
    .where(where)
    .get();
  const total = Number(totalRow?.count ?? 0);

  const rows = db
    .select()
    .from(actionLogs)
    .where(where)
    .orderBy(desc(actionLogs.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  const entries: ActionLogEntry[] = rows.map((row) => ({
    id: row.id,
    guildId: row.guildId,
    category: row.category as ActionLogCategory,
    eventType: row.eventType as ActionLogEventType,
    executorId: row.executorId,
    executorTag: row.executorTag,
    targetId: row.targetId,
    targetTag: row.targetTag,
    channelId: row.channelId,
    summary: row.summary,
    details: parseJson<Record<string, unknown>>(row.details, {}),
    createdAt: row.createdAt.toISOString(),
  }));

  return {
    entries,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function sendActionLogsTestEmbed(
  bot: Client,
  guildId?: string,
): Promise<ActionLogsTestResponse> {
  const guild = resolveGuild(bot, guildId);
  const config = getActionLogsConfig(guild.id);
  const channelId = resolveLogChannelId(config, "MESSAGES") ?? config.globalChannelId;

  if (!channelId) {
    throw new ActionLogsError(
      "Configura un canal de destino antes de enviar la prueba.",
      400,
      "NO_LOG_CHANNEL",
    );
  }

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (
    !channel ||
    channel.type !== ChannelType.GuildText ||
    !channel.isTextBased()
  ) {
    throw new ActionLogsError(
      "El canal de logs no es un canal de texto válido.",
      400,
      "INVALID_LOG_CHANNEL",
    );
  }

  const embed = new EmbedBuilder()
    .setColor(0xe91e8c)
    .setTitle("Prueba de Action Logs")
    .setDescription(
      "Si ves este embed, el bot tiene permisos para enviar registros en este canal.",
    )
    .addFields(
      {
        name: "Modo de enrutamiento",
        value: config.routingMode,
        inline: true,
      },
      {
        name: "Módulo",
        value: config.enabled ? "Habilitado" : "Deshabilitado",
        inline: true,
      },
    )
    .setTimestamp(new Date())
    .setFooter({ text: "Adobos Bot · Action Logs" });

  try {
    const result = await sendActionLogWebhook(bot, {
      guildId: guild.id,
      channelId,
      embeds: [embed],
    });
    return {
      ok: true,
      channelId,
      messageId: result.messageId,
    };
  } catch {
    throw new ActionLogsError(
      "No se pudo enviar el embed vía webhook. Revisa permisos (Gestionar webhooks).",
      403,
      "SEND_FAILED",
    );
  }
}
