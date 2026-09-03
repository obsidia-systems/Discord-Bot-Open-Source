import type { ActionLogEmbedTone, ActionLogEntry } from "@adobos/shared";
import { ACTION_LOG_EMBED_COLORS } from "@adobos/shared";
import { EmbedBuilder } from "discord.js";

/** Límite duro de Discord para el valor de un Field. */
const FIELD_VALUE_MAX = 1024;

export type ActionLogTargetKind =
  | "user"
  | "channel"
  | "role"
  | "emoji"
  | "sticker"
  | "invite"
  | "resource";

export interface BuildActionLogEmbedInput {
  entry: ActionLogEntry;
  /** Nombre técnico del evento (ej. "Mensaje eliminado"). */
  actionLabel: string;
  tone: ActionLogEmbedTone;
  /** Descripción markdown completa (si se omite → **Acción:** label). */
  description?: string | null;
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
  /** Qué representa targetId (evita <@canal> falsos). */
  targetKind?: ActionLogTargetKind;
}

/**
 * Estilo Technical-Organized:
 * Author (ejecutor + ID) · description · fields · footer (afectado/recurso).
 */
export function buildActionLogEmbed(
  input: BuildActionLogEmbedInput,
): EmbedBuilder {
  const { entry, tone, actionLabel } = input;
  const details = entry.details ?? {};
  const targetKind = resolveTargetKind(input);

  const lines: string[] = [];
  if (input.description?.trim()) {
    lines.push(input.description.trim());
  } else {
    lines.push(`**Action:** ${actionLabel}`);
  }
  if (input.executorUnknown) {
    lines.push("**Executor:** Unknown");
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

  const thumb =
    typeof details.thumbnailUrl === "string" && details.thumbnailUrl.trim()
      ? details.thumbnailUrl.trim()
      : null;
  if (thumb) {
    embed.setThumbnail(thumb);
  }

  embed.setFooter(buildFooter(input, targetKind));

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  const channelField = resolveChannelField(entry, details);
  if (channelField) fields.push(channelField);

  // Solo menciones de usuario reales en "Afectado"
  if (
    targetKind === "user" &&
    isSnowflake(input.affectedUserId ?? entry.targetId)
  ) {
    const uid = (input.affectedUserId ?? entry.targetId)!;
    fields.push({
      name: "Afectado",
      value: `<@${uid}>`,
      inline: true,
    });
  } else if (
    targetKind === "role" &&
    typeof details.roleName === "string" &&
    details.roleName.trim()
  ) {
    fields.push({
      name: "Role",
      value: `\`${details.roleName.trim()}\``,
      inline: true,
    });
  }

  if (typeof details.parentName === "string") {
    fields.push({
      name: "Parent Category",
      value: details.parentName.trim() || "None",
      inline: true,
    });
  }

  if (typeof details.roleColor === "string" && details.roleColor.trim()) {
    fields.push({
      name: "Hex Color",
      value: `\`${details.roleColor.trim()}\``,
      inline: true,
    });
  }

  if (
    typeof details.channelTypeName === "string" &&
    details.channelTypeName.trim()
  ) {
    fields.push({
      name: "Type",
      value: details.channelTypeName.trim(),
      inline: true,
    });
  }

  // Diffs estructurados (p. ej. channelUpdate): Nombre, Tópico, Permisos, etc.
  const hasDiffFields = Array.isArray(details.diffFields);
  if (hasDiffFields) {
    for (const raw of details.diffFields as unknown[]) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as { name?: unknown; value?: unknown; inline?: unknown };
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const value = typeof item.value === "string" ? item.value : "";
      if (!name || !value) continue;
      fields.push({
        name: name.slice(0, 256),
        value: truncate(value, FIELD_VALUE_MAX),
        inline: Boolean(item.inline),
      });
    }
  }

  const oldContent =
    typeof details.oldContent === "string" ? details.oldContent : null;
  const newContent =
    typeof details.newContent === "string" ? details.newContent : null;

  // Evitar Antes/Después genéricos cuando ya hay diffFields
  if (!hasDiffFields) {
    if (oldContent !== null && newContent === null) {
      fields.push({
        name: "Original content",
        value: formatContentField(oldContent || "(empty)"),
        inline: false,
      });
    } else if (oldContent !== null || newContent !== null) {
      if (oldContent !== null) {
        fields.push({
          name: "Before",
          value: formatContentField(oldContent || "(empty)"),
          inline: false,
        });
      }
      if (newContent !== null) {
        fields.push({
          name: "After",
          value: formatContentField(newContent || "(empty)"),
          inline: false,
        });
      }
    }
  }

  const metaFields = fields.filter((f) => f.inline);
  const contentFields = fields.filter((f) => !f.inline);
  // Diffs de canal: hasta 20; mensajes: 2 (Antes/Después)
  const contentLimit = hasDiffFields ? 20 : 2;
  for (const field of [
    ...metaFields,
    ...contentFields.slice(0, contentLimit),
  ]) {
    embed.addFields(field);
  }

  return embed;
}

function resolveTargetKind(
  input: BuildActionLogEmbedInput,
): ActionLogTargetKind {
  if (input.targetKind) return input.targetKind;
  const raw = input.entry.details?.targetKind;
  if (
    raw === "user" ||
    raw === "channel" ||
    raw === "role" ||
    raw === "emoji" ||
    raw === "sticker" ||
    raw === "invite" ||
    raw === "resource"
  ) {
    return raw;
  }
  return inferTargetKindFromEventType(input.entry.eventType);
}

function inferTargetKindFromEventType(eventType: string): ActionLogTargetKind {
  if (
    eventType.startsWith("MESSAGE_") ||
    eventType.startsWith("MEMBER_") ||
    eventType.startsWith("VOICE_")
  ) {
    return "user";
  }
  if (eventType.startsWith("CHANNEL_")) return "channel";
  if (eventType.startsWith("ROLE_")) return "role";
  if (eventType.startsWith("EMOJI_")) return "emoji";
  if (eventType.startsWith("STICKER_")) return "sticker";
  if (eventType.startsWith("INVITE_")) return "invite";
  return "resource";
}

/**
 * Canal: mención viva si existe; texto plano `#nombre` en borrados / labels.
 */
function resolveChannelField(
  entry: ActionLogEntry,
  details: Record<string, unknown>,
): { name: string; value: string; inline: boolean } | null {
  const plainLabel =
    typeof details.channelLabel === "string" && details.channelLabel.trim()
      ? details.channelLabel.trim()
      : null;
  const forcePlain =
    details.channelDeleted === true ||
    details.channelPlain === true ||
    Boolean(plainLabel && entry.eventType === "CHANNEL_DELETE");

  if (forcePlain || plainLabel) {
    const name =
      plainLabel ||
      (typeof details.name === "string" && details.name.trim()
        ? `#${details.name.trim()}`
        : "#unnamed-channel");
    const normalized = name.startsWith("#") ? name : `#${name}`;
    return {
      name: "Channel",
      value: `\`${normalized}\``,
      inline: true,
    };
  }

  if (entry.channelId) {
    return {
      name: "Channel",
      value: `<#${entry.channelId}>`,
      inline: true,
    };
  }

  return null;
}

function isSnowflake(id: string | null | undefined): id is string {
  return Boolean(id && /^\d{17,20}$/.test(id));
}

function buildAuthorName(
  tag: string | null,
  executorId: string | null | undefined,
): string | null {
  if (!tag) {
    if (isSnowflake(executorId)) {
      return `Unknown (ID: ${executorId})`.slice(0, 256);
    }
    return null;
  }
  if (isSnowflake(executorId)) {
    return `${tag} (ID: ${executorId})`.slice(0, 256);
  }
  return tag.slice(0, 256);
}

function resourceFooterLabel(kind: ActionLogTargetKind): string {
  switch (kind) {
    case "channel":
      return "Channel ID";
    case "role":
      return "Role ID";
    case "emoji":
      return "Emoji ID";
    case "sticker":
      return "Sticker ID";
    case "invite":
      return "Invite";
    default:
      return "Resource ID";
  }
}

function buildFooter(
  input: BuildActionLogEmbedInput,
  targetKind: ActionLogTargetKind,
): {
  text: string;
  iconURL?: string;
} {
  const executorId = input.entry.executorId;
  const targetId = input.affectedUserId ?? input.entry.targetId;
  const messageId =
    input.messageId ||
    (typeof input.entry.details.messageId === "string"
      ? input.entry.details.messageId
      : null);

  if (targetKind === "user" && isSnowflake(targetId)) {
    const parts = [`Affected ID: ${targetId}`];
    if (messageId) parts.push(`Msg ID: ${messageId}`);
    return {
      text: truncate(parts.join(" • "), 2048),
      iconURL: input.targetAvatarURL || undefined,
    };
  }

  if (isSnowflake(targetId) || (targetId && targetKind === "invite")) {
    const parts = [`${resourceFooterLabel(targetKind)}: ${targetId}`];
    if (messageId) parts.push(`Msg ID: ${messageId}`);
    return {
      text: truncate(parts.join(" • "), 2048),
      iconURL: input.systemAvatarURL || undefined,
    };
  }

  const parts: string[] = [];
  if (isSnowflake(executorId)) {
    parts.push(`Executed by ID: ${executorId}`);
  } else if (input.executorUnknown) {
    parts.push("Executor: unknown");
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
  const text = raw.trim() || "(empty)";
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
