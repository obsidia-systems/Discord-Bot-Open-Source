import type { EmbedPayload } from "./messages.js";

export type ModDmMode = "none" | "text" | "template";

export interface EmbedTemplateSummary {
  id: number;
  guildId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmbedTemplateDetail extends EmbedTemplateSummary {
  embedData: EmbedPayload;
}

export interface EmbedTemplateListResponse {
  templates: EmbedTemplateSummary[];
}

export interface SaveEmbedTemplateRequest {
  id?: number;
  guildId?: string;
  name: string;
  embedData: EmbedPayload;
}

export interface SaveEmbedTemplateResponse {
  ok: true;
  template: EmbedTemplateDetail;
}

export interface DeleteEmbedTemplateResponse {
  ok: true;
}
