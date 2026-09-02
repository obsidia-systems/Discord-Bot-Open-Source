import type { HealthResponse, GuildAssetsResponse } from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await apiFetch(`/api/health`);
  if (!response.ok) {
    throw new Error(`Health check falló (${response.status})`);
  }
  return response.json() as Promise<HealthResponse>;
}

export async function fetchGuildAssets(): Promise<GuildAssetsResponse> {
  const response = await apiFetch(`/api/guild-assets`);
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
