import { controlCatalog, validMutation } from "./catalog";

export async function relayAi(request: Request, path: string, method: "GET" | "POST", payload?: object, timeoutMs?: number): Promise<Response> {
  if (method === "POST" && !validMutation(request)) return new Response(null, { status: 403 });
  const result = await controlCatalog(path, method, payload, timeoutMs);
  const text = await result.text();
  return new Response(text ? scrub(text) : null, {
    status: result.status,
    headers: { "cache-control": "no-store" },
  });
}

function scrub(text: string): string {
  try {
    const value = JSON.parse(text) as unknown;
    strip(value);
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function strip(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(strip);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  delete record.secret;
  delete record.api_key;
  delete record.credential;
  delete record.secret_ciphertext;
  Object.values(record).forEach(strip);
}
