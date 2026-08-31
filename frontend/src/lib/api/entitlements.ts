import type { GuildEntitlements } from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchEntitlements(): Promise<GuildEntitlements> {
  const response = await apiFetch("/api/entitlements");
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo cargar el plan del servidor (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<GuildEntitlements>;
}
