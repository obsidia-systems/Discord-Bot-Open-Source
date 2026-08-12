import type {
  SendEmbedRequest,
  SendEmbedResponse,
  SendMessageRequest,
  SendMessageResponse,
} from "@adobos/shared";
import { API_BASE, readApiError } from "./client";

export async function sendChannelMessage(
  payload: SendMessageRequest,
): Promise<SendMessageResponse> {
  const response = await fetch(`${API_BASE}/api/messages`, {
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

export async function sendEmbedMessage(
  payload: SendEmbedRequest,
): Promise<SendEmbedResponse> {
  const response = await fetch(`${API_BASE}/api/messages/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(response, `Error al enviar embed (${response.status})`),
    );
  }

  return response.json() as Promise<SendEmbedResponse>;
}
