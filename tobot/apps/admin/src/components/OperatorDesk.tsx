import { useEffect, useState } from "react";
import type { AdminStatus, ProbeState } from "../lib/status";

function rank(state: ProbeState): number {
  if (state === "down") return 2;
  if (state === "not-ready") return 1;
  return 0;
}

function worst(status: AdminStatus): ProbeState {
  const score = status.services.reduce(
    (current, service) => Math.max(current, rank(service.live), rank(service.ready)),
    0,
  );
  if (score === 2) return "down";
  if (score === 1) return "not-ready";
  return "up";
}

function healthLabel(state: ProbeState): string {
  if (state === "up") return "Up";
  if (state === "not-ready") return "Not ready";
  return "Down";
}

export function OperatorDesk({ initial }: { initial: AdminStatus }) {
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

  const health = status.services.length === 0 || error ? "Unavailable" : healthLabel(worst(status));

  return (
    <ul className="mt-8 grid gap-4 sm:grid-cols-3">
      <li className="border border-zinc-200 p-4">
        <h2 className="font-semibold">Health</h2>
        <p className="mt-2 text-sm text-zinc-700">{health}</p>
        <a className="mt-4 inline-block text-sm font-semibold underline" href="/health">Open health</a>
      </li>
      <li className="border border-zinc-200 p-4">
        <h2 className="font-semibold">Plans</h2>
        <p className="mt-2 text-sm text-zinc-700">Publish and retire offers.</p>
        <a className="mt-4 inline-block text-sm font-semibold underline" href="/billing">Open plans</a>
      </li>
      <li className="border border-zinc-200 p-4">
        <h2 className="font-semibold">AI</h2>
        <p className="mt-2 text-sm text-zinc-700">Choose the Ask model, store a provider key, and read usage and credits.</p>
        <a className="mt-4 inline-block text-sm font-semibold underline" href="/ai">Open AI</a>
      </li>
    </ul>
  );
}
