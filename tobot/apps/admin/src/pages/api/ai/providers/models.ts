import type { APIRoute } from "astro";
import { relayAi } from "../../../../lib/ai-proxy";

export const POST: APIRoute = async ({ request }) => {
  let input: { provider_id?: unknown };
  try {
    input = await request.json() as { provider_id?: unknown };
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof input.provider_id !== "string") return new Response(null, { status: 400 });
  return relayAi(request, "/internal/v1/ai/providers/models", "POST", { provider_id: input.provider_id }, 20_000);
};
