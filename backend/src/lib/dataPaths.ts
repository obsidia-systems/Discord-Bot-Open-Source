import fs from "node:fs";
import path from "node:path";

/** Directorio de datos (uploads). Independiente de DATABASE_URL. */
export function getDataRoot(): string {
  const raw = process.env.DATA_DIR?.trim();
  if (raw) return path.resolve(raw);
  return path.resolve("./data");
}

export function getUploadsRoot(): string {
  return path.join(getDataRoot(), "uploads");
}

export function getBackgroundsDir(): string {
  const dir = path.join(getUploadsRoot(), "backgrounds");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Imágenes genéricas (embeds, iconos, thumbnails…). */
export function getImagesDir(): string {
  const dir = path.join(getUploadsRoot(), "images");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Imágenes de plantillas de embed. */
export function getTemplatesDir(): string {
  const dir = path.join(getUploadsRoot(), "templates");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Convierte `/uploads/backgrounds/x.png` → ruta absoluta segura.
 * Rechaza path traversal.
 */
export function resolvePublicUploadPath(publicPath: string): string | null {
  const trimmed = publicPath.trim();
  if (!trimmed.startsWith("/uploads/")) return null;

  const relative = trimmed.slice("/uploads/".length);
  if (!relative || relative.includes("\0")) return null;

  const uploadsRoot = path.resolve(getUploadsRoot());
  const absolute = path.resolve(uploadsRoot, relative);
  if (
    absolute !== uploadsRoot &&
    !absolute.startsWith(`${uploadsRoot}${path.sep}`)
  ) {
    return null;
  }
  return absolute;
}
