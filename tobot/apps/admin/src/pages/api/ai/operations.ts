import type { APIRoute } from "astro";
import { relayAi } from "../../../lib/ai-proxy";

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of ["tenant_id", "actor_id", "from", "to"]) {
    const value = url.searchParams.get(key);
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return relayAi(request, `/internal/v1/ai/operations${query ? `?${query}` : ""}`, "GET");
};
