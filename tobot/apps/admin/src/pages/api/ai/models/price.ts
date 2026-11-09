import type { APIRoute } from "astro";
import { relayAi } from "../../../../lib/ai-proxy";

function micro(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000_000;
}

export const POST: APIRoute = async ({ request }) => {
  let input: { model_id?: unknown; input_micro_usd?: unknown; output_micro_usd?: unknown };
  try {
    input = await request.json() as { model_id?: unknown; input_micro_usd?: unknown; output_micro_usd?: unknown };
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof input.model_id !== "string" || !micro(input.input_micro_usd) || !micro(input.output_micro_usd)) {
    return new Response(null, { status: 400 });
  }
  return relayAi(request, "/internal/v1/ai/models/price", "POST", {
    model_id: input.model_id,
    input_micro_usd: input.input_micro_usd,
    output_micro_usd: input.output_micro_usd,
  });
};
