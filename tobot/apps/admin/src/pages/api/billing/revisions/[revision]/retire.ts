import type { APIRoute } from "astro";
import { controlCatalog, validMutation } from "../../../../../lib/catalog";

export const POST: APIRoute = async ({ params, request }) => {
  if (!validMutation(request)) return new Response(null, { status: 403 });
  const revision = params.revision;
  if (!revision || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(revision)) {
    return new Response(null, { status: 400 });
  }
  const result = await controlCatalog(`/internal/v1/catalog/revisions/${revision}/retire`, "POST");
  return new Response(null, { status: result.ok ? 204 : result.status === 404 ? 404 : 503, headers: { "cache-control": "no-store" } });
};
