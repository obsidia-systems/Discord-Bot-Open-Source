import { useEffect, useState } from "react";
import type { AdminStatus, ProbeState } from "../lib/status";

interface Props {
  initial: AdminStatus;
}

function label(state: ProbeState): string {
  if (state === "up") return "Up";
  if (state === "not-ready") return "Not ready";
  return "Down";
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

  return (
    <div className="mt-8">
      <p className="text-sm text-zinc-600">
        Observed {status.observedAt}
      </p>
      {error ? (
        <p className="mt-3 text-zinc-700" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="mt-6 divide-y divide-zinc-200 border-y border-zinc-200">
        {status.services.map((service) => (
          <li key={service.name} className="py-4">
            <h2 className="font-semibold">{service.name}</h2>
            <p className="mt-1 text-zinc-700">
              Live {label(service.live)}. Ready {label(service.ready)}.
            </p>
            {service.gauges.length > 0 ? (
              <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
                {service.gauges.map((gauge) => (
                  <div key={gauge.name} className="contents">
                    <dt className="font-mono text-zinc-700">{gauge.name}</dt>
                    <dd className="text-right tabular-nums">{gauge.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-zinc-600">
                Metrics {service.metrics}.
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
