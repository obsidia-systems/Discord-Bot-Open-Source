import type { APIRoute } from "astro";
import { controlCatalog } from "../../../lib/catalog";

export const GET: APIRoute = async () => {
  const result = await controlCatalog("/internal/v1/catalog/servers", "GET");
  return new Response(result.ok ? await result.text() : null, {
    status: result.ok ? 200 : 503,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
