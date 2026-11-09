import type { APIRoute } from "astro";
import { controlCatalog, validMutation } from "../../../lib/catalog";

export const GET: APIRoute = async () => {
  const result = await controlCatalog("/internal/v1/catalog/default-plan", "GET");
  return new Response(result.ok ? await result.text() : null, {
    status: result.ok ? 200 : 503,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

export const POST: APIRoute = async ({ request }) => {
  if (!validMutation(request)) return new Response(null, { status: 403 });
  let body: { enabled?: unknown; support_open?: unknown; ticket_quantity?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof body.enabled !== "boolean" || typeof body.support_open !== "boolean") {
    return new Response(null, { status: 400 });
  }
  if (body.ticket_quantity !== null && (typeof body.ticket_quantity !== "number" || !Number.isSafeInteger(body.ticket_quantity))) {
    return new Response(null, { status: 400 });
  }
  const result = await controlCatalog("/internal/v1/catalog/default-plan", "POST", {
    enabled: body.enabled,
    support_open: body.support_open,
    ticket_quantity: body.ticket_quantity,
  });
  const rejection = result.ok ? null : await result.json().catch(() => null) as { error?: string } | null;
  return new Response(result.ok ? await result.text() : JSON.stringify({ error: rejection?.error ?? "The free plan could not be saved." }), {
    status: result.ok ? 200 : result.status === 400 ? 400 : 503,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
