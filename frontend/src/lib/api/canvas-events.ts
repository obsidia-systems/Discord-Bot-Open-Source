import type {
  CanvasEventSettingsResponse,
  CanvasEventType,
  SaveCanvasEventSettingsRequest,
  SaveCanvasEventSettingsResponse,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

function endpointFor(eventType: CanvasEventType): string {
  return `/api/bot/${eventType}`;
}

export async function fetchCanvasEventSettings(
  eventType: CanvasEventType,
  guildId?: string,
): Promise<CanvasEventSettingsResponse> {
  const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : "";
  const response = await apiFetch(`${endpointFor(eventType)}${query}`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't load ${eventType} (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<CanvasEventSettingsResponse>;
}

export async function saveCanvasEventSettings(
  eventType: CanvasEventType,
  payload: SaveCanvasEventSettingsRequest,
): Promise<SaveCanvasEventSettingsResponse> {
  const response = await apiFetch(endpointFor(eventType), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't save ${eventType} (${response.status})`,
      ),
    );
  }

  return response.json() as Promise<SaveCanvasEventSettingsResponse>;
}
