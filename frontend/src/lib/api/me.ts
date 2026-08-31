import type { MeResponse } from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchMe(): Promise<MeResponse> {
  const response = await apiFetch("/api/me");
  if (!response.ok) {
    throw new Error(
      await readApiError(response, `No autenticado (${response.status})`),
    );
  }
  return response.json() as Promise<MeResponse>;
}

export async function logout(): Promise<void> {
  await apiFetch("/auth/logout", { method: "POST" });
}
