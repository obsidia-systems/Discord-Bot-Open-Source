import { useEffect, useState } from "react";
import { type CaseSummary, readCases } from "../lib/session-client";

type ListState =
  | { kind: "loading" }
  | { kind: "ready"; cases: CaseSummary[] }
  | { kind: "no-access" }
  | { kind: "unavailable" };

export function CaseList({ tenantId }: { tenantId: string }) {
  const [state, setState] = useState<ListState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await readCases(tenantId);
      if (cancelled) return;
      if (result.kind === "unauthenticated") {
        window.location.assign("/auth/login");
        return;
      }
      if (result.kind === "no-access") {
        setState({ kind: "no-access" });
        return;
      }
      if (result.kind === "unavailable") {
        setState({ kind: "unavailable" });
        return;
      }
      setState({ kind: "ready", cases: result.cases });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  if (state.kind === "loading") {
    return <p className="text-zinc-700">Loading cases.</p>;
  }
  if (state.kind === "no-access") {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">No access</h1>
        <p className="mt-3 border-l-2 border-zinc-950 pl-3" role="alert">
          You do not have access to this server.
        </p>
      </>
    );
  }
  if (state.kind === "unavailable") {
    return <p role="alert">Cases could not be loaded.</p>;
  }
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Cases</h1>
      {state.cases.length === 0 ? (
        <p className="mt-4 text-zinc-700">No cases yet.</p>
      ) : (
        <ul className="mt-6 space-y-3 text-sm">
          {state.cases.map((item) => (
            <li key={item.case_id}>
              <a
                className="underline decoration-zinc-400 underline-offset-4 hover:decoration-zinc-950"
                href={`/guild/${tenantId}/cases/${item.case_id}`}
              >
                Case {item.display_number}: {item.action} {item.target_label} — {item.status}
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
