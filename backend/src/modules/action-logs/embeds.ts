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
  /** Descripción principal (puede ir sin emoji; se antepone `emoji` si falta). */
  description: string;
  emoji: string;
  tone: ActionLogEmbedTone;
  /** Author del embed = quien ejecutó (o autor original si ejecutor desconocido). */
  authorTag?: string | null;
  authorAvatarURL?: string | null;
  /** Ejecutor real desconocido (p. ej. delete sin audit). */
  executorUnknown?: boolean;
  /** Mostrar field "Usuario afectado" si difiere del ejecutor. */
  affectedUserId?: string | null;
  messageId?: string | null;
  /** ID prioritario para el footer (ejecutor o afectado). */
  footerUserId?: string | null;
}

/**
 * Diseño Fusion de Action Logs:
 * Author (ejecutor) · Description con emoji · Fields limpios (≤3) ·
 * IDs técnicos solo en Footer · colores semánticos.
 */
export function buildActionLogEmbed(
  input: BuildActionLogEmbedInput,
): EmbedBuilder {
  const { entry, tone, emoji } = input;

  let description = (input.description || entry.summary || "—").trim();
  if (input.executorUnknown) {
    if (!/desconocido/i.test(description)) {
      description = `${description} · Ejecutor: **Desconocido**`;
    }
  }
  if (emoji && !description.startsWith(emoji)) {
    description = `${emoji} ${description}`;
  }

  const embed = new EmbedBuilder()
    .setColor(ACTION_LOG_EMBED_COLORS[tone])
    .setDescription(truncate(description, 4096))
    .setTimestamp(new Date(entry.createdAt))
    .setFooter({ text: buildFooterText(input) });

  const authorName = input.authorTag?.trim() || entry.executorTag?.trim();
  if (authorName) {
    embed.setAuthor({
      name: authorName.slice(0, 256),
      iconURL: input.authorAvatarURL || undefined,
    });
  }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  const affectedId = input.affectedUserId ?? entry.targetId;
  const executorId = entry.executorId;
  const showAffected =
    Boolean(affectedId) &&
    affectedId !== executorId &&
    // En deletes con ejecutor desconocido, el author ya es el autor original
    !(input.executorUnknown && affectedId === input.footerUserId);

  if (showAffected && affectedId) {
    fields.push({
      name: "Usuario afectado",
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

  // Contenido: blockquote; code block solo si hay muchos saltos de línea complejos
  if (oldContent !== null && newContent === null) {
    fields.push({
      name: "Contenido",
      value: formatContentField(oldContent || "(vacío)"),
    });
  } else if (oldContent !== null || newContent !== null) {
    if (oldContent !== null) {
      fields.push({
        name: "Antes",
        value: formatContentField(oldContent || "(vacío)"),
      });
    }
    if (newContent !== null && fields.length < 3) {
      fields.push({
        name: "Después",
        value: formatContentField(newContent || "(vacío)"),
      });
    }
  }

  // Máximo 3 fields para mantener el embed escaneable
  for (const field of fields.slice(0, 3)) {
    embed.addFields(field);
  }

  return embed;
}

function buildFooterText(input: BuildActionLogEmbedInput): string {
  const parts: string[] = [];
  const userId =
    input.footerUserId ||
    input.entry.executorId ||
    input.entry.targetId ||
    null;
  if (userId) parts.push(`User ID: ${userId}`);

  const messageId =
    input.messageId ||
    (typeof input.entry.details.messageId === "string"
      ? input.entry.details.messageId
      : null);
  if (messageId) parts.push(`Msg ID: ${messageId}`);

  const left = parts.length > 0 ? parts.join(" • ") : null;
  const footer = left ? `${left} | Adobos Bot` : "Adobos Bot";
  return truncate(footer, 2048);
}

function formatContentField(raw: string): string {
  const text = raw.trim() || "(vacío)";
  const lineCount = text.split("\n").length;
  // Textos muy fragmentados: code block; el resto blockquote (más legible)
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
