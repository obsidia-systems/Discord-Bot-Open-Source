import { type SyntheticEvent, useEffect, useState } from "react";
import {
  type ProgressionBody,
  type WelcomeChannel,
  publishProgression,
  readProgression,
  readProgressionForm,
} from "../lib/session-client";

type State =
  | { kind: "loading" }
  | { kind: "ready"; body: ProgressionBody; channels: WelcomeChannel[] }
  | { kind: "no-access" }
  | { kind: "unavailable" };

export function ProgressionView({ tenantId }: { tenantId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [channelId, setChannelId] = useState("");
  const [award, setAward] = useState("10");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    async function poll() {
      const result = await readProgressionForm(tenantId);
      if (cancelled) return;
      if (result.kind === "unauthenticated") {
        window.location.assign("/auth/login");
        return;
      }
      setState(result);
      if (result.kind === "ready") {
        setChannelId((current) => current || result.body.channel_id || "");
        timer = window.setTimeout(() => void pollStatus(), 5_000);
      }
    }
    async function pollStatus() {
      const result = await readProgression(tenantId);
      if (cancelled) return;
      if (result.kind === "unauthenticated") {
        window.location.assign("/auth/login");
        return;
      }
      if (result.kind === "ready") {
        setState((previous) =>
          previous.kind === "ready"
            ? { kind: "ready", body: result.body, channels: previous.channels }
            : previous,
        );
        timer = window.setTimeout(() => void pollStatus(), 5_000);
      } else if (result.kind === "no-access") {
        setState(result);
      } else {
        timer = window.setTimeout(() => void pollStatus(), 5_000);
      }
    }
    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [tenantId]);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const amount = Number(award);
    const result = await publishProgression(tenantId, channelId, amount);
    if (result === "unauthenticated") {
      window.location.assign("/auth/login");
      return;
    }
    if (result === "done") {
      setMessage("The progression policy was published.");
      const refreshed = await readProgressionForm(tenantId);
      if (refreshed.kind === "ready") setState(refreshed);
      return;
    }
    if (result === "invalid") {
      setMessage("Choose a channel and an award from 1 to 100.");
      return;
    }
    setMessage("The progression policy could not be published.");
  }

  if (state.kind === "loading") return <p>Loading progression settings.</p>;
  if (state.kind === "no-access") return <p role="alert">No access to this server.</p>;
  if (state.kind === "unavailable") return <p role="alert">Progression settings are unavailable.</p>;
  const published = state.body.channel_id;
  const publishedName = state.channels.find((channel) => channel.id === published)?.name;
  const last = state.body.last_member;
  return (
    <>
      <h1 className="font-serif text-3xl text-zinc-950">Progression</h1>
      <p className="mt-3 text-zinc-700">One human message in the published channel awards a fixed amount of XP. This page does not award XP.</p>
      {published ? (
        <section className="mt-8 border-t border-zinc-200 pt-5" aria-label="Published progression">
          <p>Published channel {publishedName ? `#${publishedName}` : published}, award {state.body.award}.</p>
          {last ? (
            <p className="mt-2">Latest member {last.member_id}: balance {last.balance}, level {last.level}.</p>
          ) : (
            <p className="mt-2">No award yet.</p>
          )}
        </section>
      ) : <p className="mt-8">No progression policy is published yet.</p>}
      <form className="mt-8 space-y-4" onSubmit={(event) => void submit(event)}>
        <div>
          <label className="block text-sm font-medium" htmlFor="progression-channel">Text channel</label>
          <select id="progression-channel" required value={channelId} onChange={(event) => setChannelId(event.target.value)}
            className="mt-1 w-full border border-zinc-300 bg-white px-3 py-2">
            <option value="">Select a channel</option>
            {state.channels.map((channel) => (
              <option key={channel.id} value={channel.id}>#{channel.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="progression-award">Award</label>
          <input id="progression-award" required type="number" min={1} max={100} value={award}
            onChange={(event) => setAward(event.target.value)}
            className="mt-1 w-full border border-zinc-300 bg-white px-3 py-2" />
        </div>
        <button className="border border-zinc-950 bg-zinc-950 px-4 py-2 text-sm text-white" type="submit">Publish progression</button>
        {message ? <p role="status">{message}</p> : null}
      </form>
    </>
  );
}
