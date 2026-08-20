import type {
  AdjustEconomyFundsRequest,
  AdjustEconomyFundsResponse,
  EconomyConfig,
  EconomyConfigResponse,
  EconomyLeaderboardResponse,
  UpdateEconomyConfigRequest,
} from "@adobos/shared";
import { API_BASE, readApiError } from "./client";

export async function fetchEconomyConfig(): Promise<EconomyConfig> {
  const response = await fetch(`${API_BASE}/api/economy/config`);
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "No se pudo cargar la economía."),
    );
  }
  const body = (await response.json()) as EconomyConfigResponse;
  return body.config;
}

export async function saveEconomyConfig(
  input: UpdateEconomyConfigRequest,
): Promise<EconomyConfig> {
  const response = await fetch(`${API_BASE}/api/economy/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "No se pudo guardar la economía."),
    );
  }
  const body = (await response.json()) as EconomyConfigResponse;
  return body.config;
}

export async function fetchEconomyLeaderboard(
  limit = 100,
): Promise<EconomyLeaderboardResponse> {
  const response = await fetch(
    `${API_BASE}/api/economy/leaderboard?limit=${encodeURIComponent(String(limit))}`,
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "No se pudo cargar el leaderboard."),
    );
  }
  return response.json() as Promise<EconomyLeaderboardResponse>;
}

export async function adjustEconomyFunds(
  input: AdjustEconomyFundsRequest,
): Promise<AdjustEconomyFundsResponse> {
  const response = await fetch(`${API_BASE}/api/economy/funds`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "No se pudieron ajustar los fondos."),
    );
  }
  return response.json() as Promise<AdjustEconomyFundsResponse>;
}
