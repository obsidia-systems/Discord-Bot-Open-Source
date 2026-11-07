import type { APIRoute } from "astro";
import { controlCatalog, validMutation } from "../../../lib/catalog";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request }) => {
  if (!validMutation(request)) return new Response(null, { status: 403 });
  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof input.tenant_id !== "string" || !uuid.test(input.tenant_id)) return new Response(null, { status: 400 });
  if (typeof input.credit_minors !== "number" || !Number.isInteger(input.credit_minors) || input.credit_minors <= 0) {
    return new Response(null, { status: 400 });
  }
  const result = await controlCatalog("/internal/v1/ai/compensation", "POST", {
    tenant_id: input.tenant_id,
    source_ref: crypto.randomUUID(),
    credit_minors: input.credit_minors,
    expires_at: null,
  });
  return new Response(result.ok ? await result.text() : null, { status: result.status, headers: { "cache-control": "no-store" } });
};
