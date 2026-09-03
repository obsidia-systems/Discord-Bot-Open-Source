import type {
  SaveWelcomeSettingsRequest,
  SaveWelcomeSettingsResponse,
  WelcomeSettingsResponse,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchWelcomeSettings(
  guildId?: string,
): Promise<WelcomeSettingsResponse> {
  const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : "";
  const response = await apiFetch(`/api/welcome-settings${query}`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't load welcome (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<WelcomeSettingsResponse>;
}

export async function saveWelcomeSettings(
  payload: SaveWelcomeSettingsRequest,
): Promise<SaveWelcomeSettingsResponse> {
  const response = await apiFetch(`/api/welcome-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't save welcome (${response.status})`,
      ),
    );
  }

  return response.json() as Promise<SaveWelcomeSettingsResponse>;
}
