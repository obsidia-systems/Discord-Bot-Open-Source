import { useEffect, useState } from "react";
import { type CaseDetail, readCase } from "../lib/session-client";

type DetailState =
  | { kind: "loading" }
  | { kind: "ready"; body: CaseDetail }
  | { kind: "no-access" }
  | { kind: "unavailable" };

export function CaseDetailView({ tenantId, caseId }: { tenantId: string; caseId: string }) {
  const [state, setState] = useState<DetailState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await readCase(tenantId, caseId);
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
      setState({ kind: "ready", body: result.body });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantId, caseId]);

  if (state.kind === "loading") {
    return <p className="text-zinc-700">Loading this case.</p>;
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
    return <p role="alert">This case could not be loaded.</p>;
  }
  const body = state.body;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Case {body.display_number}</h1>
      <dl className="mt-6 space-y-2 text-sm leading-relaxed text-zinc-700">
        <div>
          <dt className="inline">Status </dt>
          <dd className="inline">{body.status}</dd>
        </div>
        <div>
          <dt className="inline">Action </dt>
          <dd className="inline">{body.action}</dd>
        </div>
        <div>
          <dt className="inline">Actor </dt>
          <dd className="inline">{body.actor_provider_user_id}</dd>
        </div>
        <div>
          <dt className="inline">Target </dt>
          <dd className="inline">{body.target_user_id}</dd>
        </div>
        <div>
          <dt className="inline">Reason </dt>
          <dd className="inline">{body.reason}</dd>
        </div>
        <div>
          <dt className="inline">Expiry </dt>
          <dd className="inline">{body.expires_at_unix ?? "none"}</dd>
        </div>
        <div>
          <dt className="inline">Watermark </dt>
          <dd className="inline">{body.projection_watermark_unix}</dd>
        </div>
      </dl>
    </>
  );
}
