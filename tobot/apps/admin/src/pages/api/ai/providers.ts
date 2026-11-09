import type { APIRoute } from "astro";
import { relayAi } from "../../../lib/ai-proxy";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request }) => {
  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof input.display_name !== "string" || typeof input.kind !== "string" || typeof input.base_url !== "string") {
    return new Response(null, { status: 400 });
  }
  const body: Record<string, unknown> = {
    display_name: input.display_name,
    kind: input.kind,
    base_url: input.base_url,
  };
  if (typeof input.provider_id === "string") {
    if (!uuid.test(input.provider_id)) return new Response(null, { status: 400 });
    body.provider_id = input.provider_id;
  }
  if (input.secret !== undefined) {
    if (typeof input.secret !== "string" || input.secret.length > 512) return new Response(null, { status: 400 });
    body.secret = input.secret;
  }
  return relayAi(request, "/internal/v1/ai/providers", "POST", body);
};
