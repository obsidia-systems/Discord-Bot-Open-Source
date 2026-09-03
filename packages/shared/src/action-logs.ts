/** Contratos Action Logs / Registro de Eventos. */

/** SIMPLE = 1 canal global; ADVANCED = mapa por categoría. */
export type ActionLogRoutingMode = "SIMPLE" | "ADVANCED";

/** Alias legacy (migración GLOBAL→SIMPLE, CATEGORY→ADVANCED). */
export type ActionLogRoutingModeLegacy = "GLOBAL" | "CATEGORY";

/** 0 = sin límite (legacy). 14 free · 90 pro · 365 business. */
export type ActionLogRetentionDays = 0 | 7 | 14 | 30 | 90 | 365;

export type ActionLogCategory =
  | "MESSAGES"
  | "MEMBERS"
  | "ROLES"
  | "CHANNELS"
  | "ASSETS"
  | "VOICE"
  | "INVITES";

export type ActionLogEventKey =
  | "messageDelete"
  | "messageUpdate"
  | "messageAttachmentDelete"
  | "messageDeleteBulk"
  | "memberJoin"
  | "memberLeave"
  | "memberKick"
  | "memberRoleUpdate"
  | "memberNicknameUpdate"
  | "memberTimeout"
  | "memberUntimeout"
  | "memberBan"
  | "memberUnban"
  | "roleCreate"
  | "roleDelete"
  | "roleUpdate"
  | "channelCreate"
  | "channelDelete"
  | "channelUpdate"
  | "threadCreate"
  | "threadDelete"
  | "threadUpdate"
  | "guildUpdate"
  | "emojiCreate"
  | "emojiDelete"
  | "emojiUpdate"
  | "stickerCreate"
  | "stickerDelete"
  | "stickerUpdate"
  | "soundboardCreate"
  | "soundboardDelete"
  | "soundboardUpdate"
  | "voiceJoin"
  | "voiceLeave"
  | "voiceKick"
  | "voiceMove"
  | "inviteCreate"
  | "inviteDelete";

export type ActionLogEventType =
  | "MESSAGE_DELETE"
  | "MESSAGE_UPDATE"
  | "MESSAGE_ATTACHMENT_DELETE"
  | "MESSAGE_DELETE_BULK"
  | "MEMBER_JOIN"
  | "MEMBER_LEAVE"
  | "MEMBER_KICK"
  | "MEMBER_ROLE_UPDATE"
  | "MEMBER_NICKNAME_UPDATE"
  | "MEMBER_TIMEOUT"
  | "MEMBER_UNTIMEOUT"
  | "MEMBER_BAN"
  | "MEMBER_UNBAN"
  | "ROLE_CREATE"
  | "ROLE_DELETE"
  | "ROLE_UPDATE"
  | "CHANNEL_CREATE"
  | "CHANNEL_DELETE"
  | "CHANNEL_UPDATE"
  | "THREAD_CREATE"
  | "THREAD_DELETE"
  | "THREAD_UPDATE"
  | "GUILD_UPDATE"
  | "EMOJI_CREATE"
  | "EMOJI_DELETE"
  | "EMOJI_UPDATE"
  | "STICKER_CREATE"
  | "STICKER_DELETE"
  | "STICKER_UPDATE"
  | "SOUNDBOARD_CREATE"
  | "SOUNDBOARD_DELETE"
  | "SOUNDBOARD_UPDATE"
  | "VOICE_JOIN"
  | "VOICE_LEAVE"
  | "VOICE_KICK"
  | "VOICE_MOVE"
  | "INVITE_CREATE"
  | "INVITE_DELETE";

/** Tono de color del embed (anatomía Enterprise). */
export type ActionLogEmbedTone = "red" | "yellow" | "green" | "blue";

/**
 * Mapa de canales en modo ADVANCED.
 * keys: messages | members | roles | channels | voice | assets | invites
 */
export interface ActionLogChannelsMapping {
  messages: string | null;
  members: string | null;
  roles: string | null;
  channels: string | null;
  voice: string | null;
  assets: string | null;
  invites: string | null;
  /** @deprecated legacy — se migra a roles/channels */
  server?: string | null;
}

export type ActionLogEnabledEvents = Record<ActionLogEventKey, boolean>;

/** channelId → webhookId (cache local para recrear si Discord lo borra). */
export type ActionLogWebhooksMapping = Record<string, string>;

export interface ActionLogsConfig {
  guildId: string;
  enabled: boolean;
  routingMode: ActionLogRoutingMode;
  globalChannelId: string | null;
  /** Alias API: channelsMap */
  channelsMapping: ActionLogChannelsMapping;
  ignoredChannels: string[];
  ignoredRoles: string[];
  ignoreBots: boolean;
  enabledEvents: ActionLogEnabledEvents;
  /** Días a conservar en Postgres; 0 = sin límite. */
  dataRetentionDays: ActionLogRetentionDays;
  updatedAt: string;
}

export interface ActionLogsConfigResponse {
  config: ActionLogsConfig;
}

export interface UpdateActionLogsConfigRequest {
  enabled?: boolean;
  routingMode?: ActionLogRoutingMode | ActionLogRoutingModeLegacy;
  globalChannelId?: string | null;
  channelsMapping?: Partial<ActionLogChannelsMapping>;
  /** Alias del spec */
  channelsMap?: Partial<ActionLogChannelsMapping>;
  ignoredChannels?: string[];
  ignoredRoles?: string[];
  ignoreBots?: boolean;
  enabledEvents?: Partial<ActionLogEnabledEvents>;
  dataRetentionDays?: ActionLogRetentionDays;
}

export interface ActionLogEntry {
  id: string;
  guildId: string;
  category: ActionLogCategory;
  eventType: ActionLogEventType;
  executorId: string | null;
  executorTag: string | null;
  targetId: string | null;
  targetTag: string | null;
  channelId: string | null;
  summary: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ActionLogsHistoryQuery {
  guildId?: string;
  category?: ActionLogCategory | "all";
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface ActionLogsHistoryResponse {
  entries: ActionLogEntry[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ActionLogsTestResponse {
  ok: true;
  channelId: string;
  messageId: string;
}

export const ACTION_LOG_EVENT_KEYS: readonly ActionLogEventKey[] = [
  "messageDelete",
  "messageUpdate",
  "messageAttachmentDelete",
  "messageDeleteBulk",
  "memberJoin",
  "memberLeave",
  "memberKick",
  "memberRoleUpdate",
  "memberNicknameUpdate",
  "memberTimeout",
  "memberUntimeout",
  "memberBan",
  "memberUnban",
  "roleCreate",
  "roleDelete",
  "roleUpdate",
  "channelCreate",
  "channelDelete",
  "channelUpdate",
  "threadCreate",
  "threadDelete",
  "threadUpdate",
  "guildUpdate",
  "emojiCreate",
  "emojiDelete",
  "emojiUpdate",
  "stickerCreate",
  "stickerDelete",
  "stickerUpdate",
  "soundboardCreate",
  "soundboardDelete",
  "soundboardUpdate",
  "voiceJoin",
  "voiceLeave",
  "voiceKick",
  "voiceMove",
  "inviteCreate",
  "inviteDelete",
] as const;

export const ACTION_LOG_RETENTION_OPTIONS: readonly {
  value: ActionLogRetentionDays;
  label: string;
}[] = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
] as const;

export const ACTION_LOG_EMBED_COLORS: Record<ActionLogEmbedTone, number> = {
  red: 0xed4245,
  yellow: 0xfee75c,
  green: 0x57f287,
  blue: 0x5865f2,
};

export function defaultActionLogEnabledEvents(): ActionLogEnabledEvents {
  return Object.fromEntries(
    ACTION_LOG_EVENT_KEYS.map((key) => [key, true]),
  ) as ActionLogEnabledEvents;
}

export function defaultActionLogChannelsMapping(): ActionLogChannelsMapping {
  return {
    messages: null,
    members: null,
    roles: null,
    channels: null,
    voice: null,
    assets: null,
    invites: null,
  };
}

const RETENTION_ALLOWED = new Set<number>([0, 7, 14, 30, 90, 365]);

export function normalizeRetentionDays(value: unknown): ActionLogRetentionDays {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n === "number" && RETENTION_ALLOWED.has(n)) {
    return n as ActionLogRetentionDays;
  }
  return 14;
}

/** Recorta la retención configurada al tope del plan (`maxDays` < 0 = ilimitado). */
export function clampRetentionDays(
  configured: number,
  maxDays: number,
): number {
  if (maxDays < 0) return configured;
  if (configured <= 0) return maxDays;
  return Math.min(configured, maxDays);
}

export function normalizeRoutingMode(value: unknown): ActionLogRoutingMode {
  if (value === "SIMPLE" || value === "ADVANCED") return value;
  if (value === "GLOBAL") return "SIMPLE";
  if (value === "CATEGORY") return "ADVANCED";
  return "SIMPLE";
}

/** Normaliza mapa legacy (`server`) → roles/channels. */
export function normalizeChannelsMapping(
  partial?: Partial<ActionLogChannelsMapping> | null,
): ActionLogChannelsMapping {
  const base = defaultActionLogChannelsMapping();
  const raw = partial ?? {};
  const server = raw.server ?? null;
  return {
    messages: raw.messages ?? base.messages,
    members: raw.members ?? base.members,
    roles: raw.roles ?? server ?? base.roles,
    channels: raw.channels ?? server ?? base.channels,
    voice: raw.voice ?? base.voice,
    assets: raw.assets ?? base.assets,
    invites: raw.invites ?? base.invites,
  };
}
