import type {
  AutoModConfigResponse,
  UpdateAutoModConfigRequest,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchAutoModConfig(): Promise<AutoModConfigResponse> {
  const response = await apiFetch(`/api/auto-mod/config`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo cargar Auto-Mod (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<AutoModConfigResponse>;
}

export async function saveAutoModConfig(
  input: UpdateAutoModConfigRequest,
): Promise<AutoModConfigResponse> {
  const response = await apiFetch(`/api/auto-mod/config`, {
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
        `No se pudo guardar Auto-Mod (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<AutoModConfigResponse>;
}
