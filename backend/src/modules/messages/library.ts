import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { Client } from "discord.js";
import type {
  DeleteSentEmbedResponse,
  EditSentEmbedRequest,
  EditSentEmbedResponse,
  EmbedLibraryResponse,
  EmbedPayload,
  MessageActionRowInput,
  SendEmbedRequest,
  SendEmbedResponse,
  SentEmbedRecord,
} from "@adobos/shared";
import { getDb } from "../../db/client.js";
import { sentEmbeds } from "../../db/schema.js";
import { listEmbedTemplates } from "./templates/service.js";
import {
  deleteDiscordMessage,
  editEmbedMessage,
  MessageSendError,
  sendEmbedMessage,
  type EmbedUploadedFiles,
} from "./api/controller.js";

function resolveGuildId(raw?: string): string {
  const guildId = raw?.trim() || "";
  if (!/^\d{17,20}$/.test(guildId)) {
    throw new MessageSendError("guildId inválido.", 400, "INVALID_GUILD");
  }
  return guildId;
}

function parseEmbedData(raw: string): SentEmbedRecord["embedData"] {
  try {
    const parsed = JSON.parse(raw) as EmbedPayload & {
      components?: MessageActionRowInput[];
    };
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function toSentRecord(
  row: {
    id: string;
    guildId: string;
    channelId: string;
    messageId: string;
    title: string | null;
    embedData: string;
    createdAt: Date | number;
  },
  channelName?: string | null,
): SentEmbedRecord {
  return {
    id: row.id,
    guildId: row.guildId,
    channelId: row.channelId,
    messageId: row.messageId,
    title: row.title,
    embedData: parseEmbedData(row.embedData),
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date(row.createdAt).toISOString(),
    channelName: channelName ?? null,
  };
}

export function getEmbedLibrary(
  bot: Client,
  guildIdRaw?: string,
): EmbedLibraryResponse {
  const guildId = resolveGuildId(guildIdRaw);
  const rows = getDb()
    .select()
    .from(sentEmbeds)
    .where(eq(sentEmbeds.guildId, guildId))
    .orderBy(desc(sentEmbeds.createdAt))
    .all();

  const guild = bot.guilds.cache.get(guildId);
  const sentMessages = rows.map((row) => {
    const channel = guild?.channels.cache.get(row.channelId);
    return toSentRecord(
      row,
      channel && "name" in channel ? String(channel.name) : null,
    );
  });

  const { templates } = listEmbedTemplates(guildId);

  return { sentMessages, templates };
}

export async function sendAndRegisterEmbed(
  bot: Client,
  input: SendEmbedRequest,
  uploaded: EmbedUploadedFiles = {},
  guildIdRaw?: string,
): Promise<SendEmbedResponse> {
  const guildId = resolveGuildId(guildIdRaw);
  return sendEmbedMessage(bot, input, uploaded, guildId);
}

export async function editSentEmbed(
  bot: Client,
  id: string,
  input: EditSentEmbedRequest,
  uploaded: EmbedUploadedFiles = {},
  guildIdRaw?: string,
): Promise<EditSentEmbedResponse> {
  const guildId = resolveGuildId(guildIdRaw);
  const row = getDb()
    .select()
    .from(sentEmbeds)
    .where(eq(sentEmbeds.id, id))
    .get();

  if (!row || row.guildId !== guildId) {
    throw new MessageSendError("Mensaje enviado no encontrado.", 404, "NOT_FOUND");
  }

  const payload: SendEmbedRequest = {
    channelId: input.channelId?.trim() || row.channelId,
    content: input.content,
    title: input.title,
    url: input.url,
    description: input.description,
    color: input.color,
    authorName: input.authorName,
    authorIconUrl: input.authorIconUrl,
    thumbnailUrl: input.thumbnailUrl,
    imageUrl: input.imageUrl,
    footerText: input.footerText,
    footerIconUrl: input.footerIconUrl,
    timestamp: input.timestamp,
    components: input.components,
  };

  const { orphaned } = await editEmbedMessage(
    bot,
    row.channelId,
    row.messageId,
    payload,
    uploaded,
    guildId,
  );

  if (orphaned) {
    getDb().delete(sentEmbeds).where(eq(sentEmbeds.id, id)).run();
    return {
      ok: true,
      orphaned: true,
      entry: toSentRecord(row),
    };
  }

  const snapshot = {
    content: payload.content,
    title: payload.title,
    url: payload.url,
    description: payload.description,
    color: payload.color,
    authorName: payload.authorName,
    authorIconUrl: payload.authorIconUrl,
    thumbnailUrl: payload.thumbnailUrl,
    imageUrl: payload.imageUrl,
    footerText: payload.footerText,
    footerIconUrl: payload.footerIconUrl,
    timestamp: payload.timestamp,
    components: payload.components,
  };

  const now = new Date();
  getDb()
    .update(sentEmbeds)
    .set({
      title: payload.title?.trim() || payload.content?.slice(0, 80) || row.title,
      embedData: JSON.stringify(snapshot),
      updatedAt: now,
      channelId: payload.channelId,
    })
    .where(eq(sentEmbeds.id, id))
    .run();

  const updated = getDb()
    .select()
    .from(sentEmbeds)
    .where(eq(sentEmbeds.id, id))
    .get()!;

  return { ok: true, entry: toSentRecord(updated), orphaned: false };
}

export async function deleteSentEmbed(
  bot: Client,
  id: string,
  guildIdRaw?: string,
): Promise<DeleteSentEmbedResponse> {
  const guildId = resolveGuildId(guildIdRaw);
  const row = getDb()
    .select()
    .from(sentEmbeds)
    .where(eq(sentEmbeds.id, id))
    .get();

  if (!row || row.guildId !== guildId) {
    throw new MessageSendError("Mensaje enviado no encontrado.", 404, "NOT_FOUND");
  }

  const { orphaned } = await deleteDiscordMessage(
    bot,
    row.channelId,
    row.messageId,
    guildId,
  );

  getDb().delete(sentEmbeds).where(eq(sentEmbeds.id, id)).run();

  return { ok: true, deletedId: id, orphaned };
}

/** Utilidad por si se necesita generar IDs fuera del send. */
export function newSentEmbedId(): string {
  return randomUUID();
}
