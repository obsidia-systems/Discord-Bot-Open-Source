import fs from "node:fs";
import path from "node:path";
import { AttachmentBuilder } from "discord.js";
import { resolvePublicUploadPath } from "./dataPaths.js";

export class EmbedMediaError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "EmbedMediaError";
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export interface ResolvedEmbedMedia {
  /** URL http(s) o `attachment://nombre` para discord.js. */
  url?: string;
  /** Adjunto local si la ruta era `/uploads/...`. */
  file?: AttachmentBuilder;
}

/**
 * Acepta URL http(s) o ruta pública local `/uploads/...`.
 * Las rutas locales se adjuntan al mensaje (Discord no puede fetch a localhost).
 */
export function resolveEmbedMedia(
  value: string | undefined,
  field: string,
  attachmentName: string,
): ResolvedEmbedMedia {
  const trimmed = value?.trim();
  if (!trimmed) return {};

  if (isHttpUrl(trimmed)) {
    return { url: trimmed };
  }

  if (trimmed.startsWith("/uploads/")) {
    const absolute = resolvePublicUploadPath(trimmed);
    if (!absolute || !fs.existsSync(absolute)) {
      throw new EmbedMediaError(
        `${field}: archivo local no encontrado (${trimmed}).`,
        400,
        "UPLOAD_NOT_FOUND",
      );
    }
    const ext = path.extname(absolute).toLowerCase() || ".png";
    const name = attachmentName.includes(".")
      ? attachmentName
      : `${attachmentName}${ext}`;
    return {
      url: `attachment://${name}`,
      file: new AttachmentBuilder(absolute, { name }),
    };
  }

  throw new EmbedMediaError(
    `${field} debe ser una URL http(s) o una ruta /uploads/...`,
    400,
    "INVALID_URL",
  );
}

/** Solo URL http(s) (p. ej. URL del título del embed). */
export function requireHttpUrl(
  value: string | undefined,
  field: string,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!isHttpUrl(trimmed)) {
    throw new EmbedMediaError(
      `${field} debe ser una URL http(s) válida.`,
      400,
      "INVALID_URL",
    );
  }
  return trimmed;
}
