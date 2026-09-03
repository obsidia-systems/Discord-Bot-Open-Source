import type {
  DeleteEmbedTemplateResponse,
  EmbedPayload,
  EmbedTemplateDetail,
  EmbedTemplateListResponse,
  SaveEmbedTemplateResponse,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export type TemplateMediaValue = string | File | null | undefined;

export interface SaveEmbedTemplateMediaInput {
  id?: number;
  guildId?: string;
  name: string;
  embedData: EmbedPayload;
  imageUrl?: TemplateMediaValue;
  thumbnailUrl?: TemplateMediaValue;
  authorIconUrl?: TemplateMediaValue;
  footerIconUrl?: TemplateMediaValue;
}

function splitMedia(value: TemplateMediaValue): {
  url?: string;
  file?: File;
} {
  if (value instanceof File) return { file: value };
  if (typeof value === "string" && value.trim()) {
    return { url: value.trim() };
  }
  return {};
}

export async function listEmbedTemplates(
  guildId?: string,
): Promise<EmbedTemplateListResponse> {
  const query = guildId
    ? `?guildId=${encodeURIComponent(guildId)}`
    : "";
  const response = await apiFetch(`/api/embeds/templates${query}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't list templates (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<EmbedTemplateListResponse>;
}

export async function fetchEmbedTemplate(
  id: number,
  guildId?: string,
): Promise<EmbedTemplateDetail> {
  const query = guildId
    ? `?guildId=${encodeURIComponent(guildId)}`
    : "";
  const response = await apiFetch(
    `/api/embeds/templates/${encodeURIComponent(String(id))}${query}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't load template (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<EmbedTemplateDetail>;
}

/**
 * Guarda plantilla. Con archivos locales usa multipart;
 * si solo hay URLs/rutas, JSON.
 */
export async function saveEmbedTemplate(
  payload: SaveEmbedTemplateMediaInput,
): Promise<SaveEmbedTemplateResponse> {
  const image = splitMedia(payload.imageUrl);
  const thumbnail = splitMedia(payload.thumbnailUrl);
  const authorIcon = splitMedia(payload.authorIconUrl);
  const footerIcon = splitMedia(payload.footerIconUrl);
  const hasFiles = Boolean(
    image.file || thumbnail.file || authorIcon.file || footerIcon.file,
  );

  const embedData: EmbedPayload = {
    ...payload.embedData,
    imageUrl: image.url ?? (image.file ? undefined : payload.embedData.imageUrl),
    thumbnailUrl:
      thumbnail.url ??
      (thumbnail.file ? undefined : payload.embedData.thumbnailUrl),
    authorIconUrl:
      authorIcon.url ??
      (authorIcon.file ? undefined : payload.embedData.authorIconUrl),
    footerIconUrl:
      footerIcon.url ??
      (footerIcon.file ? undefined : payload.embedData.footerIconUrl),
  };

  let response: Response;

  if (hasFiles) {
    const body = new FormData();
    body.append("name", payload.name);
    if (payload.id != null) body.append("id", String(payload.id));
    if (payload.guildId) body.append("guildId", payload.guildId);
    body.append("embedData", JSON.stringify(embedData));
    if (image.file) body.append("image", image.file);
    if (thumbnail.file) body.append("thumbnail", thumbnail.file);
    if (authorIcon.file) body.append("authorIcon", authorIcon.file);
    if (footerIcon.file) body.append("footerIcon", footerIcon.file);

    response = await apiFetch(`/api/embeds/templates`, {
      method: "POST",
      headers: { Accept: "application/json" },
      body,
    });
  } else {
    response = await apiFetch(`/api/embeds/templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        id: payload.id,
        guildId: payload.guildId,
        name: payload.name,
        embedData,
      }),
    });
  }

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't save template (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<SaveEmbedTemplateResponse>;
}

export async function deleteEmbedTemplate(
  id: number,
  guildId?: string,
): Promise<DeleteEmbedTemplateResponse> {
  const query = guildId
    ? `?guildId=${encodeURIComponent(guildId)}`
    : "";
  const response = await apiFetch(
    `/api/embeds/templates/${encodeURIComponent(String(id))}${query}`,
    { method: "DELETE", headers: { Accept: "application/json" } },
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't delete template (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<DeleteEmbedTemplateResponse>;
}
