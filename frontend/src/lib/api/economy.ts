import type {
  AdjustEconomyFundsRequest,
  AdjustEconomyFundsResponse,
  CreateEconomyShopItemRequest,
  EconomyConfig,
  EconomyConfigResponse,
  EconomyIncomeConfig,
  EconomyIncomeConfigResponse,
  EconomyLeaderboardResponse,
  EconomyShopItem,
  EconomyShopItemResponse,
  EconomyShopItemsResponse,
  UpdateEconomyConfigRequest,
  UpdateEconomyIncomeRequest,
  UpdateEconomyShopItemRequest,
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

export async function fetchEconomyIncomeConfig(): Promise<EconomyIncomeConfig> {
  const response = await fetch(`${API_BASE}/api/economy/income`);
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "No se pudo cargar ingresos y trabajos."),
    );
  }
  const body = (await response.json()) as EconomyIncomeConfigResponse;
  return body.config;
}

export async function saveEconomyIncomeConfig(
  input: UpdateEconomyIncomeRequest,
): Promise<EconomyIncomeConfig> {
  const response = await fetch(`${API_BASE}/api/economy/income`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "No se pudo guardar ingresos y trabajos."),
    );
  }
  const body = (await response.json()) as EconomyIncomeConfigResponse;
  return body.config;
}

export async function fetchShopItems(): Promise<EconomyShopItem[]> {
  const response = await fetch(`${API_BASE}/api/economy/shop/items`);
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "No se pudieron cargar los ítems."),
    );
  }
  const body = (await response.json()) as EconomyShopItemsResponse;
  return body.items;
}

export async function createShopItem(
  input: CreateEconomyShopItemRequest,
): Promise<EconomyShopItem> {
  const response = await fetch(`${API_BASE}/api/economy/shop/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "No se pudo crear el ítem."),
    );
  }
  const body = (await response.json()) as EconomyShopItemResponse;
  return body.item;
}

export async function updateShopItem(
  id: string,
  input: UpdateEconomyShopItemRequest,
): Promise<EconomyShopItem> {
  const response = await fetch(
    `${API_BASE}/api/economy/shop/items/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "No se pudo actualizar el ítem."),
    );
  }
  const body = (await response.json()) as EconomyShopItemResponse;
  return body.item;
}

export async function deleteShopItem(id: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/economy/shop/items/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "No se pudo eliminar el ítem."),
    );
  }
}
