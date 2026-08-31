import type {
  LevelsConfigResponse,
  LevelsLeaderboardResponse,
  UpdateLevelsConfigRequest,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchLevelsConfig(): Promise<LevelsConfigResponse> {
  const response = await apiFetch(`/api/levels/config`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo cargar Rangos y XP (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<LevelsConfigResponse>;
}

export async function saveLevelsConfig(
  input: UpdateLevelsConfigRequest,
): Promise<LevelsConfigResponse> {
  const response = await apiFetch(`/api/levels/config`, {
    method: "POST",
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
        `No se pudo guardar Rangos y XP (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<LevelsConfigResponse>;
}

export async function fetchLevelsLeaderboard(
  limit = 100,
): Promise<LevelsLeaderboardResponse> {
  const response = await apiFetch(
    `/api/levels/leaderboard?limit=${encodeURIComponent(String(limit))}`,
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo cargar la clasificación (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<LevelsLeaderboardResponse>;
}
