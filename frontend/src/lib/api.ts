import type {
  ApiErrorBody,
  HealthResponse,
  SendEmbedRequest,
  SendEmbedResponse,
  SendMessageRequest,
  SendMessageResponse,
} from "@adobos/shared";

/** Vacío en Astro dev (proxy /api → :3000). En estáticos servidos por Express también es same-origin. */
const API_BASE = import.meta.env.PUBLIC_API_BASE ?? "";

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body.error) return body.error;
  } catch {
    // ignore
  }
  return fallback;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/api/health`);
  if (!response.ok) {
    throw new Error(`Health check falló (${response.status})`);
  }
  return response.json() as Promise<HealthResponse>;
}

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
