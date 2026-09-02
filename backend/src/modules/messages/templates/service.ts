import { and, desc, eq } from "drizzle-orm";
import {
  sanitizeEmbedFields,
  sanitizeLinkActionRows,
  type EmbedPayload,
  type EmbedTemplateDetail,
  type EmbedTemplateListResponse,
  type SaveEmbedTemplateRequest,
  type SaveEmbedTemplateResponse,
} from "@adobos/shared";
import { getDb, one } from "../../../db/client.js";
import { embedTemplates, guildSettings } from "../../../db/schema.js";

export class EmbedTemplateError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "EmbedTemplateError";
  }
}

function assertSnowflake(value: string, field: string): string {
  const trimmed = value.trim();
  if (!/^\d{17,20}$/.test(trimmed)) {
    throw new EmbedTemplateError(
      `${field} inválido.`,
      400,
      "INVALID_IDS",
    );
  }
  return trimmed;
}

function resolveGuildId(guildIdRaw?: string): string {
  return assertSnowflake(
    guildIdRaw?.trim() || "",
    "guildId",
  );
}

async function ensureGuildRow(guildId: string): Promise<void> {
  const db = getDb();
  const existing = await one(
    db
    .select()
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId))
    .limit(1)
  );
  if (!existing) {
    await db.insert(guildSettings)
      .values({
        guildId,
        prefix: "!",
        welcomeEnabled: false,
        updatedAt: new Date(),
      })
      ;
  }
}

function parseEmbedData(raw: string): EmbedPayload {
  try {
    const parsed = JSON.parse(raw) as EmbedPayload;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("invalid");
    }
    return parsed;
  } catch {
    throw new EmbedTemplateError(
      "embedData JSON inválido.",
      400,
      "INVALID_EMBED_DATA",
    );
  }
}

function isAllowedMediaRef(value: string): boolean {
  if (value.startsWith("/uploads/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeEmbedPayload(input: EmbedPayload): EmbedPayload {
  const pickMedia = (value?: string): string | undefined => {
    const trimmed = value?.trim();
    if (!trimmed) return undefined;
    if (!isAllowedMediaRef(trimmed)) {
      throw new EmbedTemplateError(
        "Las imágenes deben ser URL http(s) o ruta /uploads/…",
        400,
        "INVALID_MEDIA",
      );
    }
    return trimmed.slice(0, 500);
  };

  const pickHttpUrl = (value?: string): string | undefined => {
    const trimmed = value?.trim();
    if (!trimmed) return undefined;
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("bad");
      }
      return trimmed.slice(0, 500);
    } catch {
      throw new EmbedTemplateError(
        "url del título debe ser http(s).",
        400,
        "INVALID_URL",
      );
    }
  };

  return {
    content: input.content?.trim().slice(0, 2000) || undefined,
    title: input.title?.trim().slice(0, 256) || undefined,
    url: pickHttpUrl(input.url),
    description: input.description?.trim().slice(0, 4096) || undefined,
    color: input.color?.trim().slice(0, 16) || undefined,
    authorName: input.authorName?.trim().slice(0, 256) || undefined,
    authorIconUrl: pickMedia(input.authorIconUrl),
    thumbnailUrl: pickMedia(input.thumbnailUrl),
    imageUrl: pickMedia(input.imageUrl),
    footerText: input.footerText?.trim().slice(0, 2048) || undefined,
    footerIconUrl: pickMedia(input.footerIconUrl),
    timestamp: Boolean(input.timestamp),
    fields: sanitizeEmbedFields(input.fields),
    components: sanitizeLinkActionRows(input.components),
  };
}

function toDetail(row: {
  id: number;
  guildId: string;
  name: string;
  embedData: string;
  createdAt: Date | number;
  updatedAt: Date | number;
}): EmbedTemplateDetail {
  const createdAt =
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : new Date(row.createdAt).toISOString();
  const updatedAt =
    row.updatedAt instanceof Date
      ? row.updatedAt.toISOString()
      : new Date(row.updatedAt).toISOString();

  return {
    id: row.id,
    guildId: row.guildId,
    name: row.name,
    embedData: parseEmbedData(row.embedData),
    createdAt,
    updatedAt,
  };
}

export async function listEmbedTemplates(
  guildIdRaw?: string,
): Promise<EmbedTemplateListResponse> {
  const guildId = resolveGuildId(guildIdRaw);
  const rows = await getDb()
    .select()
    .from(embedTemplates)
    .where(eq(embedTemplates.guildId, guildId))
    .orderBy(desc(embedTemplates.updatedAt))
    ;

  return {
    templates: rows.map((row) => {
      const detail = toDetail(row);
      return {
        id: detail.id,
        guildId: detail.guildId,
        name: detail.name,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
      };
    }),
  };
}

export async function getEmbedTemplate(
  id: number,
  guildIdRaw?: string,
): Promise<EmbedTemplateDetail> {
  const guildId = resolveGuildId(guildIdRaw);
  const row = await one(getDb()
    .select()
    .from(embedTemplates)
    .where(
      and(eq(embedTemplates.id, id), eq(embedTemplates.guildId, guildId)),
    )
    .limit(1));

  if (!row) {
    throw new EmbedTemplateError(
      "Plantilla no encontrada.",
      404,
      "TEMPLATE_NOT_FOUND",
    );
  }

  return toDetail(row);
}

export async function saveEmbedTemplate(
  input: SaveEmbedTemplateRequest,
  uploadedPaths?: {
    imageUrl?: string;
    thumbnailUrl?: string;
    authorIconUrl?: string;
    footerIconUrl?: string;
  },
): Promise<SaveEmbedTemplateResponse> {
  const guildId = resolveGuildId(input.guildId);
  const name = input.name.trim().slice(0, 80);
  if (!name) {
    throw new EmbedTemplateError(
      "El nombre de la plantilla es obligatorio.",
      400,
      "MISSING_NAME",
    );
  }

  const merged: EmbedPayload = {
    ...(input.embedData ?? {}),
    ...(uploadedPaths?.imageUrl
      ? { imageUrl: uploadedPaths.imageUrl }
      : {}),
    ...(uploadedPaths?.thumbnailUrl
      ? { thumbnailUrl: uploadedPaths.thumbnailUrl }
      : {}),
    ...(uploadedPaths?.authorIconUrl
      ? { authorIconUrl: uploadedPaths.authorIconUrl }
      : {}),
    ...(uploadedPaths?.footerIconUrl
      ? { footerIconUrl: uploadedPaths.footerIconUrl }
      : {}),
  };

  const embedData = sanitizeEmbedPayload(merged);
  const hasBody = Boolean(
    embedData.title ||
      embedData.description ||
      embedData.authorName ||
      embedData.footerText ||
      embedData.imageUrl ||
      embedData.thumbnailUrl ||
      embedData.content ||
      embedData.fields?.length ||
      embedData.components?.length,
  );
  if (!hasBody) {
    throw new EmbedTemplateError(
      "La plantilla no puede estar vacía.",
      400,
      "EMPTY_EMBED",
    );
  }

  await ensureGuildRow(guildId);
  const db = getDb();
  const now = new Date();
  const json = JSON.stringify(embedData);

  if (input.id != null) {
    const id = Number(input.id);
    if (!Number.isFinite(id)) {
      throw new EmbedTemplateError("id inválido.", 400, "INVALID_ID");
    }
    const existing = await one(
      db
        .select()
        .from(embedTemplates)
        .where(
          and(eq(embedTemplates.id, id), eq(embedTemplates.guildId, guildId)),
        )
        .limit(1),
    );
    if (!existing) {
      throw new EmbedTemplateError(
        "Plantilla no encontrada.",
        404,
        "TEMPLATE_NOT_FOUND",
      );
    }
    await db
      .update(embedTemplates)
      .set({ name, embedData: json, updatedAt: now })
      .where(
        and(eq(embedTemplates.id, id), eq(embedTemplates.guildId, guildId)),
      );
    return { ok: true, template: await getEmbedTemplate(id, guildId) };
  }

  const [inserted] = await db
    .insert(embedTemplates)
    .values({
      guildId,
      name,
      embedData: json,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: embedTemplates.id });
  if (!inserted) {
    throw new EmbedTemplateError(
      "No se pudo guardar la plantilla.",
      500,
      "INSERT_FAILED",
    );
  }
  return { ok: true, template: await getEmbedTemplate(inserted.id, guildId) };
}

export async function deleteEmbedTemplate(
  idRaw: string,
  guildIdRaw?: string,
): Promise<{ ok: true }> {
  const guildId = resolveGuildId(guildIdRaw);
  const id = Number.parseInt(idRaw, 10);
  if (!Number.isFinite(id)) {
    throw new EmbedTemplateError("id inválido.", 400, "INVALID_ID");
  }

  const existing = await one(getDb()
    .select()
    .from(embedTemplates)
    .where(
      and(eq(embedTemplates.id, id), eq(embedTemplates.guildId, guildId)),
    )
    .limit(1));

  if (!existing) {
    throw new EmbedTemplateError(
      "Plantilla no encontrada.",
      404,
      "TEMPLATE_NOT_FOUND",
    );
  }

  await getDb()
    .delete(embedTemplates)
    .where(
      and(eq(embedTemplates.id, id), eq(embedTemplates.guildId, guildId)),
    );
  return { ok: true };
}
