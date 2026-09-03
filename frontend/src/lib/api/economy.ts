import type {
  AdjustEconomyFundsRequest,
  AdjustEconomyFundsResponse,
  CreateEconomyShopItemRequest,
  EconomyConfig,
  EconomyConfigResponse,
  EconomyIncomeConfig,
  EconomyIncomeConfigResponse,
  EconomyCasinoConfig,
  EconomyCasinoConfigResponse,
  EconomyLeaderboardResponse,
  EconomyShopItem,
  EconomyShopItemResponse,
  EconomyShopItemsResponse,
  UpdateEconomyConfigRequest,
  UpdateEconomyIncomeRequest,
  UpdateEconomyCasinoRequest,
  UpdateEconomyShopItemRequest,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchEconomyConfig(): Promise<EconomyConfig> {
  const response = await apiFetch(`/api/economy/config`);
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't load the economy."),
    );
  }
  const body = (await response.json()) as EconomyConfigResponse;
  return body.config;
}

export async function saveEconomyConfig(
  input: UpdateEconomyConfigRequest,
): Promise<EconomyConfig> {
  const response = await apiFetch(`/api/economy/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't save the economy."),
    );
  }
  const body = (await response.json()) as EconomyConfigResponse;
  return body.config;
}

export async function fetchEconomyLeaderboard(
  limit = 100,
): Promise<EconomyLeaderboardResponse> {
  const response = await apiFetch(
    `/api/economy/leaderboard?limit=${encodeURIComponent(String(limit))}`,
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't load the leaderboard."),
    );
  }
  return response.json() as Promise<EconomyLeaderboardResponse>;
}

export async function adjustEconomyFunds(
  input: AdjustEconomyFundsRequest,
): Promise<AdjustEconomyFundsResponse> {
  const response = await apiFetch(`/api/economy/funds`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't adjust the funds."),
    );
  }
  return response.json() as Promise<AdjustEconomyFundsResponse>;
}

export async function fetchEconomyIncomeConfig(): Promise<EconomyIncomeConfig> {
  const response = await apiFetch(`/api/economy/income`);
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't load income and jobs."),
    );
  }
  const body = (await response.json()) as EconomyIncomeConfigResponse;
  return body.config;
}

export async function saveEconomyIncomeConfig(
  input: UpdateEconomyIncomeRequest,
): Promise<EconomyIncomeConfig> {
  const response = await apiFetch(`/api/economy/income`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't save income and jobs."),
    );
  }
  const body = (await response.json()) as EconomyIncomeConfigResponse;
  return body.config;
}

export async function fetchEconomyCasinoConfig(): Promise<EconomyCasinoConfig> {
  const response = await apiFetch(`/api/economy/casino`);
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't load the casino."),
    );
  }
  const body = (await response.json()) as EconomyCasinoConfigResponse;
  return body.config;
}

export async function saveEconomyCasinoConfig(
  input: UpdateEconomyCasinoRequest,
): Promise<EconomyCasinoConfig> {
  const response = await apiFetch(`/api/economy/casino`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't save the casino."),
    );
  }
  const body = (await response.json()) as EconomyCasinoConfigResponse;
  return body.config;
}

export async function fetchShopItems(): Promise<EconomyShopItem[]> {
  const response = await apiFetch(`/api/economy/shop/items`);
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't load the items."),
    );
  }
  const body = (await response.json()) as EconomyShopItemsResponse;
  return body.items;
}

export async function createShopItem(
  input: CreateEconomyShopItemRequest,
): Promise<EconomyShopItem> {
  const response = await apiFetch(`/api/economy/shop/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't create the item."),
    );
  }
  const body = (await response.json()) as EconomyShopItemResponse;
  return body.item;
}

export async function updateShopItem(
  id: string,
  input: UpdateEconomyShopItemRequest,
): Promise<EconomyShopItem> {
  const response = await apiFetch(
    `/api/economy/shop/items/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't update the item."),
    );
  }
  const body = (await response.json()) as EconomyShopItemResponse;
  return body.item;
}

export async function deleteShopItem(id: string): Promise<void> {
  const response = await apiFetch(
    `/api/economy/shop/items/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't delete the item."),
    );
  }
}
