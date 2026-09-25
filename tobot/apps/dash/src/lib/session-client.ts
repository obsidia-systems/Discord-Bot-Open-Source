import { guildHomeAccess } from "./shell-state";

export type WalletBody = {
  wallet: { tenant_id: string; currency_id: string; member_id: string; current: number; available: number; journal_sequence: number;
    recent_postings: {transaction_id:string;kind:string;amount:number;journal_sequence:number;occurred_at:string}[] } | null;
  projection: { balance: number; journal_sequence: number; projection_watermark_unix: number } | null;
};
export type EconomyBody = {
  currency: { revision_id: string; starting_grant: number; wallet_ceiling: number; issuance_ceiling: number; credit_enabled: boolean; write_ready: boolean } | null;
  daily: { revision_id: string; currency_revision_id: string; amount: number; enabled: boolean } | null;
  ready: boolean;
};

export async function readWallet(tenant: string): Promise<{ kind: "ready"; body: WalletBody } | { kind: "unauthenticated" | "no-access" | "unavailable" }> {
  try {
    const response = await fetch(`/api/v1/guilds/${encodeURIComponent(tenant)}/wallet`, {credentials:"include",cache:"no-store",headers:jsonHeaders});
    if (response.status===401) return {kind:"unauthenticated"};
    if (response.status===403 || response.status===404) return {kind:"no-access"};
    if (!response.ok) return {kind:"unavailable"};
    return {kind:"ready",body:(await response.json()) as WalletBody};
  } catch {return {kind:"unavailable"};}
}

export async function readEconomy(tenant: string): Promise<{ kind: "ready"; body: EconomyBody } | { kind: "unauthenticated" | "no-access" | "unavailable" }> {
  try {
    const response = await fetch(`/api/v1/guilds/${encodeURIComponent(tenant)}/economy`, {credentials:"include",cache:"no-store",headers:jsonHeaders});
    if (response.status===401) return {kind:"unauthenticated"};
    if (response.status===403 || response.status===404) return {kind:"no-access"};
    if (!response.ok) return {kind:"unavailable"};
    return {kind:"ready",body:(await response.json()) as EconomyBody};
  } catch {return {kind:"unavailable"};}
}

export async function publishEconomy(tenant: string,request: {starting_grant:number;wallet_ceiling:number;issuance_ceiling:number;daily_amount:number}): Promise<"done"|"unauthenticated"|"no-access"|"invalid"|"unavailable"> {
  const csrf=await readCsrfToken();
  if (csrf.kind!=="token") return csrf.kind;
  try {
    const response=await fetch(`/api/v1/guilds/${encodeURIComponent(tenant)}/economy`,{
      method:"POST",credentials:"include",cache:"no-store",headers:{...jsonHeaders,"content-type":"application/json","x-csrf-token":csrf.value},body:JSON.stringify(request),
    });
    if (response.status===201) return "done";
    if (response.status===401) return "unauthenticated";
    if (response.status===403 || response.status===404) return "no-access";
    if (response.status===400) return "invalid";
    return "unavailable";
  } catch {return "unavailable";}
}

export async function setEconomyCircuit(tenant:string,creditEnabled:boolean,dailyEnabled:boolean):Promise<"done"|"unauthenticated"|"no-access"|"unavailable"> {
  const csrf=await readCsrfToken();
  if (csrf.kind!=="token") return csrf.kind;
  try {
    const response=await fetch(`/api/v1/guilds/${encodeURIComponent(tenant)}/economy/circuit`,{
      method:"POST",credentials:"include",cache:"no-store",headers:{...jsonHeaders,"content-type":"application/json","x-csrf-token":csrf.value},
      body:JSON.stringify({credit_enabled:creditEnabled,daily_enabled:dailyEnabled}),
    });
    if (response.status===204) return "done";
    if (response.status===401) return "unauthenticated";
    if (response.status===403 || response.status===404) return "no-access";
    return "unavailable";
  } catch {return "unavailable";}
}

export async function readMemberGuilds(): Promise<{kind:"ready";guilds:{tenant_id:string;guild_id:string;name:string|null}[]} | {kind:"unauthenticated"|"unavailable"}> {
  try {
    const response=await fetch("/api/v1/member/guilds",{credentials:"include",cache:"no-store",headers:jsonHeaders});
    if (response.status===401) return {kind:"unauthenticated"};
    if (!response.ok) return {kind:"unavailable"};
    const body=(await response.json()) as {guilds?:{tenant_id:string;guild_id:string;name:string|null}[]};
    return {kind:"ready",guilds:Array.isArray(body.guilds)?body.guilds:[]};
  } catch {return {kind:"unavailable"};}
}

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

export type CaseSummary = {
  case_id: string;
  display_number: number;
  action: string;
  target_label: string;
  status: string;
  projection_watermark_unix: number;
};

export type WelcomeBody = {
  revision_id: string | null;
  revision: number | null;
  channel_id: string | null;
  body: string | null;
  last_delivery: {
    intent_id: string;
    status: string;
    provider_message_id: string | null;
    projection_watermark_unix: number;
  } | null;
};

export type WelcomeChannel = { id: string; name: string };

export type SupportTicket = {
  case_id: string;
  support_number: number;
  member_id: string;
  state: "Open" | "Claimed" | "Closed";
  version: number;
  projection_watermark_unix: number;
};

export type SupportInbox = {
  panel: {
    revision_id: string;
    channel_id: string;
    button_label: string;
    message_id: string;
    state: string;
  } | null;
  tickets: SupportTicket[];
};

export async function readSupportInbox(tenantId: string): Promise<
  | { kind: "ready"; body: SupportInbox; channels: WelcomeChannel[] }
  | { kind: "unauthenticated" }
  | { kind: "no-access" }
  | { kind: "unavailable" }
> {
  try {
    const path = `/api/v1/guilds/${encodeURIComponent(tenantId)}`;
    const response = await fetch(`${path}/support`, { credentials: "include", cache: "no-store", headers: jsonHeaders });
    const access = guildHomeAccess(response.status);
    if (access === "unauthenticated") return { kind: "unauthenticated" };
    if (access === "no-access") return { kind: "no-access" };
    if (access !== "ok") return { kind: "unavailable" };
    const [channelsResponse,panelResponse] = await Promise.all([
      fetch(`${path}/welcome/channels`, { credentials: "include", cache: "no-store", headers: jsonHeaders }),
      fetch(`${path}/support/panel`, { credentials: "include", cache: "no-store", headers: jsonHeaders }),
    ]);
    if (!channelsResponse.ok || !panelResponse.ok) return { kind: "unavailable" };
    const inbox = (await response.json()) as Pick<SupportInbox,"tickets">;
    const panel = (await panelResponse.json()) as Pick<SupportInbox,"panel">;
    const body: SupportInbox = { tickets: inbox.tickets, panel: panel.panel };
    const channels = (await channelsResponse.json()) as WelcomeChannel[];
    if (!Array.isArray(body.tickets) || !Array.isArray(channels)) return { kind: "unavailable" };
    return { kind: "ready", body, channels };
  } catch { return { kind: "unavailable" }; }
}

export async function publishSupportPanel(tenantId: string, channelId: string, buttonLabel: string): Promise<
  "done" | "unauthenticated" | "no-access" | "invalid" | "discord-missing-permissions" | "discord-channel-unavailable" | "discord-invalid-request" | "unavailable"
> {
  const csrf = await readCsrfToken();
  if (csrf.kind !== "token") return csrf.kind;
  try {
    const response = await fetch(`/api/v1/guilds/${encodeURIComponent(tenantId)}/support/panel`, {
      method: "POST", credentials: "include", cache: "no-store",
      headers: { ...jsonHeaders, "content-type": "application/json", "x-csrf-token": csrf.value },
      body: JSON.stringify({ channel_id: channelId, button_label: buttonLabel }),
    });
    if (response.status === 201) return "done";
    if (response.status === 401) return "unauthenticated";
    if (response.status === 403 || response.status === 404) return "no-access";
    if (response.status === 400) return "invalid";
    if (response.status === 424) {
      const body = (await response.json()) as { code?: unknown };
      if (body.code === "discord_missing_permissions") return "discord-missing-permissions";
      if (body.code === "discord_channel_unavailable") return "discord-channel-unavailable";
      if (body.code === "discord_invalid_request") return "discord-invalid-request";
    }
    return "unavailable";
  } catch { return "unavailable"; }
}

export async function transitionSupportTicket(tenantId: string, caseId: string, version: number, action: "claim" | "close"): Promise<
  "done" | "stale" | "unauthenticated" | "no-access" | "unavailable"
> {
  const csrf = await readCsrfToken();
  if (csrf.kind !== "token") return csrf.kind;
  try {
    const response = await fetch(`/api/v1/guilds/${encodeURIComponent(tenantId)}/support/${encodeURIComponent(caseId)}/${action}`, {
      method: "POST", credentials: "include", cache: "no-store",
      headers: { ...jsonHeaders, "content-type": "application/json", "x-csrf-token": csrf.value },
      body: JSON.stringify({ version }),
    });
    if (response.ok) return "done";
    if (response.status === 409) return "stale";
    if (response.status === 401) return "unauthenticated";
    if (response.status === 403 || response.status === 404) return "no-access";
    return "unavailable";
  } catch { return "unavailable"; }
}

export async function readWelcomeStatus(tenantId: string): Promise<
  | { kind: "ready"; body: WelcomeBody }
  | { kind: "unauthenticated" }
  | { kind: "no-access" }
  | { kind: "unavailable" }
> {
  try {
    const response = await fetch(`/api/v1/guilds/${encodeURIComponent(tenantId)}/welcome`, {
      credentials: "include", cache: "no-store", headers: jsonHeaders,
    });
    const access = guildHomeAccess(response.status);
    if (access === "unauthenticated") return { kind: "unauthenticated" };
    if (access === "no-access") return { kind: "no-access" };
    if (access !== "ok") return { kind: "unavailable" };
    return { kind: "ready", body: (await response.json()) as WelcomeBody };
  } catch {
    return { kind: "unavailable" };
  }
}

export async function readWelcome(tenantId: string): Promise<
  | { kind: "ready"; body: WelcomeBody; channels: WelcomeChannel[] }
  | { kind: "unauthenticated" }
  | { kind: "no-access" }
  | { kind: "unavailable" }
> {
  try {
    const path = `/api/v1/guilds/${encodeURIComponent(tenantId)}/welcome`;
    const [status, channelResponse] = await Promise.all([
      readWelcomeStatus(tenantId),
      fetch(`${path}/channels`, { credentials: "include", cache: "no-store", headers: jsonHeaders }),
    ]);
    if (status.kind !== "ready") return status;
    if (!channelResponse.ok) return { kind: "unavailable" };
    const body = status.body;
    const channels = (await channelResponse.json()) as WelcomeChannel[];
    if (!Array.isArray(channels) || !body || typeof body !== "object") return { kind: "unavailable" };
    return { kind: "ready", body, channels };
  } catch {
    return { kind: "unavailable" };
  }
}

export type RoleBody = {
  revision_id: string | null;
  revision: number | null;
  role_id: string | null;
  last_assignment: {
    intent_id: string;
    role_id: string;
    member_id: string;
    status: string;
    projection_watermark_unix: number;
  } | null;
};

export type RoleChoice = { id: string; name: string };

export async function readAutomaticRoleStatus(tenantId: string): Promise<
  | { kind: "ready"; body: RoleBody }
  | { kind: "unauthenticated" }
  | { kind: "no-access" }
  | { kind: "unavailable" }
> {
  try {
    const response = await fetch(`/api/v1/guilds/${encodeURIComponent(tenantId)}/roles`, {
      credentials: "include", cache: "no-store", headers: jsonHeaders,
    });
    const access = guildHomeAccess(response.status);
    if (access === "unauthenticated") return { kind: "unauthenticated" };
    if (access === "no-access") return { kind: "no-access" };
    if (access !== "ok") return { kind: "unavailable" };
    return { kind: "ready", body: (await response.json()) as RoleBody };
  } catch {
    return { kind: "unavailable" };
  }
}

export async function readAutomaticRole(tenantId: string): Promise<
  | { kind: "ready"; body: RoleBody; roles: RoleChoice[] }
  | { kind: "unauthenticated" }
  | { kind: "no-access" }
  | { kind: "unavailable" }
> {
  try {
    const [status, catalog] = await Promise.all([
      readAutomaticRoleStatus(tenantId),
      fetch(`/api/v1/guilds/${encodeURIComponent(tenantId)}/roles/catalog`, {
        credentials: "include", cache: "no-store", headers: jsonHeaders,
      }),
    ]);
    if (status.kind !== "ready") return status;
    if (!catalog.ok) return { kind: "unavailable" };
    const body = (await catalog.json()) as { roles?: RoleChoice[] };
    return { kind: "ready", body: status.body, roles: Array.isArray(body.roles) ? body.roles : [] };
  } catch {
    return { kind: "unavailable" };
  }
}

export async function publishAutomaticRole(
  tenantId: string,
  roleId: string,
): Promise<"done" | "unauthenticated" | "no-access" | "invalid" | "unavailable"> {
  const csrf = await readCsrfToken();
  if (csrf.kind !== "token") return csrf.kind;
  try {
    const response = await fetch(`/api/v1/guilds/${encodeURIComponent(tenantId)}/roles`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { ...jsonHeaders, "content-type": "application/json", "x-csrf-token": csrf.value },
      body: JSON.stringify({ role_id: roleId }),
    });
    if (response.status === 201) return "done";
    if (response.status === 401) return "unauthenticated";
    if (response.status === 404 || response.status === 403) return "no-access";
    if (response.status === 400) return "invalid";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

export type ProgressionBody = {
  revision_id: string | null;
  revision: number | null;
  channel_id: string | null;
  award: number | null;
  last_member: {
    member_id: string;
    balance: number;
    level: number;
    source_message_id: string;
    projection_watermark_unix: number;
  } | null;
};

export async function readProgressionForm(tenantId: string): Promise<
  | { kind: "ready"; body: ProgressionBody; channels: WelcomeChannel[] }
  | { kind: "unauthenticated" }
  | { kind: "no-access" }
  | { kind: "unavailable" }
> {
  try {
    const [status, channelResponse] = await Promise.all([
      readProgression(tenantId),
      fetch(`/api/v1/guilds/${encodeURIComponent(tenantId)}/welcome/channels`, {
        credentials: "include", cache: "no-store", headers: jsonHeaders,
      }),
    ]);
    if (status.kind !== "ready") return status;
    if (!channelResponse.ok) return { kind: "unavailable" };
    const channels = (await channelResponse.json()) as WelcomeChannel[];
    if (!Array.isArray(channels)) return { kind: "unavailable" };
    return { kind: "ready", body: status.body, channels };
  } catch {
    return { kind: "unavailable" };
  }
}

export async function readProgression(tenantId: string): Promise<
  | { kind: "ready"; body: ProgressionBody }
  | { kind: "unauthenticated" }
  | { kind: "no-access" }
  | { kind: "unavailable" }
> {
  try {
    const response = await fetch(`/api/v1/guilds/${encodeURIComponent(tenantId)}/progression`, {
      credentials: "include", cache: "no-store", headers: jsonHeaders,
    });
    const access = guildHomeAccess(response.status);
    if (access === "unauthenticated") return { kind: "unauthenticated" };
    if (access === "no-access") return { kind: "no-access" };
    if (access !== "ok") return { kind: "unavailable" };
    return { kind: "ready", body: (await response.json()) as ProgressionBody };
  } catch {
    return { kind: "unavailable" };
  }
}

export async function publishProgression(
  tenantId: string,
  channelId: string,
  award: number,
): Promise<"done" | "unauthenticated" | "no-access" | "invalid" | "unavailable"> {
  const csrf = await readCsrfToken();
  if (csrf.kind !== "token") return csrf.kind;
  try {
    const response = await fetch(`/api/v1/guilds/${encodeURIComponent(tenantId)}/progression`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { ...jsonHeaders, "content-type": "application/json", "x-csrf-token": csrf.value },
      body: JSON.stringify({ channel_id: channelId, award }),
    });
    if (response.status === 201) return "done";
    if (response.status === 401) return "unauthenticated";
    if (response.status === 404 || response.status === 403) return "no-access";
    if (response.status === 400) return "invalid";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function publishWelcome(tenantId: string, channelId: string, body: string): Promise<
  "done" | "unauthenticated" | "no-access" | "invalid" | "unavailable"
> {
  const csrf = await readCsrfToken();
  if (csrf.kind !== "token") return csrf.kind;
  try {
    const response = await fetch(`/api/v1/guilds/${encodeURIComponent(tenantId)}/welcome`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { ...jsonHeaders, "content-type": "application/json", "x-csrf-token": csrf.value },
      body: JSON.stringify({ channel_id: channelId, body }),
    });
    if (response.status === 201) return "done";
    if (response.status === 401) return "unauthenticated";
    if (response.status === 404 || response.status === 403) return "no-access";
    if (response.status === 400) return "invalid";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

export type CaseDetail = CaseSummary & {
  actor_provider_user_id: string;
  target_user_id: string;
  reason: string;
  expires_at_unix: number | null;
};

export async function readCases(
  tenantId: string,
): Promise<
  | { kind: "ready"; cases: CaseSummary[] }
  | { kind: "unauthenticated" }
  | { kind: "no-access" }
  | { kind: "unavailable" }
> {
  try {
    const response = await fetch(`/api/v1/guilds/${encodeURIComponent(tenantId)}/cases`, {
      credentials: "include",
      cache: "no-store",
      headers: jsonHeaders,
    });
    const access = guildHomeAccess(response.status);
    if (access === "unauthenticated") return { kind: "unauthenticated" };
    if (access === "no-access") return { kind: "no-access" };
    if (access !== "ok") return { kind: "unavailable" };
    const body = (await response.json()) as { cases?: CaseSummary[] };
    return { kind: "ready", cases: Array.isArray(body.cases) ? body.cases : [] };
  } catch {
    return { kind: "unavailable" };
  }
}

export async function readCase(
  tenantId: string,
  caseId: string,
): Promise<
  | { kind: "ready"; body: CaseDetail }
  | { kind: "unauthenticated" }
  | { kind: "no-access" }
  | { kind: "unavailable" }
> {
  try {
    const response = await fetch(
      `/api/v1/guilds/${encodeURIComponent(tenantId)}/cases/${encodeURIComponent(caseId)}`,
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
    const body = (await response.json()) as Partial<CaseDetail>;
    if (typeof body.status !== "string" || typeof body.projection_watermark_unix !== "number") {
      return { kind: "unavailable" };
    }
    return { kind: "ready", body: body as CaseDetail };
  } catch {
    return { kind: "unavailable" };
  }
}
