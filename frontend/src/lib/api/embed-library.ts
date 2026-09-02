import type {
  DeleteSentEmbedResponse,
  EditSentEmbedResponse,
  EmbedLibraryResponse,
  SendEmbedRequest,
  SendEmbedResponse,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";
import type { EmbedMediaValue, SendEmbedPayload } from "./messages";

function appendOptional(
  body: FormData,
  key: string,
  value: string | undefined,
): void {
  if (value !== undefined && value !== "") {
    body.append(key, value);
  }
}

function splitMedia(value: EmbedMediaValue | undefined): {
  url?: string;
  file?: File;
} {
  if (value instanceof File) return { file: value };
  if (typeof value === "string" && value.trim()) {
    return { url: value.trim() };
  }
  return {};
}

function buildEmbedBody(payload: SendEmbedPayload): {
  hasFiles: boolean;
  formData?: FormData;
  json?: SendEmbedRequest;
} {
  const image = splitMedia(payload.imageUrl);
  const thumbnail = splitMedia(payload.thumbnailUrl);
  const authorIcon = splitMedia(payload.authorIconUrl);
  const footerIcon = splitMedia(payload.footerIconUrl);
  const hasFiles = Boolean(
    image.file || thumbnail.file || authorIcon.file || footerIcon.file,
  );

  if (hasFiles) {
    const body = new FormData();
    body.append("channelId", payload.channelId);
    appendOptional(body, "content", payload.content);
    appendOptional(body, "title", payload.title);
    appendOptional(body, "url", payload.url);
    appendOptional(body, "description", payload.description);
    appendOptional(body, "color", payload.color);
    appendOptional(body, "authorName", payload.authorName);
    appendOptional(body, "footerText", payload.footerText);
    if (typeof payload.timestamp === "boolean") {
      body.append("timestamp", payload.timestamp ? "true" : "false");
    }
    if (payload.components && payload.components.length > 0) {
      body.append("components", JSON.stringify(payload.components));
    }
    if (payload.fields && payload.fields.length > 0) {
      body.append("fields", JSON.stringify(payload.fields));
    }
    appendOptional(body, "imageUrl", image.url);
    appendOptional(body, "thumbnailUrl", thumbnail.url);
    appendOptional(body, "authorIconUrl", authorIcon.url);
    appendOptional(body, "footerIconUrl", footerIcon.url);
    if (image.file) body.append("image", image.file);
    if (thumbnail.file) body.append("thumbnail", thumbnail.file);
    if (authorIcon.file) body.append("authorIcon", authorIcon.file);
    if (footerIcon.file) body.append("footerIcon", footerIcon.file);
    return { hasFiles: true, formData: body };
  }

  return {
    hasFiles: false,
    json: {
      channelId: payload.channelId,
      content: payload.content,
      title: payload.title,
      url: payload.url,
      description: payload.description,
      color: payload.color,
      authorName: payload.authorName,
      authorIconUrl: authorIcon.url,
      thumbnailUrl: thumbnail.url,
      imageUrl: image.url,
      footerText: payload.footerText,
      footerIconUrl: footerIcon.url,
      timestamp: payload.timestamp,
      fields: payload.fields,
      components: payload.components,
    },
  };
}

export async function fetchEmbedLibrary(): Promise<EmbedLibraryResponse> {
  const response = await apiFetch(`/api/embeds/library`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Error al cargar biblioteca (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<EmbedLibraryResponse>;
}

/** Envía embed y lo registra en sent_embeds. */
export async function sendEmbedToLibrary(
  payload: SendEmbedPayload,
): Promise<SendEmbedResponse> {
  const built = buildEmbedBody(payload);
  const response = built.hasFiles
    ? await apiFetch(`/api/embeds/send`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: built.formData,
      })
    : await apiFetch(`/api/embeds/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(built.json),
      });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Error al enviar embed (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<SendEmbedResponse>;
}

export async function editSentEmbed(
  id: string,
  payload: SendEmbedPayload,
): Promise<EditSentEmbedResponse> {
  const built = buildEmbedBody(payload);
  const response = built.hasFiles
    ? await apiFetch(`/api/embeds/edit-sent/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { Accept: "application/json" },
        body: built.formData,
      })
    : await apiFetch(`/api/embeds/edit-sent/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(built.json),
      });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Error al editar mensaje (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<EditSentEmbedResponse>;
}

export async function deleteSentEmbed(
  id: string,
): Promise<DeleteSentEmbedResponse> {
  const response = await apiFetch(
    `/api/embeds/sent/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Error al eliminar mensaje (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<DeleteSentEmbedResponse>;
}
