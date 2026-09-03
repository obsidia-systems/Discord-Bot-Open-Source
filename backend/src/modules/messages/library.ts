import type {
  DeleteSentEmbedResponse,
  EditSentEmbedRequest,
  EditSentEmbedResponse,
  EmbedLibraryResponse,
  EmbedPayload,
  SendEmbedRequest,
  SendEmbedResponse,
  SentEmbedRecord,
} from "@adobos/shared";
import type { Client } from "discord.js";
import { desc, eq } from "drizzle-orm";
import { getDb, one } from "#db/client.js";
import { sentEmbeds } from "#db/schema.js";
import {
  deleteDiscordMessage,
  type EmbedUploadedFiles,
  editEmbedMessage,
  MessageSendError,
  sendEmbedMessage,
} from "./api/controller.js";
import { listEmbedTemplates } from "./templates/service.js";

function resolveGuildId(raw?: string): string {
  const guildId = raw?.trim() || "";
  if (!/^\d{17,20}$/.test(guildId)) {
    throw new MessageSendError("Invalid guildId.", 400, "INVALID_GUILD");
  }
  return guildId;
}

function parseEmbedData(raw: string): SentEmbedRecord["embedData"] {
  try {
    const parsed = JSON.parse(raw) as EmbedPayload;
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

export async function getEmbedLibrary(
  bot: Client,
  guildIdRaw?: string,
): Promise<EmbedLibraryResponse> {
  const guildId = resolveGuildId(guildIdRaw);
  const rows = await getDb()
    .select()
    .from(sentEmbeds)
    .where(eq(sentEmbeds.guildId, guildId))
    .orderBy(desc(sentEmbeds.createdAt));

  const guild = bot.guilds.cache.get(guildId);
  const sentMessages = rows.map((row) => {
    const channel = guild?.channels.cache.get(row.channelId);
    return toSentRecord(
      row,
      channel && "name" in channel ? String(channel.name) : null,
    );
  });

  const { templates } = await listEmbedTemplates(guildId);

  return { sentMessages, templates };
}

export async function sendAndRegisterEmbed(
  bot: Client,
  input: SendEmbedRequest,
  uploaded: EmbedUploadedFiles = {},
  guildIdRaw?: string,
): Promise<SendEmbedResponse> {
  const guildId = resolveGuildId(guildIdRaw);
  return await sendEmbedMessage(bot, input, uploaded, guildId);
}

export async function editSentEmbed(
  bot: Client,
  id: string,
  input: EditSentEmbedRequest,
  uploaded: EmbedUploadedFiles = {},
  guildIdRaw?: string,
): Promise<EditSentEmbedResponse> {
  const guildId = resolveGuildId(guildIdRaw);
  const row = await one(
    getDb().select().from(sentEmbeds).where(eq(sentEmbeds.id, id)).limit(1),
  );

  if (!row || row.guildId !== guildId) {
    throw new MessageSendError("Sent message not found.", 404, "NOT_FOUND");
  }

  const payload: SendEmbedRequest = {
    channelId: row.channelId,
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
    fields: input.fields,
    components: input.components,
  };

  const { orphaned, snapshot } = await editEmbedMessage(
    bot,
    row.channelId,
    row.messageId,
    payload,
    uploaded,
    guildId,
  );

  if (orphaned) {
    await getDb().delete(sentEmbeds).where(eq(sentEmbeds.id, id));
    return {
      ok: true,
      orphaned: true,
      entry: toSentRecord(row),
    };
  }

  const now = new Date();
  await getDb()
    .update(sentEmbeds)
    .set({
      title:
        payload.title?.trim() || payload.content?.slice(0, 80) || row.title,
      embedData: JSON.stringify(snapshot ?? payload),
      updatedAt: now,
    })
    .where(eq(sentEmbeds.id, id));

  const updated = await one(
    getDb().select().from(sentEmbeds).where(eq(sentEmbeds.id, id)).limit(1),
  );
  if (!updated) {
    throw new MessageSendError("Message not found.", 404, "NOT_FOUND");
  }

  return { ok: true, entry: toSentRecord(updated), orphaned: false };
}

export async function deleteSentEmbed(
  bot: Client,
  id: string,
  guildIdRaw?: string,
): Promise<DeleteSentEmbedResponse> {
  const guildId = resolveGuildId(guildIdRaw);
  const row = await one(
    getDb().select().from(sentEmbeds).where(eq(sentEmbeds.id, id)).limit(1),
  );

  if (!row || row.guildId !== guildId) {
    throw new MessageSendError("Sent message not found.", 404, "NOT_FOUND");
  }

  const { orphaned } = await deleteDiscordMessage(
    bot,
    row.channelId,
    row.messageId,
    guildId,
  );

  await getDb().delete(sentEmbeds).where(eq(sentEmbeds.id, id));

  return { ok: true, deletedId: id, orphaned };
}
