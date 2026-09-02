import type { EmbedPayload } from "./messages.js";

export interface SentEmbedRecord {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  title: string | null;
  /** Snapshot JSON del embed enviado. */
  embedData: EmbedPayload;
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

/** `channelId` se ignora: el mensaje no se mueve de canal. */
export type EditSentEmbedRequest = EmbedPayload & {
  channelId?: string;
};

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
