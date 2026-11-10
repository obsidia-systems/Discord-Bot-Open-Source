import { guildHomeAccess } from "./shell-state";

export type WalletBody = {
  wallet: { tenant_id: string; currency_id: string; member_id: string; current: number; available: number; journal_sequence: number;
    recent_postings: {transaction_id:string;kind:string;amount:number;journal_sequence:number;occurred_at:string}[] } | null;
  projection: { balance: number; journal_sequence: number; projection_watermark_unix: number } | null;
};
export type BillingBody = {
  entitlement: {generation:number;state:string;feature_key:string;benefits:Array<{kind:"feature"|"perk";key:string}|{kind:"limit";key:string;quantity:number;unit:string}>;valid_until:number|null;active:boolean;source_sequence:number}|null;
  billing: {order_id:string|null;order_state:string|null;subscription_state?:string|null;invoice_state?:string|null;grace_until?:number|null;purchased_offer?:{name:string;price_minor:number;currency:string;interval:string;support_url?:string}|null;payer_enrolled:boolean}|null;
  offers:Array<{revision_id:string;product_key:string;display_name:string;currency:string;unit_amount:number;interval_name:string;merchant_of_record:string;terms_url:string;privacy_url:string;support_url:string;benefits:Array<{kind:"feature"|"perk";key:string}|{kind:"limit";key:string;quantity:number;unit:string}>}>;
};

export type AiUsage = {
  available: number;
  reserved: number;
  operations: Array<{operation_id:string;operation_state:string;reservation_state:string;reserved:number;captured:number;completed:boolean;reply:string|null}>;
};

export async function readAiUsage(tenant:string):Promise<{kind:"ready";body:AiUsage}|{kind:"unauthenticated"|"no-access"|"unavailable"}> {
  try {
    const response=await fetch(`/api/v1/guilds/${encodeURIComponent(tenant)}/ai`,{credentials:"include",cache:"no-store",headers:jsonHeaders});
    if (response.status===401) return {kind:"unauthenticated"};
    if (response.status===403||response.status===404) return {kind:"no-access"};
    if (!response.ok) return {kind:"unavailable"};
    return {kind:"ready",body:(await response.json()) as AiUsage};
  } catch {return {kind:"unavailable"};}
}

export async function readBilling(tenant:string):Promise<{kind:"ready";body:BillingBody}|{kind:"unauthenticated"|"no-access"|"unavailable"}> {
  try {
    const response=await fetch(`/api/v1/guilds/${encodeURIComponent(tenant)}/billing`,{credentials:"include",cache:"no-store",headers:jsonHeaders});
    if (response.status===401) return {kind:"unauthenticated"};
    if (response.status===403||response.status===404) return {kind:"no-access"};
    if (!response.ok) return {kind:"unavailable"};
    return {kind:"ready",body:(await response.json()) as BillingBody};
  } catch {return {kind:"unavailable"};}
}

export async function startBillingCheckout(tenant:string,semanticKey:string,revisionId:string):Promise<{kind:"ready";url:string}|{kind:"unauthenticated"|"no-access"|"conflict"|"unavailable"}> {
  const csrf=await readCsrfToken();
  if (csrf.kind!=="token") return {kind:csrf.kind};
  try {
    const response=await fetch(`/api/v1/guilds/${encodeURIComponent(tenant)}/billing/checkout`,{
      method:"POST",credentials:"include",cache:"no-store",headers:{...jsonHeaders,"content-type":"application/json","x-csrf-token":csrf.value},
      body:JSON.stringify({semantic_key:semanticKey,revision_id:revisionId}),
    });
    if (response.status===401) return {kind:"unauthenticated"};
    if (response.status===403||response.status===404) return {kind:"no-access"};
    if (response.status===409) return {kind:"conflict"};
    if (!response.ok) return {kind:"unavailable"};
    const body=(await response.json()) as {checkout_url?:unknown};
    if (typeof body.checkout_url!=="string") return {kind:"unavailable"};
    const url=new URL(body.checkout_url);
    if (url.protocol!=="https:"||url.hostname!=="checkout.stripe.com") return {kind:"unavailable"};
    return {kind:"ready",url:url.href};
  } catch {return {kind:"unavailable"};}
}
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
  icon_hash: string | null;
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
  name: string;
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

export async function readSessionAccount(): Promise<
  { kind: "ready"; name: string | null; avatarUrl: string | null } | { kind: "unavailable" }
> {
  try {
    const response = await fetch("/api/v1/session", {
      credentials: "include",
      cache: "no-store",
      headers: jsonHeaders,
    });
    if (!response.ok) return { kind: "unavailable" };
    const body = (await response.json()) as { name?: unknown; avatar_url?: unknown };
    const name =
      typeof body.name === "string" && body.name.length > 0 && body.name.length <= 32
        ? body.name
        : null;
    return { kind: "ready", name, avatarUrl: discordAvatarUrl(body.avatar_url) };
  } catch {
    return { kind: "unavailable" };
  }
}

function discordAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "cdn.discordapp.com") return null;
  if (!url.pathname.startsWith("/avatars/") && !url.pathname.startsWith("/embed/avatars/")) {
    return null;
  }
  return url.toString();
}

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
        name: typeof body.name === "string" ? body.name : "",
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
  state: "Provisioning" | "Open" | "Claimed" | "Closing" | "Closed";
  version: number;
  channel_id: string | null;
  rating: number | null;
  outside_hours: boolean;
  answers: { question: string; answer: string }[];
  transcript_ready: boolean;
  projection_watermark_unix: number;
};

export type SupportQuestionDraft = { title: string; required: boolean };
export type SupportWindowDraft = { weekday: number; start_minute: number; end_minute: number };

export type SupportPanelDraft = {
  name: string;
  channelId: string;
  buttonLabel: string;
  categoryId: string;
  overflowCategoryId: string;
  staffRoleId: string;
  questions: SupportQuestionDraft[];
  timezoneOffsetMinutes: number;
  weeklyHours: SupportWindowDraft[];
  closedHours: "open" | "block" | "warn";
  confirmClose: boolean;
  inactivityMinutes: string;
  transcriptEnabled: boolean;
  logChannelId: string;
};

export type SupportLimits = {
  support_open: boolean;
  open_per_member: number;
  open_cap: number | null;
};

export type SupportPanelChoice = {
  revision_id: string;
  name: string;
  revision: number;
  channel_id: string;
  button_label: string;
  state: string;
  message_id: string;
  category_id: string | null;
  overflow_category_id: string | null;
  staff_role_id: string | null;
  questions: SupportQuestionDraft[];
  timezone_offset_minutes: number | null;
  weekly_hours: SupportWindowDraft[];
  closed_hours: string;
  confirm_close: boolean;
  inactivity_minutes: number | null;
  transcript_enabled: boolean;
  log_channel_id: string | null;
};

export type SupportTranscriptLine = {
  message_id: string;
  author_id: string;
  body: string | null;
  observed_at_unix: number;
};

export type SupportInbox = {
  panels: SupportPanelChoice[];
  limits: SupportLimits | null;
  tickets: SupportTicket[];
  categories: WelcomeChannel[];
  roles: RoleChoice[];
};

async function listed<T>(response: Response, key?: string): Promise<T[]> {
  if (!response.ok) return [];
  const body = (await response.json()) as unknown;
  const value = key === undefined ? body : (body as Record<string, unknown>)[key];
  return Array.isArray(value) ? value as T[] : [];
}

export async function readSupportInbox(tenantId: string, catalog = true): Promise<
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
    const panelsResponse = await fetch(`${path}/support/panels`, { credentials: "include", cache: "no-store", headers: jsonHeaders });
    if (!panelsResponse.ok) return { kind: "unavailable" };
    const [channels, categories, roles] = catalog
      ? await Promise.all([
          fetch(`${path}/welcome/channels`, { credentials: "include", cache: "no-store", headers: jsonHeaders }).then((item) => listed<WelcomeChannel>(item)),
          fetch(`${path}/support/categories`, { credentials: "include", cache: "no-store", headers: jsonHeaders }).then((item) => listed<WelcomeChannel>(item, "categories")),
          fetch(`${path}/roles/catalog`, { credentials: "include", cache: "no-store", headers: jsonHeaders }).then((item) => listed<RoleChoice>(item, "roles")),
        ])
      : [[], [], []] as [WelcomeChannel[], WelcomeChannel[], RoleChoice[]];
    const inbox = (await response.json()) as Pick<SupportInbox, "tickets">;
    const panelsBody = (await panelsResponse.json()) as { panels?: SupportPanelChoice[]; limits?: SupportLimits };
    if (!Array.isArray(inbox.tickets) || !Array.isArray(panelsBody.panels)) return { kind: "unavailable" };
    return {
      kind: "ready",
      channels,
      body: { tickets: inbox.tickets, panels: panelsBody.panels, limits: supportLimits(panelsBody.limits), categories, roles },
    };
  } catch { return { kind: "unavailable" }; }
}

export async function publishSupportPanel(tenantId: string, draft: SupportPanelDraft): Promise<
  "done" | "unauthenticated" | "no-access" | "invalid" | "discord-missing-permissions" | "discord-channel-unavailable" | "discord-invalid-request" | "unavailable"
> {
  const csrf = await readCsrfToken();
  if (csrf.kind !== "token") return csrf.kind;
  const inactivity = draft.inactivityMinutes.trim() === "" ? null : Number(draft.inactivityMinutes);
  try {
    const response = await fetch(`/api/v1/guilds/${encodeURIComponent(tenantId)}/support/panel`, {
      method: "POST", credentials: "include", cache: "no-store",
      headers: { ...jsonHeaders, "content-type": "application/json", "x-csrf-token": csrf.value },
      body: JSON.stringify({
        name: draft.name,
        channel_id: draft.channelId,
        button_label: draft.buttonLabel,
        category_id: draft.categoryId,
        overflow_category_id: draft.overflowCategoryId || null,
        staff_role_id: draft.staffRoleId,
        questions: draft.questions.filter((question) => question.title.trim() !== ""),
        timezone_offset_minutes: draft.timezoneOffsetMinutes,
        weekly_hours: draft.weeklyHours,
        closed_hours: draft.closedHours,
        confirm_close: draft.confirmClose,
        inactivity_minutes: Number.isInteger(inactivity) ? inactivity : null,
        transcript_enabled: draft.transcriptEnabled,
        log_channel_id: draft.transcriptEnabled ? draft.logChannelId : null,
      }),
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

export async function saveSupportPanel(tenantId: string, revisionId: string, draft: SupportPanelDraft): Promise<
  "done" | "unauthenticated" | "no-access" | "invalid" | "unavailable"
> {
  const csrf = await readCsrfToken();
  if (csrf.kind !== "token") return csrf.kind;
  const inactivity = draft.inactivityMinutes.trim() === "" ? null : Number(draft.inactivityMinutes);
  try {
    const response = await fetch(`/api/v1/guilds/${encodeURIComponent(tenantId)}/support/panels/${encodeURIComponent(revisionId)}`, {
      method: "POST", credentials: "include", cache: "no-store",
      headers: { ...jsonHeaders, "content-type": "application/json", "x-csrf-token": csrf.value },
      body: JSON.stringify({
        name: draft.name,
        channel_id: draft.channelId,
        button_label: draft.buttonLabel,
        category_id: draft.categoryId,
        overflow_category_id: draft.overflowCategoryId || null,
        staff_role_id: draft.staffRoleId,
        questions: draft.questions.filter((question) => question.title.trim() !== ""),
        timezone_offset_minutes: draft.timezoneOffsetMinutes,
        weekly_hours: draft.weeklyHours,
        closed_hours: draft.closedHours,
        confirm_close: draft.confirmClose,
        inactivity_minutes: Number.isInteger(inactivity) ? inactivity : null,
        transcript_enabled: draft.transcriptEnabled,
        log_channel_id: draft.transcriptEnabled ? draft.logChannelId : null,
      }),
    });
    if (response.status === 204) return "done";
    if (response.status === 401) return "unauthenticated";
    if (response.status === 403 || response.status === 404) return "no-access";
    if (response.status === 400) return "invalid";
    return "unavailable";
  } catch { return "unavailable"; }
}

function supportLimits(value: SupportLimits | undefined): SupportLimits | null {
  if (!value || typeof value.support_open !== "boolean" || typeof value.open_per_member !== "number") return null;
  if (value.open_cap !== null && typeof value.open_cap !== "number") return null;
  return value;
}

export async function readSupportTicket(tenantId: string, caseId: string): Promise<
  | { kind: "ready"; ticket: SupportTicket; lines: SupportTranscriptLine[] }
  | { kind: "unauthenticated" }
  | { kind: "no-access" }
  | { kind: "unavailable" }
> {
  try {
    const response = await fetch(`/api/v1/guilds/${encodeURIComponent(tenantId)}/support/${encodeURIComponent(caseId)}`, {
      credentials: "include", cache: "no-store", headers: jsonHeaders,
    });
    const access = guildHomeAccess(response.status);
    if (access === "unauthenticated") return { kind: "unauthenticated" };
    if (access === "no-access") return { kind: "no-access" };
    if (access !== "ok") return { kind: "unavailable" };
    const body = (await response.json()) as { ticket?: SupportTicket; lines?: SupportTranscriptLine[] };
    if (!body.ticket) return { kind: "unavailable" };
    return { kind: "ready", ticket: body.ticket, lines: Array.isArray(body.lines) ? body.lines : [] };
  } catch { return { kind: "unavailable" }; }
}

export async function transitionSupportTicket(tenantId: string, caseId: string, version: number, action: "claim" | "close" | "unclaim"): Promise<
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
