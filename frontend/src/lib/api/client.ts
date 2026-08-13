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

/** Resuelve `/uploads/...` al origen del API para miniaturas en el panel. */
export function resolvePublicAssetUrl(pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return trimmed;
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("data:")
  ) {
    return trimmed;
  }
  if (trimmed.startsWith("/uploads/")) {
    return `${API_BASE}${trimmed}`;
  }
  return trimmed;
}
