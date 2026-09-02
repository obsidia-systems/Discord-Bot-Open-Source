export interface SendMessageRequest {
  channelId: string;
  content: string;
}

export interface SendMessageResponse {
  ok: true;
  messageId: string;
  channelId: string;
}

export const MESSAGE_CONTENT_MAX = 2000;
export const EMBED_TITLE_MAX = 256;
export const EMBED_DESCRIPTION_MAX = 4096;
export const EMBED_AUTHOR_MAX = 256;
export const EMBED_FOOTER_MAX = 2048;
export const EMBED_FIELD_NAME_MAX = 256;
export const EMBED_FIELD_VALUE_MAX = 1024;
export const EMBED_FIELDS_MAX = 25;
export const EMBED_TOTAL_MAX = 6000;
export const MESSAGE_BUTTON_LABEL_MAX = 80;
export const MESSAGE_ACTION_ROWS_MAX = 5;
export const MESSAGE_BUTTONS_PER_ROW_MAX = 5;

/** GuildText (0) y GuildAnnouncement (5). */
export const MESSAGE_SEND_CHANNEL_TYPES = [0, 5] as const;

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

export interface EmbedFieldInput {
  name: string;
  value: string;
  inline?: boolean;
}

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
  fields?: EmbedFieldInput[];
  components?: MessageActionRowInput[];
}

export interface SendEmbedRequest extends EmbedPayload {
  channelId: string;
}

export type SendEmbedResponse = SendMessageResponse & {
  /** ID del registro en `sent_embeds` (si se persistió). */
  sentId?: string;
};

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\/.+/i.test(value.trim());
}

export function parseEmbedHexColor(color?: string): number | undefined {
  if (!color?.trim()) return undefined;
  const raw = color.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return undefined;
  return Number.parseInt(raw, 16);
}

export function sanitizeEmbedFields(
  fields: EmbedFieldInput[] | undefined,
): EmbedFieldInput[] | undefined {
  if (!fields?.length) return undefined;
  const out: EmbedFieldInput[] = [];
  for (const field of fields) {
    if (out.length >= EMBED_FIELDS_MAX) break;
    const name = field.name?.trim().slice(0, EMBED_FIELD_NAME_MAX) ?? "";
    const value = field.value?.trim().slice(0, EMBED_FIELD_VALUE_MAX) ?? "";
    if (!name || !value) continue;
    out.push({ name, value, inline: Boolean(field.inline) });
  }
  return out.length ? out : undefined;
}

export function sanitizeLinkActionRows(
  rows: MessageActionRowInput[] | undefined,
): MessageActionRowInput[] | undefined {
  if (!rows?.length) return undefined;
  const out: MessageActionRowInput[] = [];
  for (const row of rows.slice(0, MESSAGE_ACTION_ROWS_MAX)) {
    const buttons: MessageButtonInput[] = [];
    for (const button of row.buttons ?? []) {
      if (buttons.length >= MESSAGE_BUTTONS_PER_ROW_MAX) break;
      if (button.style !== "Link") continue;
      const label = button.label.trim().slice(0, MESSAGE_BUTTON_LABEL_MAX);
      const url = button.url?.trim() ?? "";
      if (!label || !isHttpUrl(url)) continue;
      buttons.push({
        label,
        style: "Link",
        url: url.slice(0, 500),
        disabled: Boolean(button.disabled) || undefined,
        emoji: button.emoji?.trim() || undefined,
      });
    }
    if (buttons.length) out.push({ buttons });
  }
  return out.length ? out : undefined;
}

export function embedCharacterCount(input: {
  title?: string;
  description?: string;
  authorName?: string;
  footerText?: string;
  fields?: EmbedFieldInput[];
}): number {
  const fieldChars = (input.fields ?? []).reduce(
    (sum, field) => sum + field.name.length + field.value.length,
    0,
  );
  return (
    (input.title?.length ?? 0) +
    (input.description?.length ?? 0) +
    (input.authorName?.length ?? 0) +
    (input.footerText?.length ?? 0) +
    fieldChars
  );
}

/**
 * URL que se puede reabrir en el editor: CDN de Discord o la original
 * http(s)/uploads. Nunca `attachment://`.
 */
export function persistEmbedMediaUrl(
  original: string | undefined,
  discordCdn?: string | null,
): string | undefined {
  const cdn = discordCdn?.trim();
  if (cdn && isHttpUrl(cdn)) return cdn.slice(0, 500);
  const orig = original?.trim();
  if (!orig || orig.startsWith("attachment://")) return undefined;
  if (isHttpUrl(orig) || orig.startsWith("/uploads/"))
    return orig.slice(0, 500);
  return undefined;
}

/** Agrupa fields como Discord: inline de a 3; no-inline a ancho completo. */
export function groupEmbedFields(
  fields: EmbedFieldInput[],
): EmbedFieldInput[][] {
  const rows: EmbedFieldInput[][] = [];
  let current: EmbedFieldInput[] = [];
  for (const field of fields) {
    if (!field.inline) {
      if (current.length) {
        rows.push(current);
        current = [];
      }
      rows.push([field]);
      continue;
    }
    if (current.length === 3) {
      rows.push(current);
      current = [];
    }
    current.push(field);
  }
  if (current.length) rows.push(current);
  return rows;
}
