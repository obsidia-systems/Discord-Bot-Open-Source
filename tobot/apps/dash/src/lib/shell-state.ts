/** Ventana de frescura de descubrimiento y proyección, en segundos. */
export const FRESHNESS_WINDOW_SECONDS = 15 * 60;

export const VERIFYING_POLL_MS = 2_000;
export const IDLE_POLL_MS = 15_000;

const CAPABILITY_KEYS = [
  "bot_presence",
  "application_install_context",
] as const;

const BROWSER_ERRORS = {
  rejected: "Discord declined the request, or this account cannot continue.",
  expired: "That attempt expired. Start again.",
  mismatch:
    "The request did not match the original sign-in or install attempt.",
  unavailable: "The service could not complete the request. Try again shortly.",
} as const;

export type InstallationView =
  | { kind: "not-enabled" }
  | { kind: "verifying" }
  | { kind: "installed" }
  | { kind: "degraded"; reasons: string[] }
  | { kind: "removed"; reasons: string[] }
  | { kind: "pending" }
  | { kind: "unknown" };

export type HomeAccess = "ok" | "unauthenticated" | "no-access" | "unavailable";

export type Freshness = "fresh" | "stale";

/**
 * Deriva la vista del shell. Sin tenant no hay instalación; el estado proyectado
 * no concede autoridad.
 */
export function installationView(input: {
  tenantId: string | null;
  installationState: string | null;
  capabilities: Record<string, unknown> | null;
}): InstallationView {
  if (!input.tenantId) return { kind: "not-enabled" };
  switch (input.installationState) {
    case "Verifying":
      return { kind: "verifying" };
    case "Installed":
      return { kind: "installed" };
    case "Degraded":
      return {
        kind: "degraded",
        reasons: capabilityReasons(input.capabilities),
      };
    case "Removed":
      return {
        kind: "removed",
        reasons: capabilityReasons(input.capabilities),
      };
    case "Pending":
      return { kind: "pending" };
    default:
      return { kind: "unknown" };
  }
}

/** Razones legibles de las capacidades S0 que no están Healthy. */
export function capabilityReasons(
  capabilities: Record<string, unknown> | null,
): string[] {
  if (!capabilities) return [];
  const reasons: string[] = [];
  for (const key of CAPABILITY_KEYS) {
    const value = capabilities[key];
    if (value === undefined || value === "Healthy") continue;
    const detail = typeof value === "string" ? value : "unavailable";
    reasons.push(`${key}: ${detail}`);
  }
  return reasons;
}

export function installationLabel(view: InstallationView): string {
  switch (view.kind) {
    case "not-enabled":
      return "Not enabled";
    case "verifying":
      return "Verifying";
    case "installed":
      return "Installed";
    case "degraded":
      return "Degraded";
    case "removed":
      return "Removed";
    case "pending":
      return "Pending";
    case "unknown":
      return "Unavailable";
  }
}

export function discoveryFreshness(
  nowUnix: number,
  expiresAtUnix: number,
): Freshness {
  return nowUnix >= expiresAtUnix ? "stale" : "fresh";
}

export function projectionFreshness(ageSeconds: number): Freshness {
  return ageSeconds > FRESHNESS_WINDOW_SECONDS ? "stale" : "fresh";
}

export function projectionAgeLabel(ageSeconds: number): string {
  return `Projection age ${ageSeconds}s (${projectionFreshness(ageSeconds)}).`;
}

const GUILD_ID = /^\d{17,22}$/;
const ICON_HASH = /^(?:a_)?[0-9a-fA-F]{32}$/;

/** Icono público de Discord. Un hash que no es el de Discord no se convierte en URL. */
export function guildIconUrl(guildId: string, iconHash: string | null): string | null {
  if (!GUILD_ID.test(guildId) || iconHash === null || !ICON_HASH.test(iconHash)) return null;
  const extension = iconHash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.${extension}`;
}

export function guildGroup(view: InstallationView): "with" | "without" {
  return view.kind === "not-enabled" ? "without" : "with";
}

export function discoveryExpiryLabel(
  nowUnix: number,
  expiresAtUnix: number,
): string {
  return `Discovery expires at ${expiresAtUnix} (${discoveryFreshness(nowUnix, expiresAtUnix)}).`;
}

export function guildHomeAccess(status: number): HomeAccess {
  if (status === 200) return "ok";
  if (status === 401) return "unauthenticated";
  if (status === 404) return "no-access";
  return "unavailable";
}

export function browserErrorMessage(reason: string | null): string {
  if (reason && reason in BROWSER_ERRORS) {
    return BROWSER_ERRORS[reason as keyof typeof BROWSER_ERRORS];
  }
  return "The request could not be completed.";
}

export function discoveryPollDelay(
  installationStates: readonly string[],
): number {
  return installationStates.includes("Verifying")
    ? VERIFYING_POLL_MS
    : IDLE_POLL_MS;
}

const TENANT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTenantId(value: string): boolean {
  return TENANT_ID.test(value);
}

/**
 * Leer un guild no concede autoridad. La autoridad sale de la sesión y del
 * predicado de tenant que el servidor ya vinculó.
 */
export function selectionGrantsAuthority(): false {
  return false;
}

export function shellReadAllowed(input: {
  authenticated: boolean;
  routeTenantId: string;
  authorizedTenantIds: readonly string[];
}): boolean {
  if (!input.authenticated || !isTenantId(input.routeTenantId)) return false;
  return input.authorizedTenantIds.includes(input.routeTenantId);
}
