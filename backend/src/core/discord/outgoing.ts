import type { AttachmentBuilder } from "discord.js";
import type { OutgoingMessage } from "./botGateway.js";

/**
 * `AttachmentBuilder[]` (respaldados por Buffer, como los produce
 * `resolveEmbedMedia`) → la forma `{ name, data }[]` que espera `BotGateway`.
 */
export function attachmentsToOutgoingFiles(
  files: AttachmentBuilder[],
): OutgoingMessage["files"] {
  if (files.length === 0) return undefined;
  return files.map((file) => ({
    name: file.name ?? "file",
    data: file.attachment as Buffer,
  }));
}
