import { useEffect, useState } from "react";
import { type AiUsage, readAiUsage } from "../lib/session-client";

type View =
  | { kind: "loading" }
  | { kind: "ready"; body: AiUsage }
  | { kind: "no-access" }
  | { kind: "unavailable" };

function reservationLabel(state: string): string {
  if (state === "Disputed") return "In review";
  if (state === "Uncertain") return "Pending verification";
  if (state === "Captured") return "Captured";
  if (state === "Released") return "Released";
  if (state === "Reserved") return "Reserved";
  return state;
}

export function AiUsageView({ tenantId }: { tenantId: string }) {
  const [view, setView] = useState<View>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const result = await readAiUsage(tenantId);
      if (cancelled) return;
      if (result.kind === "unauthenticated") {
        window.location.assign("/auth/login");
        return;
      }
      setView(result.kind === "ready" ? { kind: "ready", body: result.body } : { kind: result.kind });
    }
    void tick();
    const timer = window.setInterval(() => void tick(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tenantId]);

  if (view.kind === "loading") return <p className="mt-8">Loading AI credit usage.</p>;
  if (view.kind === "no-access") return <p className="mt-8">No access to this server.</p>;
  if (view.kind === "unavailable") return <p className="mt-8">AI credit usage is unavailable.</p>;
  const body = view.body;
  return (
    <section className="mt-8">
      <p>Available {body.available} credits. Reserved {body.reserved}. One credit is one micro-USD of the Ask model price.</p>
      {body.operations.length === 0 ? <p className="mt-4">No text operations yet.</p> : null}
      <ul className="mt-4 space-y-3">
        {body.operations.map((operation) => (
          <li key={operation.operation_id} className="border border-zinc-200 px-3 py-2">
            <p>{reservationLabel(operation.reservation_state)}</p>
            <p className="text-sm text-zinc-700">Operation {operation.operation_state}. Reserved {operation.reserved}. Captured {operation.captured}.</p>
            {operation.reply ? <p className="mt-1">{operation.reply}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
