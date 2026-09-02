import type {
  CreateGiveawayRequest,
  Giveaway,
  GiveawayDetailResponse,
  GiveawayListResponse,
  GiveawaySettingsResponse,
  UpdateGiveawaySettingsRequest,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchGiveawaySettings(): Promise<GiveawaySettingsResponse> {
  const response = await apiFetch(`/api/giveaways/settings`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudieron cargar los ajustes (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<GiveawaySettingsResponse>;
}

export async function saveGiveawaySettings(
  input: UpdateGiveawaySettingsRequest,
): Promise<GiveawaySettingsResponse> {
  const response = await apiFetch(`/api/giveaways/settings`, {
    method: "PUT",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudieron guardar los ajustes (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<GiveawaySettingsResponse>;
}

export async function fetchGiveaways(): Promise<GiveawayListResponse> {
  const response = await apiFetch(`/api/giveaways`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudieron cargar los sorteos (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<GiveawayListResponse>;
}

export async function fetchGiveawayDetail(
  id: number,
): Promise<GiveawayDetailResponse> {
  const response = await apiFetch(`/api/giveaways/${id}`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo cargar el sorteo (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<GiveawayDetailResponse>;
}

export async function createGiveaway(
  input: CreateGiveawayRequest,
): Promise<Giveaway> {
  const response = await apiFetch(`/api/giveaways`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo crear el sorteo (${response.status})`,
      ),
    );
  }
  const json = (await response.json()) as { giveaway: Giveaway };
  return json.giveaway;
}

async function postAction(id: number, path: string): Promise<Giveaway> {
  const response = await apiFetch(`/api/giveaways/${id}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo completar la acción (${response.status})`,
      ),
    );
  }
  const json = (await response.json()) as { giveaway: Giveaway };
  return json.giveaway;
}

export function endGiveaway(id: number): Promise<Giveaway> {
  return postAction(id, "/end");
}

export function cancelGiveaway(id: number): Promise<Giveaway> {
  return postAction(id, "/cancel");
}

export function rerollGiveaway(id: number): Promise<Giveaway> {
  return postAction(id, "/reroll");
}

export function publishGiveaway(id: number): Promise<Giveaway> {
  return postAction(id, "/publish");
}
