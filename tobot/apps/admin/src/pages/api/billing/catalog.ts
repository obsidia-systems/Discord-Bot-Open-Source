import type { APIRoute } from "astro";
import { controlCatalog, validHttpsUrl, validMutation } from "../../../lib/catalog";

export const GET: APIRoute = async () => {
  const result = await controlCatalog("/internal/v1/catalog/revisions/latest", "GET");
  return new Response(result.ok ? await result.text() : null, {
    status: result.ok ? 200 : 503,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

export const POST: APIRoute = async ({ request }) => {
  if (!validMutation(request)) return new Response(null, { status: 403 });
  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }
  const fields = ["merchant_of_record"] as const;
  if (fields.some((key) => typeof input[key] !== "string" || !(input[key] as string).trim() || (input[key] as string).length > 120)) {
    return new Response(null, { status: 400 });
  }
  if (typeof input.price_id !== "string" || !/^price_[A-Za-z0-9_]{1,250}$/.test(input.price_id)) {
    return new Response(null, { status: 400 });
  }
  if (typeof input.product_key !== "string" || !/^[a-z][a-z0-9._-]{1,79}$/.test(input.product_key)) {
    return new Response(null, { status: 400 });
  }
  if (!Array.isArray(input.benefits) || input.benefits.length === 0 || input.benefits.length > 16) {
    return new Response(null, { status: 400 });
  }
  if (![input.terms_url, input.privacy_url, input.support_url].every(validHttpsUrl)) {
    return new Response(null, { status: 400 });
  }
  const regions = typeof input.regions === "string"
    ? input.regions.split(",").map((region) => region.trim().toUpperCase())
    : [];
  if (!regions.length || regions.length > 16 || regions.some((region) => !/^[A-Z]{2}$/.test(region))) {
    return new Response(null, { status: 400 });
  }
  const providerAccount = process.env.TOBOT_STRIPE_TEST_ACCOUNT_SCOPE ?? "";
  if (!providerAccount.startsWith("acct_")) {
    return new Response(null, { status: 503 });
  }
  const detail = await controlCatalog(`/internal/v1/catalog/provider/prices/${input.price_id}`, "GET");
  if (!detail.ok) return new Response(null, { status: detail.status === 404 ? 400 : 503 });
  const selected = await detail.json() as {
    price: { active: boolean; id: string; currency: string; unit_amount: number; interval_name: string; interval_count: number; usage_type: string };
    product: { active: boolean; name: string; tax_code: string };
  };
  if (!selected.price.active || !selected.product.active || !Number.isSafeInteger(selected.price.unit_amount)
      || selected.price.unit_amount <= 0 || selected.price.interval_count !== 1 || selected.price.usage_type !== "licensed"
      || !["month", "year"].includes(selected.price.interval_name) || !/^txcd_[A-Za-z0-9]+$/.test(selected.product.tax_code)) {
    return new Response(null, { status: 400 });
  }
  const revisionId = crypto.randomUUID();
  const result = await controlCatalog("/internal/v1/catalog/revisions", "POST", {
    revision_id: revisionId,
    product_key: input.product_key,
    product_kind: "BasePlan",
    display_name: selected.product.name,
    provider: "Stripe",
    environment: "test",
    provider_account: providerAccount,
    provider_price_ref: selected.price.id,
    currency: selected.price.currency,
    unit_amount: selected.price.unit_amount,
    interval_name: selected.price.interval_name,
    feature_key: "platform.base",
    benefits: input.benefits,
    regions,
    tax_classification: selected.product.tax_code,
    merchant_of_record: input.merchant_of_record,
    terms_url: input.terms_url,
    privacy_url: input.privacy_url,
    support_url: input.support_url,
    grace_seconds: 86400,
  });
  const rejection = result.status === 409 ? await result.json().catch(() => null) as { error?: string } | null : null;
  return new Response(JSON.stringify(result.ok ? { revision_id: revisionId, state: "Pending" } : { error: rejection?.error ?? "Catalog publication could not be completed." }), {
    status: result.ok ? 202 : result.status === 409 ? 409 : 503,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
