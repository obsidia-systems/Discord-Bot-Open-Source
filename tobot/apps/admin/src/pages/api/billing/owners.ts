import type { APIRoute } from "astro";
import { controlCatalog, validMutation } from "../../../lib/catalog";

export const POST: APIRoute = async ({ request }) => {
  if (!validMutation(request)) return new Response(null, { status: 403 });
  let accountId: unknown;
  try {
    accountId = (await request.json() as { account_id?: unknown }).account_id;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof accountId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)) {
    return new Response(null, { status: 400 });
  }
  const result = await controlCatalog("/internal/v1/catalog/billing-owners", "POST", { account_id: accountId });
  return new Response(JSON.stringify(result.ok ? { enrolled: true } : { error: result.status === 404 ? "Account not found or inactive." : "Enrollment failed." }), {
    status: result.ok ? 200 : result.status === 404 ? 404 : 503,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
