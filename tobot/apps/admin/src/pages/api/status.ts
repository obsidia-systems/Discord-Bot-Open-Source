import type { APIRoute } from "astro";
import { collectStatus } from "../../lib/status";

export const GET: APIRoute = async () => {
  const status = await collectStatus();
  return new Response(JSON.stringify(status), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
};
