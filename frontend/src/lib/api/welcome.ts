import type {
  SaveWelcomeSettingsRequest,
  SaveWelcomeSettingsResponse,
  WelcomeSettingsResponse,
} from "@adobos/shared";
import { API_BASE, readApiError } from "./client";

export async function fetchWelcomeSettings(
  guildId?: string,
): Promise<WelcomeSettingsResponse> {
  const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : "";
  const response = await fetch(`${API_BASE}/api/welcome-settings${query}`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo cargar bienvenidas (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<WelcomeSettingsResponse>;
}

export async function saveWelcomeSettings(
  payload: SaveWelcomeSettingsRequest,
): Promise<SaveWelcomeSettingsResponse> {
  const response = await fetch(`${API_BASE}/api/welcome-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Error al guardar bienvenidas (${response.status})`,
      ),
    );
  }

  return response.json() as Promise<SaveWelcomeSettingsResponse>;
}
