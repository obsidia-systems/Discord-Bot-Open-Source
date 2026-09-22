import { useEffect, useState } from "react";
import {
  type GuildDiscoveryBody,
  readGuildDiscovery,
  startGuildInstall,
} from "../lib/session-client";
import { discoveryPollDelay } from "../lib/shell-state";
import { GuildList } from "./GuildList";

type PickerState =
  | { kind: "loading" }
  | { kind: "ready"; body: GuildDiscoveryBody; nowUnix: number }
  | { kind: "unavailable" };

export function GuildPicker() {
  const [state, setState] = useState<PickerState>({ kind: "loading" });
  const [pendingGuildId, setPendingGuildId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function tick() {
      const result = await readGuildDiscovery();
      if (cancelled) return;
      if (result.kind === "unauthenticated") {
        window.location.assign("/auth/login");
        return;
      }
      if (result.kind === "unavailable") {
        setState({ kind: "unavailable" });
        timer = window.setTimeout(() => void tick(), 15_000);
        return;
      }
      setState({
        kind: "ready",
        body: result.body,
        nowUnix: Math.floor(Date.now() / 1000),
      });
      const delay = discoveryPollDelay(
        result.body.guilds.map(
          (guild) => guild.shell?.installation_state ?? "",
        ),
      );
      timer = window.setTimeout(() => void tick(), delay);
    }

    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  async function onInstall(providerGuildId: string) {
    setPendingGuildId(providerGuildId);
    setActionError(null);
    const result = await startGuildInstall(providerGuildId);
    if (result.kind === "redirect") {
      window.location.assign(result.authorizeUrl);
      return;
    }
    setPendingGuildId(null);
    if (result.kind === "unauthenticated") {
      window.location.assign("/auth/login");
      return;
    }
    setActionError(
      result.kind === "forbidden"
        ? "This account cannot install the application on that server."
        : "The install request could not be started.",
    );
  }

  return (
    <section aria-busy={state.kind === "loading"}>
      {state.kind === "loading" ? (
        <p className="text-zinc-700" aria-live="polite">
          Loading your servers.
        </p>
      ) : null}
      {state.kind === "unavailable" ? (
        <p className="border-l-2 border-zinc-950 pl-3" role="alert">
          The guild list could not be loaded.
        </p>
      ) : null}
      {actionError ? (
        <p className="mt-4 border-l-2 border-zinc-950 pl-3" role="alert">
          {actionError}
        </p>
      ) : null}
      {state.kind === "ready" ? (
        <GuildList
          guilds={state.body.guilds}
          expiresAtUnix={state.body.expires_at_unix}
          nowUnix={state.nowUnix}
          pendingGuildId={pendingGuildId}
          onInstall={(providerGuildId) => void onInstall(providerGuildId)}
        />
      ) : null}
    </section>
  );
}
