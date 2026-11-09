export type ProbeState = "up" | "not-ready" | "down";

export type MetricsState = "ok" | "rejected" | "unavailable" | "unconfigured";

export interface Gauge {
  name: string;
  value: number;
}

export interface ServiceReport {
  name: string;
  live: ProbeState;
  ready: ProbeState;
  reason: string;
  metrics: MetricsState;
}

export interface AdminStatus {
  observedAt: string;
  services: ServiceReport[];
  queues: Gauge[];
}

const OPERATIONAL_GAUGES = new Set([
  "tobot_installation_outbox_unpublished",
  "tobot_installation_outbox_oldest_age_seconds",
  "tobot_installation_outbox_max_publish_attempts",
  "tobot_installation_outbox_expired_leases",
  "tobot_edge_outbox_unpublished",
  "tobot_edge_outbox_oldest_age_seconds",
  "tobot_edge_outbox_max_publish_attempts",
  "tobot_edge_outbox_expired_leases",
  "tobot_degraded_installations",
  "tobot_auth_rejections_15m",
  "tobot_stream_pending",
  "tobot_gateway_session_established",
  "tobot_gateway_heartbeat_alive",
  "tobot_transport_http_429",
  "tobot_transport_invalid_requests_10m",
  "tobot_moderation_outbox_unpublished",
  "tobot_moderation_outbox_oldest_age_seconds",
  "tobot_moderation_outbox_max_publish_attempts",
  "tobot_moderation_outbox_expired_leases",
  "tobot_messaging_outbox_unpublished",
  "tobot_messaging_outbox_oldest_age_seconds",
  "tobot_messaging_outbox_max_publish_attempts",
  "tobot_messaging_outbox_expired_leases",
  "tobot_catalog_delivery_pending",
  "tobot_ledger_outbox_unpublished",
  "tobot_ledger_outbox_oldest_age_seconds",
  "tobot_ledger_outbox_expired_leases",
  "tobot_ai_reservations_uncertain",
  "tobot_ai_reservations_disputed",
  "tobot_stripe_receipts_pending",
  "tobot_ai_live",
  "tobot_ai_ready",
  "tobot_ledger_live",
  "tobot_ledger_ready",
  "tobot_billing_live",
  "tobot_billing_ready",
  "tobot_stripe_edge_live",
  "tobot_stripe_edge_ready",
]);

const READY_REASONS = new Set([
  "Database",
  "Vault",
  "Database and Vault",
  "Discord credentials",
  "Database and Discord credentials",
]);

const REMOTE_PROCESSES = [
  { name: "AI", live: "tobot_ai_live", ready: "tobot_ai_ready" },
  { name: "Monetary ledger", live: "tobot_ledger_live", ready: "tobot_ledger_ready" },
  { name: "Billing", live: "tobot_billing_live", ready: "tobot_billing_ready" },
  { name: "Stripe edge", live: "tobot_stripe_edge_live", ready: "tobot_stripe_edge_ready" },
] as const;

const HIDDEN_QUEUE_GAUGES = new Set([
  "tobot_gateway_session_established",
  "tobot_gateway_heartbeat_alive",
  ...REMOTE_PROCESSES.flatMap((process) => [process.live, process.ready]),
]);

const GAUGE_LINE = /^tobot_[a-z0-9_]+ -?\d+$/;

export function classifyProbe(status: number | null): ProbeState {
  if (status === 200 || status === 204) return "up";
  if (status === 503) return "not-ready";
  return "down";
}

export function parseGauges(body: string): Gauge[] {
  const gauges: Gauge[] = [];
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!GAUGE_LINE.test(trimmed)) continue;
    const [name, raw] = trimmed.split(" ");
    if (!name || raw === undefined || !OPERATIONAL_GAUGES.has(name)) continue;
    gauges.push({ name, value: Number(raw) });
  }
  return gauges;
}

export function readyReason(service: string, status: number | null, body: string): string {
  if (status === 200 || status === 204) return "";
  if (service === "Discord Edge") return edgeReason(body);
  const text = body.trim();
  return READY_REASONS.has(text) ? text : "";
}

function edgeReason(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      session_established?: boolean;
      heartbeat_alive?: boolean;
    };
    const session = parsed.session_established === false;
    const heartbeat = parsed.heartbeat_alive === false;
    if (session && heartbeat) return "Gateway session and heartbeat";
    if (session) return "Gateway session";
    if (heartbeat) return "Gateway heartbeat";
  } catch {
    return "";
  }
  return "";
}

export function remoteServices(gauges: Gauge[], metrics: MetricsState): ServiceReport[] {
  const value = (name: string) => gauges.find((gauge) => gauge.name === name)?.value ?? 0;
  return REMOTE_PROCESSES.map((process) => {
    const live: ProbeState = value(process.live) === 1 ? "up" : "down";
    const ready: ProbeState = value(process.ready) === 1 ? "up" : live === "up" ? "not-ready" : "down";
    const reason = live === "up" && ready !== "up" ? "Database" : "";
    return { name: process.name, live, ready, reason, metrics };
  });
}

export function queueGauges(gauges: Gauge[]): Gauge[] {
  return gauges.filter((gauge) => !HIDDEN_QUEUE_GAUGES.has(gauge.name));
}

export function metricsStateFor(
  status: number | null,
  configured: boolean,
): MetricsState {
  if (!configured) return "unconfigured";
  if (status === 200) return "ok";
  if (status === 401 || status === 403) return "rejected";
  return "unavailable";
}

interface ProbeResult {
  status: number | null;
  body: string;
}

async function probe(url: string, token?: string): Promise<ProbeResult> {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(1_500),
    });
    const body = await response.text();
    return { status: response.status, body: body.slice(0, 2_048) };
  } catch {
    return { status: null, body: "" };
  }
}

interface ProcessEnv {
  env: Record<string, string | undefined>;
}

function env(name: string): string | undefined {
  return (globalThis as { process?: ProcessEnv }).process?.env[name];
}

interface ServiceTarget {
  name: string;
  liveUrl: string;
  readyUrl: string;
  metricsUrl: string;
}

function targets(): ServiceTarget[] {
  const control = env("TOBOT_CONTROL_URL") ?? "http://control-plane:8080";
  const controlMetrics =
    env("TOBOT_CONTROL_METRICS_URL") ?? "http://control-plane:8083";
  const delivery = env("TOBOT_DELIVERY_URL") ?? "http://delivery:8081";
  const deliveryMetrics =
    env("TOBOT_DELIVERY_METRICS_URL") ?? "http://delivery:8084";
  const edge = env("TOBOT_EDGE_URL") ?? "http://discord-edge:8082";
  return [
    {
      name: "Control Plane",
      liveUrl: `${control}/health/live`,
      readyUrl: `${control}/health/ready`,
      metricsUrl: `${controlMetrics}/metrics`,
    },
    {
      name: "Delivery",
      liveUrl: `${delivery}/health/live`,
      readyUrl: `${delivery}/health/ready`,
      metricsUrl: `${deliveryMetrics}/metrics`,
    },
    {
      name: "Discord Edge",
      liveUrl: `${edge}/health/live`,
      readyUrl: `${edge}/health/ready`,
      metricsUrl: `${edge}/internal/v1/metrics`,
    },
  ];
}

export async function collectStatus(now = new Date()): Promise<AdminStatus> {
  const token = env("TOBOT_INTERNAL_SERVICE_TOKEN");
  const configured = Boolean(token);
  const probed = await Promise.all(
    targets().map(async (target) => {
      const [live, ready, metrics] = await Promise.all([
        probe(target.liveUrl),
        probe(target.readyUrl),
        probe(target.metricsUrl, token),
      ]);
      const metricsState = metricsStateFor(metrics.status, configured);
      const report: ServiceReport = {
        name: target.name,
        live: classifyProbe(live.status),
        ready: classifyProbe(ready.status),
        reason: readyReason(target.name, ready.status, ready.body),
        metrics: metricsState,
      };
      return { report, gauges: metricsState === "ok" ? parseGauges(metrics.body) : [] };
    }),
  );
  const control = probed.find((item) => item.report.name === "Control Plane");
  const gauges = probed.flatMap((item) => item.gauges);
  const services = [
    ...probed.map((item) => item.report),
    ...remoteServices(gauges, control?.report.metrics ?? "unavailable"),
  ];
  return { observedAt: now.toISOString(), services, queues: queueGauges(gauges) };
}
