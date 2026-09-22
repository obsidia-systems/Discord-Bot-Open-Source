import { guildHomeAccess } from "./shell-state";

export type GuildDiscoveryShell = {
  tenant_id: string;
  installation_state: string;
  health_state: string;
  projection_watermark_unix: number;
  projection_age_seconds: number;
};

export type GuildDiscoveryItem = {
  provider_guild_id: string;
  name: string;
  shell: GuildDiscoveryShell | null;
};

export type GuildDiscoveryBody = {
  guilds: GuildDiscoveryItem[];
  observed_at_unix: number;
  expires_at_unix: number;
  authority: string;
};

export type GuildShellBody = {
  tenant_id: string;
  provider_guild_id: string;
  installation_state: string;
  health_state: string;
  installation_generation: number;
  capabilities: Record<string, unknown>;
  projection_watermark_unix: number;
  projection_age_seconds: number;
  probe_state: string;
};

type Failure = "unauthenticated" | "unavailable";

type TokenResult =
  | { kind: "token"; value: string }
  | { kind: "unauthenticated" }
  | { kind: "unavailable" };

const jsonHeaders = { accept: "application/json" };

async function readCsrfToken(): Promise<TokenResult> {
  try {
    const response = await fetch("/api/v1/csrf", {
      credentials: "include",
      cache: "no-store",
      headers: jsonHeaders,
    });
    if (response.status === 401) return { kind: "unauthenticated" };
    if (!response.ok) return { kind: "unavailable" };
    const body = (await response.json()) as { csrf_token?: unknown };
    if (typeof body.csrf_token !== "string" || body.csrf_token.length === 0) {
      return { kind: "unavailable" };
    }
    return { kind: "token", value: body.csrf_token };
  } catch {
    return { kind: "unavailable" };
  }
}

export async function readGuildDiscovery(): Promise<
  | { kind: "ready"; body: GuildDiscoveryBody }
  | { kind: "unauthenticated" }
  | { kind: "unavailable" }
> {
  try {
    const response = await fetch("/api/v1/guilds", {
      credentials: "include",
      cache: "no-store",
      headers: jsonHeaders,
    });
    if (response.status === 401) return { kind: "unauthenticated" };
    if (!response.ok) return { kind: "unavailable" };
    const body = (await response.json()) as Partial<GuildDiscoveryBody>;
    if (
      !Array.isArray(body.guilds) ||
      typeof body.expires_at_unix !== "number"
    ) {
      return { kind: "unavailable" };
    }
    return { kind: "ready", body: body as GuildDiscoveryBody };
  } catch {
    return { kind: "unavailable" };
  }
}

export async function readGuildShell(
  tenantId: string,
): Promise<
  | { kind: "ready"; body: GuildShellBody }
  | { kind: "unauthenticated" }
  | { kind: "no-access" }
  | { kind: "unavailable" }
> {
  try {
    const response = await fetch(
      `/api/v1/guilds/${encodeURIComponent(tenantId)}`,
      {
        credentials: "include",
        cache: "no-store",
        headers: jsonHeaders,
      },
    );
    const access = guildHomeAccess(response.status);
    if (access === "unauthenticated") return { kind: "unauthenticated" };
    if (access === "no-access") return { kind: "no-access" };
    if (access !== "ok") return { kind: "unavailable" };
    const body = (await response.json()) as Partial<GuildShellBody>;
    if (
      typeof body.installation_state !== "string" ||
      typeof body.projection_age_seconds !== "number"
    ) {
      return { kind: "unavailable" };
    }
    return {
      kind: "ready",
      body: {
        ...body,
        capabilities:
          body.capabilities && typeof body.capabilities === "object"
            ? body.capabilities
            : {},
      } as GuildShellBody,
    };
  } catch {
    return { kind: "unavailable" };
  }
}

function isDiscordAuthorizeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "discord.com" &&
      url.pathname === "/oauth2/authorize"
    );
  } catch {
    return false;
  }
}

export async function startGuildInstall(
  providerGuildId: string,
): Promise<
  | { kind: "redirect"; authorizeUrl: string }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "unavailable" }
> {
  const token = await readCsrfToken();
  if (token.kind !== "token") return token;
  try {
    const response = await fetch(
      `/api/v1/install/guild/${encodeURIComponent(providerGuildId)}`,
      {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        headers: {
          accept: "application/json",
          "x-csrf-token": token.value,
        },
      },
    );
    if (response.status === 401) return { kind: "unauthenticated" };
    if (response.status === 403) return { kind: "forbidden" };
    if (!response.ok) return { kind: "unavailable" };
    const body = (await response.json()) as { authorize_url?: unknown };
    if (
      typeof body.authorize_url !== "string" ||
      !isDiscordAuthorizeUrl(body.authorize_url)
    ) {
      return { kind: "unavailable" };
    }
    return { kind: "redirect", authorizeUrl: body.authorize_url };
  } catch {
    return { kind: "unavailable" };
  }
}

export async function startGuildRepair(
  tenantId: string,
): Promise<
  | { kind: "redirect"; authorizeUrl: string }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "unavailable" }
> {
  const token = await readCsrfToken();
  if (token.kind !== "token") return token;
  try {
    const response = await fetch(
      `/api/v1/install/repair/${encodeURIComponent(tenantId)}`,
      {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        headers: {
          accept: "application/json",
          "x-csrf-token": token.value,
        },
      },
    );
    if (response.status === 401) return { kind: "unauthenticated" };
    if (response.status === 403 || response.status === 409) {
      return { kind: "forbidden" };
    }
    if (!response.ok) return { kind: "unavailable" };
    const body = (await response.json()) as { authorize_url?: unknown };
    if (
      typeof body.authorize_url !== "string" ||
      !isDiscordAuthorizeUrl(body.authorize_url)
    ) {
      return { kind: "unavailable" };
    }
    return { kind: "redirect", authorizeUrl: body.authorize_url };
  } catch {
    return { kind: "unavailable" };
  }
}

export async function logoutSession(): Promise<"done" | Failure> {
  const token = await readCsrfToken();
  if (token.kind === "unauthenticated") return "unauthenticated";
  if (token.kind !== "token") return "unavailable";
  try {
    const response = await fetch("/api/v1/session/logout", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "x-csrf-token": token.value,
      },
    });
    if (response.status === 204) return "done";
    if (response.status === 401) return "unauthenticated";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}
