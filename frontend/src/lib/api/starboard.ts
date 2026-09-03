import type { StarboardSettings } from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchStarboard(): Promise<{
  settings: StarboardSettings;
  postCount: number;
}> {
  const response = await apiFetch(`/api/starboard`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't load Starboard (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<{
    settings: StarboardSettings;
    postCount: number;
  }>;
}

export async function saveStarboardSettings(
  input: Partial<StarboardSettings> & {
    channelId?: string | null;
  },
): Promise<StarboardSettings> {
  const response = await apiFetch(`/api/starboard/settings`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't save Starboard (${response.status})`,
      ),
    );
  }
  const json = (await response.json()) as { settings: StarboardSettings };
  return json.settings;
}
