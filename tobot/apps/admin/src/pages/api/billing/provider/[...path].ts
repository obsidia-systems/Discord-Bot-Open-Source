import type { APIRoute } from "astro";
import { controlCatalog, validMutation } from "../../../../lib/catalog";

function allowed(path: string, method: "GET" | "POST"): boolean {
  if (path === "plans") return true;
  if (method === "GET") return /^prices\/price_[A-Za-z0-9_]{1,250}$/.test(path);
  return /^products\/prod_[A-Za-z0-9_]{1,250}\/prices$/.test(path)
    || /^products\/prod_[A-Za-z0-9_]{1,250}$/.test(path)
    || /^products\/prod_[A-Za-z0-9_]{1,250}\/archive$/.test(path)
    || /^prices\/price_[A-Za-z0-9_]{1,250}\/archive$/.test(path);
}

async function forward(path: string, method: "GET" | "POST", request: Request): Promise<Response> {
  if (!allowed(path, method)) return new Response(null, { status: 404 });
  let body: Record<string, unknown> | undefined;
  if (method === "POST") {
    if (!validMutation(request)) return new Response(null, { status: 403 });
    try {
      body = await request.json() as Record<string, unknown>;
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    } catch { return new Response(null, { status: 400 }); }
    body.request_id = typeof body.request_id === "string" && /^[0-9a-f-]{36}$/i.test(body.request_id)
      ? body.request_id : crypto.randomUUID();
  }
  const result = await controlCatalog(`/internal/v1/catalog/provider/${path}`, method, body);
  return new Response(result.body, {
    status: result.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const GET: APIRoute = ({ params, request }) => forward(params.path ?? "", "GET", request);
export const POST: APIRoute = ({ params, request }) => forward(params.path ?? "", "POST", request);
