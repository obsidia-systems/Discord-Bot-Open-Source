export interface SendMessageRequest {
  channelId: string;
  content: string;
}

export interface SendMessageResponse {
  ok: true;
  messageId: string;
  channelId: string;
}

export type MessageButtonStyle =
  | "Primary"
  | "Secondary"
  | "Success"
  | "Danger"
  | "Link";

export interface MessageButtonInput {
  label: string;
  style: MessageButtonStyle;
  customId?: string;
  url?: string;
  disabled?: boolean;
  emoji?: string;
}

export interface MessageActionRowInput {
  buttons: MessageButtonInput[];
}

export interface SendEmbedRequest {
  channelId: string;
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

export type SendEmbedResponse = SendMessageResponse & {
  /** ID del registro en `sent_embeds` (si se persistió). */
  sentId?: string;
};

/** Campos de embed reutilizables (sin channelId). */
export interface EmbedPayload {
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
}
