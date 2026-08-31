import fs from "node:fs";

export type SniffedImageMime =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/gif";

const EXT_BY_MIME: Record<SniffedImageMime, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/** Detecta PNG / JPEG / WEBP por magic bytes. No confía en `file.mimetype`. */
export function sniffImageMime(buf: Buffer): SniffedImageMime | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (buf.length >= 6) {
    const header = buf.toString("ascii", 0, 6);
    if (header === "GIF87a" || header === "GIF89a") return "image/gif";
  }
  return null;
}

export function extensionForMime(mime: SniffedImageMime): string {
  return EXT_BY_MIME[mime];
}

export function sniffImageFile(filePath: string): SniffedImageMime | null {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(16);
    const read = fs.readSync(fd, buf, 0, 16, 0);
    return sniffImageMime(buf.subarray(0, read));
  } finally {
    fs.closeSync(fd);
  }
}
