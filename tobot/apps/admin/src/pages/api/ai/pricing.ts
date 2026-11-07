import type { APIRoute } from "astro";
import { controlCatalog, validMutation } from "../../../lib/catalog";

export const POST: APIRoute = async ({ request }) => {
  if (!validMutation(request)) return new Response(null, { status: 403 });
  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }
  const numbers = ["estimate_amount", "maximum_amount", "unit_charge", "user_daily_ceiling", "guild_daily_ceiling"] as const;
  if (typeof input.model_class !== "string" || input.model_class.trim().length === 0 || input.model_class.length > 40) {
    return new Response(null, { status: 400 });
  }
  if (numbers.some((key) => typeof input[key] !== "number" || !Number.isInteger(input[key]) || (input[key] as number) <= 0)) {
    return new Response(null, { status: 400 });
  }
  const result = await controlCatalog("/internal/v1/ai/pricing", "POST", {
    pricing_revision_id: crypto.randomUUID(),
    model_class: input.model_class,
    estimate_amount: input.estimate_amount,
    maximum_amount: input.maximum_amount,
    unit_charge: input.unit_charge,
    user_daily_ceiling: input.user_daily_ceiling,
    guild_daily_ceiling: input.guild_daily_ceiling,
  });
  return new Response(result.ok ? await result.text() : null, { status: result.status, headers: { "cache-control": "no-store" } });
};
