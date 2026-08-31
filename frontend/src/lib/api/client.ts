/** Cliente HTTP base del panel (same-origin / proxy). */
import type { ApiErrorBody } from "@adobos/shared";

export const API_BASE = import.meta.env.PUBLIC_API_BASE ?? "";

const GUILD_STORAGE_KEY = "adobos-guild-id";

export function getSelectedGuildId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(GUILD_STORAGE_KEY);
}

export function setSelectedGuildId(id: string): void {
  window.localStorage.setItem(GUILD_STORAGE_KEY, id);
}

export function clearSelectedGuildId(): void {
  window.localStorage.removeItem(GUILD_STORAGE_KEY);
}

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

function resolveUrl(path: string): URL {
  const href = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "http://127.0.0.1:3000";
  return new URL(href, origin);
}

function shouldAttachGuild(pathname: string): boolean {
  if (pathname.startsWith("/api/health")) return false;
  if (pathname.startsWith("/api/me")) return false;
  if (pathname.startsWith("/auth")) return false;
  return pathname.startsWith("/api/");
}

/** Fetch same-origin con cookie de sesión y guildId autorizado. */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = resolveUrl(path);
  if (shouldAttachGuild(url.pathname) && !url.searchParams.has("guildId")) {
    const guildId = getSelectedGuildId();
    if (guildId) url.searchParams.set("guildId", guildId);
  }

  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  const response = await fetch(url.toString(), {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && typeof window !== "undefined") {
    const here = window.location.pathname;
    if (here !== "/login" && !here.startsWith("/login")) {
      window.location.assign("/login");
    }
  }

  return response;
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
