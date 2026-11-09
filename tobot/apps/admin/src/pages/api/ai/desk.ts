import type { APIRoute } from "astro";
import { relayAi } from "../../../lib/ai-proxy";

export const GET: APIRoute = async ({ request }) => relayAi(request, "/internal/v1/ai/desk", "GET");
