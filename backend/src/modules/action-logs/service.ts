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
  ActionLogsConfig,
  ActionLogsHistoryQuery,
  ActionLogsHistoryResponse,
  ActionLogsTestResponse,
  UpdateActionLogsConfigRequest,
} from "@adobos/shared";
import {
  defaultActionLogChannelsMapping,
  defaultActionLogEnabledEvents,
  clampRetentionDays,
  isUnlimited,
  limitExceededMessage,
  normalizeChannelsMapping,
  normalizeRetentionDays,
  normalizeRoutingMode,
  type ActionLogEmbedTone,
} from "@adobos/shared";
import { getDb, one } from "../../db/client.js";
import {
  EntitlementError,
  getGuildTier,
  limit as guildLimit,
} from "../../core/entitlements/service.js";
import {
  actionLogs,
  actionLogsConfig,
  guildSettings,
} from "../../db/schema.js";
import { BoundedTtlMap } from "../../core/cache/boundedTtlMap.js";
import { buildActionLogEmbed } from "./embeds.js";
import { sendActionLogWebhook } from "./webhooks.js";
import { logger } from "../../core/log.js";

const configCache = new BoundedTtlMap<string, ActionLogsConfig>(5_000, 60_000);

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
  INVITES: "invites",
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
  messageDeleteBulk: { eventType: "MESSAGE_DELETE_BULK", category: "MESSAGES", label: "Mensajes eliminados en masa", tone: "red", emoji: "🧹" },
  memberJoin: { eventType: "MEMBER_JOIN", category: "MEMBERS", label: "Miembro se une", tone: "green", emoji: "📥" },
  memberLeave: { eventType: "MEMBER_LEAVE", category: "MEMBERS", label: "Miembro sale", tone: "yellow", emoji: "🚪" },
  memberKick: { eventType: "MEMBER_KICK", category: "MEMBERS", label: "Miembro expulsado", tone: "red", emoji: "👢" },
  memberRoleUpdate: { eventType: "MEMBER_ROLE_UPDATE", category: "MEMBERS", label: "Roles actualizados", tone: "blue", emoji: "🎭" },
  memberNicknameUpdate: { eventType: "MEMBER_NICKNAME_UPDATE", category: "MEMBERS", label: "Apodo cambiado", tone: "yellow", emoji: "🏷️" },
  memberTimeout: { eventType: "MEMBER_TIMEOUT", category: "MEMBERS", label: "Timeout", tone: "red", emoji: "⏱️" },
  memberUntimeout: { eventType: "MEMBER_UNTIMEOUT", category: "MEMBERS", label: "Timeout levantado", tone: "green", emoji: "⏱️" },
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

async function ensureGuildRow(guildId: string): Promise<void> {
  const db = getDb();
  const existing = await one(
    db
    .select()
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId))
    .limit(1)
  );
  if (!existing) {
    await db.insert(guildSettings)
      .values({
        guildId,
        prefix: "!",
        welcomeEnabled: false,
        updatedAt: new Date(),
      })
      ;
  }
}

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new ActionLogsError(
      "Falta guildId.",
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

export async function getActionLogsConfig(guildId?: string): Promise<ActionLogsConfig> {
  const id = resolveGuildId(guildId);
  const cached = configCache.get(id);
  if (cached) return cached;
  const row = await one(getDb()
    .select()
    .from(actionLogsConfig)
    .where(eq(actionLogsConfig.guildId, id))
    .limit(1));
  const config = rowToConfig(id, row);
  configCache.set(id, config);
  return config;
}

export async function updateActionLogsConfig(
  input: UpdateActionLogsConfigRequest,
  guildId?: string,
): Promise<ActionLogsConfig> {
  const id = resolveGuildId(guildId);
  await ensureGuildRow(id);

  const current = await getActionLogsConfig(id);
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

  const maxDays = await guildLimit(id, "logRetentionDays");
  if (
    !isUnlimited(maxDays) &&
    (next.dataRetentionDays === 0 || next.dataRetentionDays > maxDays)
  ) {
    const tier = await getGuildTier(id);
    throw new EntitlementError(
      limitExceededMessage(tier, "logRetentionDays", maxDays),
      403,
      "LIMIT_EXCEEDED",
      undefined,
      "logRetentionDays",
    );
  }

  if (next.routingMode !== "SIMPLE" && next.routingMode !== "ADVANCED") {
    throw new ActionLogsError(
      "routingMode inválido (SIMPLE | ADVANCED).",
      400,
      "INVALID_ROUTING_MODE",
    );
  }

  const now = new Date();
  await getDb()
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
    ;

  // Compat: sincroniza log_channel_id legacy con el canal global.
  if (next.globalChannelId) {
    await getDb()
      .update(guildSettings)
      .set({
        logChannelId: next.globalChannelId,
        updatedAt: now,
      })
      .where(eq(guildSettings.guildId, id))
      ;
  }

  configCache.set(id, next);
  return next;
}

export function resolveLogChannelId(
  config: ActionLogsConfig,
  category: ActionLogCategory,
): string | null {
  if (config.routingMode === "ADVANCED") {
    if (category === "INVITES") {
      const invites = config.channelsMapping.invites;
      if (typeof invites === "string" && invites) return invites;
      // Compat: configs viejas mandaban invites al canal de channels.
      const channels = config.channelsMapping.channels;
      if (typeof channels === "string" && channels) return channels;
    } else {
      const key = CATEGORY_ROUTE_KEY[category];
      const mapped = config.channelsMapping[key];
      if (typeof mapped === "string" && mapped) return mapped;
    }
  }
  return config.globalChannelId;
}

export interface ActionLogFilterContext {
  channelId?: string | null;
  /** parentId del canal (categoría) — si está en ignoredChannels, se aborta. */
  parentId?: string | null;
  actorIsBot?: boolean;
  actorRoleIds?: string[];
}

/** Filtros síncronos sobre una config ya cargada (tests + recordActionLog). */
export function configPassesFilters(
  config: ActionLogsConfig,
  eventKey: ActionLogEventKey,
  ctx: ActionLogFilterContext = {},
): boolean {
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

/** Chequeo barato para abortar listeners antes de audit/CPU. */
export async function passesActionLogFilters(
  guildId: string,
  eventKey: ActionLogEventKey,
  ctx: ActionLogFilterContext = {},
): Promise<boolean> {
  const config = await getActionLogsConfig(guildId);
  return configPassesFilters(config, eventKey, ctx);
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
 * Pipeline de filtros (temprano) + insert Postgres + embed Discord vía webhook.
 * Retorna null si se aborta por filtros.
 */
export async function recordActionLog(
  bot: Client,
  input: RecordActionLogInput,
): Promise<ActionLogEntry | null> {
  const config = await getActionLogsConfig(input.guildId);
  if (
    !configPassesFilters(config, input.eventKey, {
      channelId: input.channelId,
      parentId: input.parentId,
      actorIsBot: input.actorIsBot,
      actorRoleIds: input.actorRoleIds,
    })
  ) {
    return null;
  }

  const meta = EVENT_META[input.eventKey];

  const destinationId = resolveLogChannelId(config, meta.category);
  const details = input.details ?? {};
  const id = randomUUID();
  const createdAt = new Date();

  await getDb()
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
    ;

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

      let targetAvatarURL: string | null = null;
      const detailsTargetKind =
        typeof details.targetKind === "string" ? details.targetKind : null;
      const isUserTarget =
        detailsTargetKind === "user" ||
        (!detailsTargetKind &&
          (meta.eventType.startsWith("MESSAGE_") ||
            meta.eventType.startsWith("MEMBER_") ||
            meta.eventType.startsWith("VOICE_")));

      const affectedSnowflake =
        isUserTarget &&
        input.targetId &&
        /^\d{17,20}$/.test(input.targetId)
          ? input.targetId
          : null;
      if (affectedSnowflake) {
        try {
          const targetUser = await bot.users.fetch(affectedSnowflake);
          targetAvatarURL = targetUser.displayAvatarURL({ size: 64 });
        } catch {
          // Footer sin icono si el usuario no se puede resolver
        }
      }

      let systemAvatarURL: string | null = null;
      try {
        const guild =
          bot.guilds.cache.get(input.guildId) ??
          (await bot.guilds.fetch(input.guildId));
        const me = await guild.members.fetchMe();
        systemAvatarURL = me.displayAvatarURL({ extension: "png", size: 64 });
      } catch {
        systemAvatarURL =
          bot.user?.displayAvatarURL({ extension: "png", size: 64 }) ?? null;
      }

      const messageId =
        typeof details.messageId === "string" ? details.messageId : null;

      const embed = buildActionLogEmbed({
        entry,
        actionLabel: meta.label,
        tone: input.tone ?? meta.tone,
        description: input.description ?? null,
        authorTag,
        authorAvatarURL: authorAvatar,
        executorUnknown,
        affectedUserId: isUserTarget ? entry.targetId : null,
        targetAvatarURL,
        systemAvatarURL,
        messageId,
        targetKind: (detailsTargetKind as
          | "user"
          | "channel"
          | "role"
          | "emoji"
          | "sticker"
          | "invite"
          | "resource"
          | null) ?? undefined,
      });

      await sendActionLogWebhook(bot, {
        guildId: input.guildId,
        channelId: destinationId,
        embeds: [embed],
      });
    } catch (error) {
      logger.warn({ err: error }, `action-logs: no se pudo enviar webhook a ${destinationId}:`);
    }
  }

  return entry;
}

/** Borra logs Postgres anteriores a la retención del guild. */
export async function purgeExpiredActionLogs(guildId?: string): Promise<number> {
  const id = resolveGuildId(guildId);
  const config = await getActionLogsConfig(id);
  const maxDays = await guildLimit(id, "logRetentionDays");
  const days = clampRetentionDays(config.dataRetentionDays, maxDays);
  if (!days || days <= 0) return 0;

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const deleted = await getDb()
    .delete(actionLogs)
    .where(
      and(eq(actionLogs.guildId, id), lt(actionLogs.createdAt, cutoff)),
    )
    .returning({ id: actionLogs.id });
  return deleted.length;
}

/** Limpia retención de todos los guilds con config (job periódico). */
export async function purgeAllExpiredActionLogs(): Promise<number> {
  const rows = await getDb().select({ guildId: actionLogsConfig.guildId }).from(actionLogsConfig);
  let total = 0;
  for (const row of rows) {
    try {
      total += await purgeExpiredActionLogs(row.guildId);
    } catch (error) {
      logger.warn({ err: error }, `action-logs: purge falló para ${row.guildId}:`);
    }
  }
  return total;
}

export async function listActionLogsHistory(
  query: ActionLogsHistoryQuery = {},
): Promise<ActionLogsHistoryResponse> {
  const guildId = resolveGuildId(query.guildId);
  // Limpieza oportunista al consultar historial
  try {
    await purgeExpiredActionLogs(guildId);
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

  const totalRow = await one(
    db
    .select({ count: sql<number>`count(*)` })
    .from(actionLogs)
    .where(where)
    .limit(1)
  );
  const total = Number(totalRow?.count ?? 0);

  const rows = await db
    .select()
    .from(actionLogs)
    .where(where)
    .orderBy(desc(actionLogs.createdAt))
    .limit(limit)
    .offset(offset)
    ;

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
  const config = await getActionLogsConfig(guild.id);
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
