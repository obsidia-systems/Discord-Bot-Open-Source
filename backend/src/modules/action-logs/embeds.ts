import { EmbedBuilder } from "discord.js";
import type {
  ActionLogEmbedTone,
  ActionLogEntry,
} from "@adobos/shared";
import { ACTION_LOG_EMBED_COLORS } from "@adobos/shared";

/** Límite duro de Discord para el valor de un Field. */
const FIELD_VALUE_MAX = 1024;

export interface BuildActionLogEmbedInput {
  entry: ActionLogEntry;
  /** Nombre técnico del evento (ej. "Mensaje eliminado"). */
  actionLabel: string;
  tone: ActionLogEmbedTone;
  /** Author = ejecutor (o autor original si ejecutor desconocido). */
  authorTag?: string | null;
  authorAvatarURL?: string | null;
  executorUnknown?: boolean;
  affectedUserId?: string | null;
  /** Avatar del usuario afectado (footer.iconURL). */
  targetAvatarURL?: string | null;
  /** Avatar del bot / sistema (fallback de footer). */
  systemAvatarURL?: string | null;
  messageId?: string | null;
}

/**
 * Estilo Technical-Organized:
 * Author (ejecutor + ID) · **Acción:** · fields · footer (afectado + avatar).
 */
export function buildActionLogEmbed(
  input: BuildActionLogEmbedInput,
): EmbedBuilder {
  const { entry, tone, actionLabel } = input;

  const lines = [`**Acción:** ${actionLabel}`];
  if (input.executorUnknown) {
    lines.push("**Ejecutor:** Desconocido");
  }

  const embed = new EmbedBuilder()
    .setColor(ACTION_LOG_EMBED_COLORS[tone])
    .setDescription(truncate(lines.join("\n"), 4096))
    .setTimestamp(new Date(entry.createdAt));

  const authorName = buildAuthorName(
    input.authorTag?.trim() || entry.executorTag?.trim() || null,
    input.executorUnknown ? null : entry.executorId,
  );
  if (authorName) {
    embed.setAuthor({
      name: authorName,
      iconURL: input.authorAvatarURL || undefined,
    });
  }

  const footer = buildFooter(input);
  embed.setFooter(footer);

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (entry.channelId) {
    fields.push({
      name: "Canal",
      value: `<#${entry.channelId}>`,
      inline: true,
    });
  }

  const affectedId = input.affectedUserId ?? entry.targetId;
  if (isSnowflake(affectedId)) {
    fields.push({
      name: "Afectado",
      value: `<@${affectedId}>`,
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

  if (oldContent !== null && newContent === null) {
    fields.push({
      name: "Contenido original",
      value: formatContentField(oldContent || "(vacío)"),
      inline: false,
    });
  } else if (oldContent !== null || newContent !== null) {
    if (oldContent !== null) {
      fields.push({
        name: "Antes",
        value: formatContentField(oldContent || "(vacío)"),
        inline: false,
      });
    }
    if (newContent !== null) {
      fields.push({
        name: "Después",
        value: formatContentField(newContent || "(vacío)"),
        inline: false,
      });
    }
  }

  const metaFields = fields.filter((f) => f.inline);
  const contentFields = fields.filter((f) => !f.inline).slice(0, 2);
  for (const field of [...metaFields, ...contentFields]) {
    embed.addFields(field);
  }

  return embed;
}

function isSnowflake(id: string | null | undefined): id is string {
  return Boolean(id && /^\d{17,20}$/.test(id));
}

/** Author: `tag (ID: snowflake)` — sin duplicar ID en el footer. */
function buildAuthorName(
  tag: string | null,
  executorId: string | null | undefined,
): string | null {
  if (!tag) {
    if (isSnowflake(executorId)) {
      return `Desconocido (ID: ${executorId})`.slice(0, 256);
    }
    return null;
  }
  if (isSnowflake(executorId)) {
    return `${tag} (ID: ${executorId})`.slice(0, 256);
  }
  return tag.slice(0, 256);
}

function buildFooter(input: BuildActionLogEmbedInput): {
  text: string;
  iconURL?: string;
} {
  const executorId = input.entry.executorId;
  const affectedId = input.affectedUserId ?? input.entry.targetId;
  const messageId =
    input.messageId ||
    (typeof input.entry.details.messageId === "string"
      ? input.entry.details.messageId
      : null);

  // Usuario afectado (snowflake) → avatar + ID en footer
  if (isSnowflake(affectedId)) {
    const parts = [`Afectado ID: ${affectedId}`];
    if (messageId) parts.push(`Msg ID: ${messageId}`);
    return {
      text: truncate(parts.join(" • "), 2048),
      iconURL: input.targetAvatarURL || undefined,
    };
  }

  // Sin usuario afectado (canal, rol, invite, etc.)
  const parts: string[] = [];
  if (isSnowflake(executorId)) {
    parts.push(`Ejecutado por ID: ${executorId}`);
  } else if (input.executorUnknown) {
    parts.push("Ejecutor: desconocido");
  } else {
    parts.push("Adobos Bot");
  }
  if (messageId) parts.push(`Msg ID: ${messageId}`);

  return {
    text: truncate(parts.join(" • "), 2048),
    iconURL: input.systemAvatarURL || undefined,
  };
}

function formatContentField(raw: string): string {
  const text = raw.trim() || "(vacío)";
  const lineCount = text.split("\n").length;
  if (lineCount > 8) {
    return codeBlock(text);
  }
  return asBlockquote(text);
}

function asBlockquote(value: string): string {
  const truncated = truncate(value, FIELD_VALUE_MAX - 8);
  const quoted = truncated
    .split("\n")
    .map((line) => `> ${line || "\u200b"}`)
    .join("\n");
  return truncate(quoted, FIELD_VALUE_MAX);
}

function codeBlock(value: string): string {
  const innerMax = FIELD_VALUE_MAX - 8;
  const truncated = truncate(value, innerMax);
  const escaped = truncated.replace(/```/g, "`\u200b``");
  return truncate(`\`\`\`\n${escaped}\n\`\`\``, FIELD_VALUE_MAX);
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 3) return value.slice(0, max);
  return `${value.slice(0, max - 3)}...`;
}
