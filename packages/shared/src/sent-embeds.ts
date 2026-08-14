import type { EmbedPayload, MessageActionRowInput } from "./messages.js";

export interface SentEmbedRecord {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  title: string | null;
  /** Snapshot JSON del embed enviado (EmbedPayload + components). */
  embedData: EmbedPayload & { components?: MessageActionRowInput[] };
  createdAt: string;
  channelName?: string | null;
}

export interface EmbedLibraryResponse {
  sentMessages: SentEmbedRecord[];
  templates: Array<{
    id: number;
    guildId: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface EditSentEmbedRequest {
  channelId?: string;
  content?: string;
  title?: string;
  url?: string;
  description?: string;
  color?: string;
  authorName?: string;
  authorIconUrl?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  footerText?: string;
  footerIconUrl?: string;
  timestamp?: boolean;
  components?: MessageActionRowInput[];
}

export interface EditSentEmbedResponse {
  ok: true;
  entry: SentEmbedRecord;
  orphaned?: boolean;
}

export interface DeleteSentEmbedResponse {
  ok: true;
  deletedId: string;
  orphaned?: boolean;
}
