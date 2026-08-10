/** Tipos e interfaces compartidos entre backend y frontend. */

export interface HealthResponse {
  status: "ok" | "degraded";
  uptime: number;
  botReady: boolean;
  timestamp: string;
}

export interface GuildSummary {
  id: string;
  name: string;
  memberCount: number;
  iconUrl: string | null;
}

export type PluginId =
  | "minecraft"
  | "osu"
  | "valorant"
  | "gachas"
  | "alerts";

export interface PluginMeta {
  id: PluginId;
  name: string;
  description: string;
  enabled: boolean;
}

export interface ApiErrorBody {
  error: string;
  code?: string;
}

/** Body de POST /api/messages */
export interface SendMessageRequest {
  channelId: string;
  content: string;
}

export interface SendMessageResponse {
  ok: true;
  messageId: string;
  channelId: string;
}

/** Body de POST /api/messages/embed */
export interface SendEmbedRequest {
  channelId: string;
  /** Mensaje de texto opcional fuera del embed. */
  content?: string;
  title?: string;
  description?: string;
  /** Color hex (#RRGGBB o RRGGBB). */
  color?: string;
  authorName?: string;
  authorIconUrl?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  footerText?: string;
  footerIconUrl?: string;
}

export type SendEmbedResponse = SendMessageResponse;
