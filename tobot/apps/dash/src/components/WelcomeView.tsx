import { useEffect, useState } from "react";
import {
  type WelcomeBody,
  type WelcomeChannel,
  publishWelcome,
  readWelcome,
  readWelcomeStatus,
} from "../lib/session-client";

type State =
  | { kind: "loading" }
  | { kind: "ready"; body: WelcomeBody; channels: WelcomeChannel[] }
  | { kind: "no-access" }
  | { kind: "unavailable" };

export function WelcomeView({ tenantId }: { tenantId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [channelId, setChannelId] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    async function poll() {
      const result = await readWelcome(tenantId);
      if (cancelled) return;
      if (result.kind === "unauthenticated") {
        window.location.assign("/auth/login");
        return;
      }
      setState(result);
      if (result.kind === "ready") {
        timer = window.setTimeout(() => void pollStatus(), 5_000);
      }
    }
    async function pollStatus() {
      const result = await readWelcomeStatus(tenantId);
      if (cancelled) return;
      if (result.kind === "unauthenticated") {
        window.location.assign("/auth/login");
        return;
      }
      if (result.kind === "ready") {
        setState((previous) => previous.kind === "ready"
          ? { kind: "ready", body: result.body, channels: previous.channels }
          : previous);
        timer = window.setTimeout(() => void pollStatus(), 5_000);
      } else if (result.kind === "no-access") {
        setState(result);
      } else {
        timer = window.setTimeout(() => void pollStatus(), 5_000);
      }
    }
    void poll();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [tenantId]);

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await publishWelcome(tenantId, channelId, body);
    if (result === "unauthenticated") {
      window.location.assign("/auth/login");
    } else if (result === "done") {
      setMessage("Welcome published. The next member join will use this revision.");
      const refreshed = await readWelcome(tenantId);
      if (refreshed.kind === "ready") setState(refreshed);
    } else if (result === "invalid") {
      setMessage("Enter a message of 1–2000 characters without @everyone or @here.");
    } else {
      setMessage("The welcome could not be published.");
    }
  }

  if (state.kind === "loading") return <p>Loading welcome settings.</p>;
  if (state.kind === "no-access") return <p role="alert">No access to this server.</p>;
  if (state.kind === "unavailable") return <p role="alert">Welcome settings are unavailable.</p>;

  const latest = state.body.last_delivery;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome message</h1>
      <p className="mt-3 text-zinc-700">Publish a channel and a plain-text message for the next member join. Use {"{member}"} to mention the member.</p>
      {state.body.body ? (
        <section className="mt-8 border-t border-zinc-200 pt-5" aria-label="Published welcome">
          <h2 className="font-semibold">Published revision {state.body.revision}</h2>
          <p className="mt-2 whitespace-pre-wrap">{state.body.body}</p>
          <p className="mt-2 text-sm text-zinc-600">Channel {state.body.channel_id}</p>
        </section>
      ) : <p className="mt-8">No welcome is published yet.</p>}
      <form className="mt-8 space-y-5 border-t border-zinc-200 pt-5" onSubmit={(event) => void submit(event)}>
        <div>
          <label className="block text-sm font-medium" htmlFor="welcome-channel">Text channel</label>
          <select id="welcome-channel" required value={channelId} onChange={(event) => setChannelId(event.target.value)}
            className="mt-2 w-full border border-zinc-300 bg-white px-3 py-2">
            <option value="">Select a channel</option>
            {state.channels.map((channel) => <option value={channel.id} key={channel.id}>#{channel.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="welcome-body">Message</label>
          <textarea id="welcome-body" required maxLength={2000} rows={5} value={body}
            onChange={(event) => setBody(event.target.value)}
            className="mt-2 w-full border border-zinc-300 bg-white px-3 py-2" />
        </div>
        <button className="border border-zinc-950 bg-zinc-950 px-4 py-2 text-sm text-white" type="submit">Publish welcome</button>
        {message ? <p role="status">{message}</p> : null}
      </form>
      <section className="mt-8 border-t border-zinc-200 pt-5" aria-label="Latest delivery">
        <h2 className="font-semibold">Latest delivery</h2>
        {latest ? (
          <dl className="mt-2 space-y-1 text-sm">
            <div><dt className="inline">Status </dt><dd className="inline">{latest.status}</dd></div>
            <div><dt className="inline">Intent </dt><dd className="inline">{latest.intent_id}</dd></div>
            {latest.provider_message_id ? <div><dt className="inline">Message </dt><dd className="inline">{latest.provider_message_id}</dd></div> : null}
            <div><dt className="inline">Watermark </dt><dd className="inline">{latest.projection_watermark_unix}</dd></div>
          </dl>
        ) : <p className="mt-2 text-sm text-zinc-700">No member join has requested a delivery yet.</p>}
      </section>
    </>
  );
}
