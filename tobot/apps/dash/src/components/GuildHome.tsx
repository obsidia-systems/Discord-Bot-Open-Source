import { useEffect, useState } from "react";
import {
  type GuildShellBody,
  readGuildShell,
  startGuildRepair,
} from "../lib/session-client";
import {
  discoveryPollDelay,
  installationLabel,
  installationView,
  projectionAgeLabel,
} from "../lib/shell-state";

type HomeState =
  | { kind: "loading" }
  | { kind: "ready"; body: GuildShellBody }
  | { kind: "no-access" }
  | { kind: "unavailable" };

type GuildHomeProps = {
  tenantId: string;
};

export function GuildHome({ tenantId }: GuildHomeProps) {
  const [state, setState] = useState<HomeState>({ kind: "loading" });
  const [repairError, setRepairError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function tick() {
      const result = await readGuildShell(tenantId);
      if (cancelled) return;
      if (result.kind === "unauthenticated") {
        window.location.assign("/auth/login");
        return;
      }
      if (result.kind === "no-access") {
        setState({ kind: "no-access" });
        timer = window.setTimeout(() => void tick(), 15_000);
        return;
      }
      if (result.kind === "unavailable") {
        setState({ kind: "unavailable" });
        timer = window.setTimeout(() => void tick(), 15_000);
        return;
      }
      setState({ kind: "ready", body: result.body });
      timer = window.setTimeout(
        () => void tick(),
        discoveryPollDelay([result.body.installation_state]),
      );
    }

    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tenantId]);

  async function onRepair() {
    setRepairError(null);
    const result = await startGuildRepair(tenantId);
    if (result.kind === "redirect") {
      window.location.assign(result.authorizeUrl);
      return;
    }
    if (result.kind === "unauthenticated") {
      window.location.assign("/auth/login");
      return;
    }
    setRepairError(
      result.kind === "forbidden"
        ? "This account cannot repair the installation."
        : "The repair request could not be started.",
    );
  }

  if (state.kind === "loading") {
    return (
      <p className="text-zinc-700" aria-live="polite">
        Loading this server.
      </p>
    );
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
    return <p className="border-l-2 border-zinc-950 pl-3" role="alert">This server could not be loaded.</p>;
  }

  const view = installationView({
    tenantId: state.body.tenant_id,
    installationState: state.body.installation_state,
    capabilities: state.body.capabilities,
  });

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{installationLabel(view)}</h1>
      <dl className="mt-6 space-y-2 text-sm leading-relaxed text-zinc-700">
        <div>
          <dt className="inline">Server </dt>
          <dd className="inline">{state.body.provider_guild_id}</dd>
        </div>
        <div>
          <dt className="inline">Generation </dt>
          <dd className="inline">{state.body.installation_generation}</dd>
        </div>
        <div>
          <dt className="inline">Health </dt>
          <dd className="inline">{state.body.health_state}</dd>
        </div>
        <div>
          <dt className="inline">Probe </dt>
          <dd className="inline">{state.body.probe_state}</dd>
        </div>
        <div>
          <dt className="inline">Watermark </dt>
          <dd className="inline">
            {state.body.projection_watermark_unix}.{" "}
            {projectionAgeLabel(state.body.projection_age_seconds)}
          </dd>
        </div>
      </dl>
      {view.kind === "verifying" ? (
        <p className="mt-4 text-zinc-700" aria-live="polite">
          Installation is verifying. This page refreshes automatically.
        </p>
      ) : null}
      {view.kind === "degraded" ? (
        <div className="mt-4 border-l-2 border-zinc-950 pl-3" role="alert">
          <p>This server is degraded.</p>
          {view.reasons.length > 0 ? (
            <ul className="mt-2 list-disc pl-5">
              {view.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
          <button
            className="mt-4 border border-zinc-300 bg-white px-3 py-1.5 text-sm"
            type="button"
            onClick={() => void onRepair()}
          >
            Repair installation
          </button>
          {repairError ? <p className="mt-3">{repairError}</p> : null}
        </div>
      ) : null}
      {view.kind === "installed" ? (
        <>
          <p className="mt-4 text-zinc-700">The application is installed on this server.</p>
          <a
            className="mt-4 inline-block underline decoration-zinc-400 underline-offset-4 hover:decoration-zinc-950"
            href={`/guild/${tenantId}/cases`}
          >
            Cases
          </a>
          <a
            className="ml-6 inline-block underline decoration-zinc-400 underline-offset-4 hover:decoration-zinc-950"
            href={`/guild/${tenantId}/welcome`}
          >
            Welcome
          </a>
          <a
            className="ml-6 inline-block underline decoration-zinc-400 underline-offset-4 hover:decoration-zinc-950"
            href={`/guild/${tenantId}/roles`}
          >
            Automatic role
          </a>
        </>
      ) : null}
      {view.kind === "removed" ? (
        <div className="mt-4 border-l-2 border-zinc-950 pl-3" role="alert">
          <p>The application was removed. The server record remains.</p>
          {view.reasons.length > 0 ? (
            <ul className="mt-2 list-disc pl-5">
              {view.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
          <button
            className="mt-4 border border-zinc-300 bg-white px-3 py-1.5 text-sm"
            type="button"
            onClick={() => void onRepair()}
          >
            Repair installation
          </button>
          {repairError ? <p className="mt-3">{repairError}</p> : null}
        </div>
      ) : null}
      {view.kind === "pending" ? (
        <p className="mt-4 text-zinc-700">Installation is pending.</p>
      ) : null}
      {view.kind === "unknown" ? (
        <p className="mt-4 text-zinc-700">The installation state is not recognized.</p>
      ) : null}
    </>
  );
}
