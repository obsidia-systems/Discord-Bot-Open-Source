import type { APIRoute } from "astro";
import { controlCatalog } from "../../../lib/catalog";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async ({ url }) => {
  const tenant = url.searchParams.get("tenant_id") ?? "";
  if (!uuid.test(tenant)) return new Response(null, { status: 400 });
  const result = await controlCatalog(`/internal/v1/ai/reviews/${tenant}`, "GET");
  return new Response(result.ok ? await result.text() : null, {
    status: result.status,
    headers: { "cache-control": "no-store", "content-type": "application/json" },
  });
};
