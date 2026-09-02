import type { AntiRaidSettings } from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchAntiRaid(): Promise<{
  settings: AntiRaidSettings;
  nukeAvailable: boolean;
}> {
  const response = await apiFetch(`/api/anti-raid`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo cargar Anti-Raid (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<{
    settings: AntiRaidSettings;
    nukeAvailable: boolean;
  }>;
}

export async function saveAntiRaidSettings(
  input: Record<string, unknown>,
): Promise<AntiRaidSettings> {
  const response = await apiFetch(`/api/anti-raid/settings`, {
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
        `No se pudo guardar Anti-Raid (${response.status})`,
      ),
    );
  }
  const json = (await response.json()) as { settings: AntiRaidSettings };
  return json.settings;
}

export async function setAntiRaidLockdown(active: boolean): Promise<{
  settings: AntiRaidSettings;
  nukeAvailable: boolean;
}> {
  const response = await apiFetch(`/api/anti-raid/lockdown`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ active }),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo cambiar el lockdown (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<{
    settings: AntiRaidSettings;
    nukeAvailable: boolean;
  }>;
}
