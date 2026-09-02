import type {
  SendEmbedRequest,
  SendEmbedResponse,
  SendMessageRequest,
  SendMessageResponse,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export type EmbedMediaValue = string | File | null;

export interface SendEmbedPayload
  extends Omit<
    SendEmbedRequest,
    "imageUrl" | "thumbnailUrl" | "authorIconUrl" | "footerIconUrl"
  > {
  imageUrl?: EmbedMediaValue;
  thumbnailUrl?: EmbedMediaValue;
  authorIconUrl?: EmbedMediaValue;
  footerIconUrl?: EmbedMediaValue;
}

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

export async function sendChannelMessage(
  payload: SendMessageRequest,
): Promise<SendMessageResponse> {
  const response = await apiFetch(`/api/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(response, `Error al enviar (${response.status})`),
    );
  }

  return response.json() as Promise<SendMessageResponse>;
}

/**
 * Envía embed. Si hay `File` locales usa multipart/form-data;
 * si solo hay URLs/rutas, JSON.
 */
export async function sendEmbedMessage(
  payload: SendEmbedPayload,
): Promise<SendEmbedResponse> {
  const image = splitMedia(payload.imageUrl);
  const thumbnail = splitMedia(payload.thumbnailUrl);
  const authorIcon = splitMedia(payload.authorIconUrl);
  const footerIcon = splitMedia(payload.footerIconUrl);
  const hasFiles = Boolean(
    image.file || thumbnail.file || authorIcon.file || footerIcon.file,
  );

  let response: Response;

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

    response = await apiFetch(`/api/embeds/send`, {
      method: "POST",
      headers: { Accept: "application/json" },
      body,
    });
  } else {
    const json: SendEmbedRequest = {
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
    };

    response = await apiFetch(`/api/embeds/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(json),
    });
  }

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
