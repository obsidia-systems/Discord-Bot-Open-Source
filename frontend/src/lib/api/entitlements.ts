import type { GuildEntitlements } from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchEntitlements(): Promise<GuildEntitlements> {
  const response = await apiFetch("/api/entitlements");
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't load the server plan (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<GuildEntitlements>;
}
