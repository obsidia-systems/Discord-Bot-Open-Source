import type { APIRoute } from "astro";
import { relayAi } from "../../../../lib/ai-proxy";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request }) => {
  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }
  const ids = ["provider_id", "model_id"] as const;
  if (ids.some((key) => typeof input[key] !== "string" || !uuid.test(String(input[key])))) {
    return new Response(null, { status: 400 });
  }
  const numbers = ["estimate_amount", "maximum_amount", "user_daily_ceiling", "guild_daily_ceiling"] as const;
  if (numbers.some((key) => typeof input[key] !== "number" || !Number.isInteger(input[key]) || (input[key] as number) <= 0)) {
    return new Response(null, { status: 400 });
  }
  const systemPrompt = typeof input.system_prompt === "string" ? input.system_prompt : "";
  if ([...systemPrompt].length > 2000) return new Response(null, { status: 400 });
  return relayAi(request, "/internal/v1/ai/functions/ask", "POST", {
    provider_id: input.provider_id,
    model_id: input.model_id,
    pricing_revision_id: crypto.randomUUID(),
    estimate_amount: input.estimate_amount,
    maximum_amount: input.maximum_amount,
    unit_charge: 1,
    user_daily_ceiling: input.user_daily_ceiling,
    guild_daily_ceiling: input.guild_daily_ceiling,
    system_prompt: systemPrompt,
  });
};
