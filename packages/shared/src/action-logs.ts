/** Contratos Action Logs / Registro de Eventos. */

export type ActionLogRoutingMode = "GLOBAL" | "CATEGORY";

export type ActionLogCategory =
  | "MESSAGES"
  | "MEMBERS"
  | "ROLES"
  | "CHANNELS"
  | "ASSETS";

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
  | "soundboardUpdate";

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
  | "SOUNDBOARD_UPDATE";

export interface ActionLogChannelsMapping {
  messages: string | null;
  members: string | null;
  server: string | null;
  assets: string | null;
}

export type ActionLogEnabledEvents = Record<ActionLogEventKey, boolean>;

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
