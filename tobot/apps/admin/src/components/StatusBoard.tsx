import { useEffect, useState } from "react";
import type { AdminStatus, Gauge, ProbeState, ServiceReport } from "../lib/status";

interface Props {
  initial: AdminStatus;
}

function label(state: ProbeState): string {
  if (state === "up") return "Up";
  if (state === "not-ready") return "Not ready";
  return "Down";
}

const gaugeLabels: Record<string, string> = {
  tobot_installation_outbox_unpublished: "Unpublished installation events",
  tobot_installation_outbox_oldest_age_seconds: "Oldest unpublished installation event",
  tobot_installation_outbox_max_publish_attempts: "Installation publish attempts",
  tobot_installation_outbox_expired_leases: "Expired installation leases",
  tobot_edge_outbox_unpublished: "Unpublished edge events",
  tobot_edge_outbox_oldest_age_seconds: "Oldest unpublished edge event",
  tobot_edge_outbox_max_publish_attempts: "Edge publish attempts",
  tobot_edge_outbox_expired_leases: "Expired edge leases",
  tobot_messaging_outbox_unpublished: "Unpublished messaging events",
  tobot_messaging_outbox_oldest_age_seconds: "Oldest unpublished messaging event",
  tobot_messaging_outbox_max_publish_attempts: "Messaging publish attempts",
  tobot_messaging_outbox_expired_leases: "Expired messaging leases",
  tobot_moderation_outbox_unpublished: "Unpublished moderation events",
  tobot_moderation_outbox_oldest_age_seconds: "Oldest unpublished moderation event",
  tobot_moderation_outbox_max_publish_attempts: "Moderation publish attempts",
  tobot_moderation_outbox_expired_leases: "Expired moderation leases",
  tobot_ledger_outbox_unpublished: "Unpublished ledger events",
  tobot_ledger_outbox_oldest_age_seconds: "Oldest unpublished ledger event",
  tobot_ledger_outbox_expired_leases: "Expired ledger leases",
  tobot_ai_reservations_uncertain: "AI reservations in doubt",
  tobot_ai_reservations_disputed: "AI reservations disputed",
  tobot_catalog_delivery_pending: "Catalog deliveries waiting",
  tobot_stripe_receipts_pending: "Stripe receipts waiting",
  tobot_degraded_installations: "Degraded installations",
  tobot_auth_rejections_15m: "Auth rejections, 15 minutes",
  tobot_stream_pending: "Pending stream entries",
  tobot_transport_http_429: "Discord HTTP 429",
  tobot_transport_invalid_requests_10m: "Invalid transport requests, 10 minutes",
};

const queueGroups = [
  { title: "Installation", names: ["tobot_installation_outbox_unpublished", "tobot_installation_outbox_oldest_age_seconds", "tobot_installation_outbox_max_publish_attempts", "tobot_installation_outbox_expired_leases"] },
  { title: "Edge", names: ["tobot_edge_outbox_unpublished", "tobot_edge_outbox_oldest_age_seconds", "tobot_edge_outbox_max_publish_attempts", "tobot_edge_outbox_expired_leases"] },
  { title: "Messaging", names: ["tobot_messaging_outbox_unpublished", "tobot_messaging_outbox_oldest_age_seconds", "tobot_messaging_outbox_max_publish_attempts", "tobot_messaging_outbox_expired_leases"] },
  { title: "Moderation", names: ["tobot_moderation_outbox_unpublished", "tobot_moderation_outbox_oldest_age_seconds", "tobot_moderation_outbox_max_publish_attempts", "tobot_moderation_outbox_expired_leases"] },
  { title: "Ledger", names: ["tobot_ledger_outbox_unpublished", "tobot_ledger_outbox_oldest_age_seconds", "tobot_ledger_outbox_expired_leases"] },
  { title: "AI credits", names: ["tobot_ai_reservations_uncertain", "tobot_ai_reservations_disputed"] },
  { title: "Catalog", names: ["tobot_catalog_delivery_pending"] },
  { title: "Stripe", names: ["tobot_stripe_receipts_pending"] },
  { title: "Platform", names: ["tobot_degraded_installations", "tobot_auth_rejections_15m", "tobot_stream_pending", "tobot_transport_http_429", "tobot_transport_invalid_requests_10m"] },
];

function waiting(status: AdminStatus): Array<ServiceReport | Gauge> {
  return [
    ...status.services.filter((service) => service.live !== "up" || service.ready !== "up"),
    ...status.queues.filter((gauge) => gauge.value > 0),
  ];
}

function isService(item: ServiceReport | Gauge): item is ServiceReport {
  return "live" in item;
}

export function StatusBoard({ initial }: Props) {
  const [status, setStatus] = useState(initial);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      fetch("/api/status")
        .then(async (response) => {
          if (!response.ok) throw new Error("status request failed");
          return (await response.json()) as AdminStatus;
        })
        .then((next) => {
          if (!cancelled) {
            setStatus(next);
            setError("");
          }
        })
        .catch(() => {
          if (!cancelled) setError("Status is unavailable.");
        });
    };
    const timer = setInterval(refresh, 5_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const attention = waiting(status);
  const byName = new Map(status.queues.map((gauge) => [gauge.name, gauge]));

  return (
    <div className="mt-8 space-y-10">
      <p className="text-sm text-zinc-600">Observed {status.observedAt}</p>
      {error ? <p className="text-sm text-zinc-700" role="alert">{error}</p> : null}

      <section>
        <h2 className="text-lg font-semibold">Attention</h2>
        {attention.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-700">Nothing is waiting.</p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {attention.map((item) => isService(item) ? (
              <li key={item.name} className="border border-zinc-950 p-4">
                <h3 className="font-semibold">{item.name}</h3>
                <p className="mt-2 text-sm">Live {label(item.live)}. Ready {label(item.ready)}.</p>
                {item.reason ? <p className="mt-1 text-sm text-zinc-700">{item.reason}</p> : null}
              </li>
            ) : (
              <li key={item.name} className="border border-zinc-950 p-4">
                <p className="text-sm text-zinc-700">{gaugeLabels[item.name] ?? item.name}</p>
                <p className="mt-2 text-2xl tabular-nums">{item.value}</p>
                <p className="mt-1 font-mono text-xs text-zinc-500">{item.name}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Processes</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {status.services.map((service) => (
            <li key={service.name} className="border border-zinc-200 p-4">
              <h3 className="font-semibold">{service.name}</h3>
              <p className="mt-2 text-sm text-zinc-800">Live {label(service.live)}. Ready {label(service.ready)}.</p>
              {service.reason ? <p className="mt-1 text-sm text-zinc-700">{service.reason}</p> : null}
              {service.metrics !== "ok" ? <p className="mt-2 text-sm text-zinc-600">Metrics {service.metrics}.</p> : null}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Queues</h2>
        <div className="mt-4 space-y-8">
          {queueGroups.map((group) => {
            const gauges = group.names.flatMap((name) => {
              const gauge = byName.get(name);
              return gauge ? [gauge] : [];
            });
            if (gauges.length === 0) return null;
            return (
              <div key={group.title}>
                <h3 className="text-sm font-semibold">{group.title}</h3>
                <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {gauges.map((gauge) => (
                    <li key={gauge.name} className={gauge.value > 0 ? "border border-zinc-950 p-4" : "border border-zinc-200 p-4"}>
                      <p className="text-sm text-zinc-700">{gaugeLabels[gauge.name] ?? gauge.name}</p>
                      <p className="mt-2 text-2xl tabular-nums">{gauge.value}</p>
                      <p className="mt-1 font-mono text-xs text-zinc-500">{gauge.name}</p>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
