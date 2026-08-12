/** Cliente HTTP base del panel (same-origin / proxy). */
import type { ApiErrorBody } from "@adobos/shared";

export const API_BASE = import.meta.env.PUBLIC_API_BASE ?? "";

export async function readApiError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body.error) return body.error;
  } catch {
    // ignore
  }
  return fallback;
}
