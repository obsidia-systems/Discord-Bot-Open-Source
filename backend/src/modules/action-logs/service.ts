import { randomUUID } from "node:crypto";
import {
  ChannelType,
  EmbedBuilder,
  type Client,
  type Guild,
  type TextChannel,
} from "discord.js";
import { and, desc, eq, gte, lte, or, sql, like } from "drizzle-orm";
import type {
  ActionLogCategory,
  ActionLogChannelsMapping,
  ActionLogEnabledEvents,
  ActionLogEntry,
  ActionLogEventKey,
  ActionLogEventType,
  ActionLogRoutingMode,
  ActionLogsConfig,
  ActionLogsHistoryQuery,
  ActionLogsHistoryResponse,
  ActionLogsTestResponse,
  UpdateActionLogsConfigRequest,
} from "@adobos/shared";
import {
  defaultActionLogChannelsMapping,
  defaultActionLogEnabledEvents,
} from "@adobos/shared";
import { getDb } from "../../db/client.js";
import {
  actionLogs,
  actionLogsConfig,
  guildSettings,
} from "../../db/schema.js";

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
  ROLES: "server",
  CHANNELS: "server",
  ASSETS: "assets",
};

const EVENT_META: Record<
  ActionLogEventKey,
  { eventType: ActionLogEventType; category: ActionLogCategory; label: string }
> = {
  messageDelete: {
    eventType: "MESSAGE_DELETE",
    category: "MESSAGES",
    label: "Mensaje eliminado",
  },
  messageUpdate: {
    eventType: "MESSAGE_UPDATE",
    category: "MESSAGES",
    label: "Mensaje editado",
  },
  messageAttachmentDelete: {
    eventType: "MESSAGE_ATTACHMENT_DELETE",
    category: "MESSAGES",
    label: "Adjunto eliminado",
  },
  memberJoin: {
    eventType: "MEMBER_JOIN",
    category: "MEMBERS",
    label: "Miembro se une",
  },
  memberLeave: {
    eventType: "MEMBER_LEAVE",
    category: "MEMBERS",
    label: "Miembro sale",
  },
  memberRoleUpdate: {
    eventType: "MEMBER_ROLE_UPDATE",
    category: "MEMBERS",
    label: "Roles actualizados",
  },
  memberNicknameUpdate: {
    eventType: "MEMBER_NICKNAME_UPDATE",
    category: "MEMBERS",
    label: "Apodo cambiado",
  },
  memberBan: {
    eventType: "MEMBER_BAN",
    category: "MEMBERS",
    label: "Miembro baneado",
  },
  memberUnban: {
    eventType: "MEMBER_UNBAN",
    category: "MEMBERS",
    label: "Miembro desbaneado",
  },
  roleCreate: {
    eventType: "ROLE_CREATE",
    category: "ROLES",
    label: "Rol creado",
  },
  roleDelete: {
    eventType: "ROLE_DELETE",
    category: "ROLES",
    label: "Rol eliminado",
  },
  roleUpdate: {
    eventType: "ROLE_UPDATE",
    category: "ROLES",
    label: "Rol actualizado",
  },
  channelCreate: {
    eventType: "CHANNEL_CREATE",
    category: "CHANNELS",
    label: "Canal creado",
  },
  channelDelete: {
    eventType: "CHANNEL_DELETE",
    category: "CHANNELS",
    label: "Canal eliminado",
  },
  channelUpdate: {
    eventType: "CHANNEL_UPDATE",
    category: "CHANNELS",
    label: "Canal actualizado",
  },
  emojiCreate: {
    eventType: "EMOJI_CREATE",
    category: "ASSETS",
    label: "Emoji creado",
  },
  emojiDelete: {
    eventType: "EMOJI_DELETE",
    category: "ASSETS",
    label: "Emoji eliminado",
  },
  emojiUpdate: {
    eventType: "EMOJI_UPDATE",
    category: "ASSETS",
    label: "Emoji actualizado",
  },
  stickerCreate: {
    eventType: "STICKER_CREATE",
    category: "ASSETS",
    label: "Sticker creado",
  },
  stickerDelete: {
    eventType: "STICKER_DELETE",
    category: "ASSETS",
    label: "Sticker eliminado",
  },
  stickerUpdate: {
    eventType: "STICKER_UPDATE",
    category: "ASSETS",
    label: "Sticker actualizado",
  },
  soundboardCreate: {
    eventType: "SOUNDBOARD_CREATE",
    category: "ASSETS",
    label: "Sonido creado",
  },
  soundboardDelete: {
    eventType: "SOUNDBOARD_DELETE",
    category: "ASSETS",
    label: "Sonido eliminado",
  },
  soundboardUpdate: {
    eventType: "SOUNDBOARD_UPDATE",
    category: "ASSETS",
    label: "Sonido actualizado",
  },
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
  return {
    ...defaultActionLogChannelsMapping(),
    ...(partial ?? {}),
  };
}

function rowToConfig(
  guildId: string,
  row: typeof actionLogsConfig.$inferSelect | undefined,
): ActionLogsConfig {
  if (!row) {
    return {
      guildId,
      enabled: false,
      routingMode: "GLOBAL",
      globalChannelId: null,
      channelsMapping: defaultActionLogChannelsMapping(),
      ignoredChannels: [],
      ignoredRoles: [],
      ignoreBots: true,
      enabledEvents: defaultActionLogEnabledEvents(),
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
    routingMode: (row.routingMode as ActionLogRoutingMode) || "GLOBAL",
    globalChannelId: row.globalChannelId,
    channelsMapping: mapping,
    ignoredChannels: parseJson<string[]>(row.ignoredChannels, []),
    ignoredRoles: parseJson<string[]>(row.ignoredRoles, []),
    ignoreBots: Boolean(row.ignoreBots),
    enabledEvents,
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
  const next: ActionLogsConfig = {
    ...current,
    enabled: input.enabled ?? current.enabled,
    routingMode: input.routingMode ?? current.routingMode,
    globalChannelId:
      input.globalChannelId === undefined
        ? current.globalChannelId
        : input.globalChannelId,
    channelsMapping: mergeChannelsMapping({
      ...current.channelsMapping,
      ...(input.channelsMapping ?? {}),
    }),
    ignoredChannels: input.ignoredChannels ?? current.ignoredChannels,
    ignoredRoles: input.ignoredRoles ?? current.ignoredRoles,
    ignoreBots: input.ignoreBots ?? current.ignoreBots,
    enabledEvents: mergeEnabledEvents({
      ...current.enabledEvents,
      ...(input.enabledEvents ?? {}),
    }),
    updatedAt: new Date().toISOString(),
  };

  if (next.routingMode !== "GLOBAL" && next.routingMode !== "CATEGORY") {
    throw new ActionLogsError(
      "routingMode inválido (GLOBAL | CATEGORY).",
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
  if (config.routingMode === "CATEGORY") {
    const key = CATEGORY_ROUTE_KEY[category];
    const mapped = config.channelsMapping[key];
    if (mapped) return mapped;
  }
  return config.globalChannelId;
}

/** Chequeo barato para abortar listeners antes de audit/CPU. */
export function passesActionLogFilters(
  guildId: string,
  eventKey: ActionLogEventKey,
  ctx: {
    channelId?: string | null;
    actorIsBot?: boolean;
    actorRoleIds?: string[];
  } = {},
): boolean {
  const config = getActionLogsConfig(guildId);
  if (!config.enabled) return false;
  if (config.ignoreBots && ctx.actorIsBot) return false;
  if (ctx.channelId && config.ignoredChannels.includes(ctx.channelId)) {
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

export interface RecordActionLogInput {
  guildId: string;
  eventKey: ActionLogEventKey;
  executorId?: string | null;
  executorTag?: string | null;
  targetId?: string | null;
  targetTag?: string | null;
  channelId?: string | null;
  summary: string;
  details?: Record<string, unknown>;
  /** Si true, el actor es un bot. */
  actorIsBot?: boolean;
  /** Roles del ejecutor o del miembro involucrado para filtros. */
  actorRoleIds?: string[];
  /** Color del embed (decimal Discord). */
  embedColor?: number;
}

/**
 * Pipeline de filtros (temprano) + insert SQLite + embed Discord.
 * Retorna null si se aborta por filtros.
 */
export async function recordActionLog(
  bot: Client,
  input: RecordActionLogInput,
): Promise<ActionLogEntry | null> {
  const config = getActionLogsConfig(input.guildId);

  // Pipeline: enabled → ignore bots → canales/roles → switch evento
  if (!config.enabled) return null;
  if (config.ignoreBots && input.actorIsBot) return null;
  if (
    input.channelId &&
    config.ignoredChannels.includes(input.channelId)
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
      const channel = await bot.channels.fetch(destinationId);
      if (channel?.isTextBased() && !channel.isDMBased()) {
        const embed = buildActionLogEmbed(entry, meta.label, input.embedColor);
        await (channel as TextChannel).send({ embeds: [embed] });
      }
    } catch (error) {
      console.warn(
        `[adobos] action-logs: no se pudo enviar embed a ${destinationId}:`,
        error,
      );
    }
  }

  return entry;
}

function buildActionLogEmbed(
  entry: ActionLogEntry,
  label: string,
  color = 0xe91e8c,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(label)
    .setDescription(entry.summary || "—")
    .setTimestamp(new Date(entry.createdAt))
    .setFooter({ text: `Action Logs · ${entry.eventType}` });

  if (entry.executorTag || entry.executorId) {
    embed.addFields({
      name: "Ejecutor",
      value: entry.executorTag
        ? `${entry.executorTag} (\`${entry.executorId}\`)`
        : `\`${entry.executorId}\``,
      inline: true,
    });
  }
  if (entry.targetTag || entry.targetId) {
    embed.addFields({
      name: "Objetivo",
      value: entry.targetTag
        ? `${entry.targetTag} (\`${entry.targetId}\`)`
        : `\`${entry.targetId}\``,
      inline: true,
    });
  }
  if (entry.channelId) {
    embed.addFields({
      name: "Canal",
      value: `<#${entry.channelId}>`,
      inline: true,
    });
  }

  const oldContent =
    typeof entry.details.oldContent === "string"
      ? entry.details.oldContent
      : null;
  const newContent =
    typeof entry.details.newContent === "string"
      ? entry.details.newContent
      : null;
  if (oldContent !== null || newContent !== null) {
    if (oldContent !== null) {
      embed.addFields({
        name: "Antes",
        value: truncate(oldContent || "*(vacío)*", 1000),
      });
    }
    if (newContent !== null) {
      embed.addFields({
        name: "Después",
        value: truncate(newContent || "*(vacío)*", 1000),
      });
    }
  }

  return embed;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function listActionLogsHistory(
  query: ActionLogsHistoryQuery = {},
): ActionLogsHistoryResponse {
  const guildId = resolveGuildId(query.guildId);
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
    const message = await channel.send({ embeds: [embed] });
    return {
      ok: true,
      channelId,
      messageId: message.id,
    };
  } catch {
    throw new ActionLogsError(
      "No se pudo enviar el embed. Revisa permisos (Ver canal + Enviar mensajes + Embeds).",
      403,
      "SEND_FAILED",
    );
  }
}
