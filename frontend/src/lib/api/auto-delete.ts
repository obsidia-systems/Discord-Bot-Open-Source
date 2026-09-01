import type {
  AutoDeleteConfigResponse,
  UpdateAutoDeleteConfigRequest,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchAutoDeleteConfig(): Promise<AutoDeleteConfigResponse> {
  const response = await apiFetch(`/api/auto-delete/config`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo cargar Auto-Delete (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<AutoDeleteConfigResponse>;
}

export async function saveAutoDeleteConfig(
  input: UpdateAutoDeleteConfigRequest,
): Promise<AutoDeleteConfigResponse> {
  const response = await apiFetch(`/api/auto-delete/config`, {
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
        `No se pudo guardar Auto-Delete (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<AutoDeleteConfigResponse>;
}
