/** Contratos Action Logs / Registro de Eventos. */

export type ActionLogRoutingMode = "GLOBAL" | "CATEGORY";

/** 0 = sin límite (no recomendado). */
export type ActionLogRetentionDays = 0 | 7 | 14 | 30;

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
  | "memberJoin"
  | "memberLeave"
  | "memberRoleUpdate"
  | "memberNicknameUpdate"
  | "memberBan"
  | "memberUnban"
  | "roleCreate"
  | "roleDelete"
  | "roleUpdate"
  | "channelCreate"
  | "channelDelete"
  | "channelUpdate"
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
  | "voiceMove"
  | "inviteCreate"
  | "inviteDelete";

export type ActionLogEventType =
  | "MESSAGE_DELETE"
  | "MESSAGE_UPDATE"
  | "MESSAGE_ATTACHMENT_DELETE"
  | "MEMBER_JOIN"
  | "MEMBER_LEAVE"
  | "MEMBER_ROLE_UPDATE"
  | "MEMBER_NICKNAME_UPDATE"
  | "MEMBER_BAN"
  | "MEMBER_UNBAN"
  | "ROLE_CREATE"
  | "ROLE_DELETE"
  | "ROLE_UPDATE"
  | "CHANNEL_CREATE"
  | "CHANNEL_DELETE"
  | "CHANNEL_UPDATE"
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
  | "VOICE_MOVE"
  | "INVITE_CREATE"
  | "INVITE_DELETE";

export interface ActionLogChannelsMapping {
  messages: string | null;
  members: string | null;
  server: string | null;
  assets: string | null;
}

export type ActionLogEnabledEvents = Record<ActionLogEventKey, boolean>;

/** channelId → webhookId (cache local para recrear si Discord lo borra). */
export type ActionLogWebhooksMapping = Record<string, string>;

export interface ActionLogsConfig {
  guildId: string;
  enabled: boolean;
  routingMode: ActionLogRoutingMode;
  globalChannelId: string | null;
  channelsMapping: ActionLogChannelsMapping;
  ignoredChannels: string[];
  ignoredRoles: string[];
  ignoreBots: boolean;
  enabledEvents: ActionLogEnabledEvents;
  /** Días a conservar en SQLite; 0 = sin límite. */
  dataRetentionDays: ActionLogRetentionDays;
  updatedAt: string;
}

export interface ActionLogsConfigResponse {
  config: ActionLogsConfig;
}

export interface UpdateActionLogsConfigRequest {
  enabled?: boolean;
  routingMode?: ActionLogRoutingMode;
  globalChannelId?: string | null;
  channelsMapping?: Partial<ActionLogChannelsMapping>;
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
  "memberJoin",
  "memberLeave",
  "memberRoleUpdate",
  "memberNicknameUpdate",
  "memberBan",
  "memberUnban",
  "roleCreate",
  "roleDelete",
  "roleUpdate",
  "channelCreate",
  "channelDelete",
  "channelUpdate",
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
  "voiceMove",
  "inviteCreate",
  "inviteDelete",
] as const;

export const ACTION_LOG_RETENTION_OPTIONS: readonly {
  value: ActionLogRetentionDays;
  label: string;
}[] = [
  { value: 7, label: "7 días" },
  { value: 14, label: "14 días" },
  { value: 30, label: "30 días" },
  { value: 0, label: "Sin límite (No recomendado)" },
] as const;

export function defaultActionLogEnabledEvents(): ActionLogEnabledEvents {
  return Object.fromEntries(
    ACTION_LOG_EVENT_KEYS.map((key) => [key, true]),
  ) as ActionLogEnabledEvents;
}

export function defaultActionLogChannelsMapping(): ActionLogChannelsMapping {
  return {
    messages: null,
    members: null,
    server: null,
    assets: null,
  };
}

export function normalizeRetentionDays(
  value: unknown,
): ActionLogRetentionDays {
  if (value === 0 || value === 7 || value === 14 || value === 30) return value;
  if (value === "0" || value === "7" || value === "14" || value === "30") {
    return Number(value) as ActionLogRetentionDays;
  }
  return 14;
}
