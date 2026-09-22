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
  metrics: MetricsState;
  gauges: Gauge[];
}

export interface AdminStatus {
  observedAt: string;
  services: ServiceReport[];
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
    const body = response.status === 200 ? await response.text() : "";
    return { status: response.status, body: body.slice(0, 16_384) };
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
  const services = await Promise.all(
    targets().map(async (target) => {
      const [live, ready, metrics] = await Promise.all([
        probe(target.liveUrl),
        probe(target.readyUrl),
        probe(target.metricsUrl, token),
      ]);
      const metricsState = metricsStateFor(metrics.status, configured);
      return {
        name: target.name,
        live: classifyProbe(live.status),
        ready: classifyProbe(ready.status),
        metrics: metricsState,
        gauges: metricsState === "ok" ? parseGauges(metrics.body) : [],
      };
    }),
  );
  return { observedAt: now.toISOString(), services };
}
