import type { HealthResponse, GuildAssetsResponse } from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await apiFetch(`/api/health`);
  if (!response.ok) {
    throw new Error(`Health check falló (${response.status})`);
  }
  return response.json() as Promise<HealthResponse>;
}

export async function fetchGuildAssets(
  guildId?: string,
): Promise<GuildAssetsResponse> {
  const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : "";
  const response = await apiFetch(`/api/guild-assets${query}`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudieron cargar assets (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<GuildAssetsResponse>;
}
