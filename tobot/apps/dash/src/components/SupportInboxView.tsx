import { type SyntheticEvent, useEffect, useState } from "react";
import {
  type SupportInbox,
  type WelcomeChannel,
  publishSupportPanel,
  readSupportInbox,
  transitionSupportTicket,
} from "../lib/session-client";

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; body: SupportInbox; channels: WelcomeChannel[] }
  | { kind: "no-access" }
  | { kind: "unavailable" };

export function SupportInboxView({ tenantId }: { tenantId: string }) {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [channelId, setChannelId] = useState("");
  const [buttonLabel, setButtonLabel] = useState("Open ticket");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    async function poll() {
      const result = await readSupportInbox(tenantId);
      if (cancelled) return;
      if (result.kind === "unauthenticated") {
        window.location.assign("/auth/login");
        return;
      }
      setState(result);
      if (result.kind === "ready") {
        setChannelId((previous) => previous || result.body.panel?.channel_id || "");
        timer = window.setTimeout(() => void poll(), 5_000);
      }
    }
    void poll();
    return () => { cancelled = true; if (timer !== undefined) window.clearTimeout(timer); };
  }, [tenantId]);

  async function refresh() {
    const result = await readSupportInbox(tenantId);
    if (result.kind === "ready") setState(result);
  }

  async function publish(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const result = await publishSupportPanel(tenantId, channelId, buttonLabel);
    if (result === "unauthenticated") { window.location.assign("/auth/login"); return; }
    if (result === "done") { setMessage("The support panel was published."); await refresh(); return; }
    const errors: Record<string, string> = {
      invalid: "Choose a text channel and a button label of up to 80 characters.",
      "discord-missing-permissions": "The bot needs View Channel and Send Messages permissions in the selected channel.",
      "discord-channel-unavailable": "Discord could not find this channel. Choose another text channel.",
      "discord-invalid-request": "Discord rejected the panel message. Please try another text channel or button label.",
    };
    setMessage(errors[result] ?? "The panel could not be published.");
  }

  async function transition(caseId: string, version: number, action: "claim" | "close") {
    setMessage("");
    const result = await transitionSupportTicket(tenantId, caseId, version, action);
    if (result === "unauthenticated") { window.location.assign("/auth/login"); return; }
    if (result === "done") { setMessage(`Ticket ${action === "claim" ? "claimed" : "closed"}.`); await refresh(); return; }
    setMessage(result === "stale" ? "This ticket changed. Refreshing the inbox." : "The ticket could not be updated.");
    if (result === "stale") await refresh();
  }

  if (state.kind === "loading") return <p>Loading support inbox.</p>;
  if (state.kind === "no-access") return <p role="alert">No access to this server.</p>;
  if (state.kind === "unavailable") return <p role="alert">Support inbox is unavailable.</p>;
  const panel = state.body.panel;
  const channelName = state.channels.find((channel) => channel.id === panel?.channel_id)?.name;

  return <>
    <h1 className="font-serif text-3xl text-zinc-950">Support tickets</h1>
    <p className="mt-3 text-zinc-700">Members open tickets from one Discord button. Claim and close them here.</p>
    <section className="mt-8 border-t border-zinc-200 pt-5" aria-label="Support panel">
      <h2 className="text-lg font-semibold">Panel</h2>
      {panel ? <p className="mt-2">Published in {channelName ? `#${channelName}` : panel.channel_id} · message {panel.message_id}</p>
        : <p className="mt-2">No panel is published yet.</p>}
      <form className="mt-5 space-y-4" onSubmit={(event) => void publish(event)}>
        <div>
          <label className="block text-sm font-medium" htmlFor="support-channel">Text channel</label>
          <select id="support-channel" required value={channelId} onChange={(event) => setChannelId(event.target.value)}
            className="mt-1 w-full border border-zinc-300 bg-white px-3 py-2">
            <option value="">Select a channel</option>
            {state.channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="support-button-label">Button label</label>
          <input id="support-button-label" required maxLength={80} value={buttonLabel}
            onChange={(event) => setButtonLabel(event.target.value)}
            className="mt-1 w-full border border-zinc-300 bg-white px-3 py-2" />
        </div>
        <button className="border border-zinc-950 bg-zinc-950 px-4 py-2 text-sm text-white" type="submit">Publish panel</button>
      </form>
    </section>
    <section className="mt-10 border-t border-zinc-200 pt-5" aria-label="Ticket inbox">
      <h2 className="text-lg font-semibold">Inbox</h2>
      {state.body.tickets.length === 0 ? <p className="mt-3">No tickets yet.</p> :
        <ul className="mt-4 divide-y divide-zinc-200">
          {state.body.tickets.map((ticket) => <li key={ticket.case_id} className="py-4">
            <p className="font-medium">Ticket #{ticket.support_number} · {ticket.state}</p>
            <p className="mt-1 text-sm text-zinc-600">Member {ticket.member_id}</p>
            <div className="mt-3 flex gap-2">
              {ticket.state === "Open" ? <button className="border border-zinc-300 px-3 py-1.5 text-sm" type="button"
                onClick={() => void transition(ticket.case_id, ticket.version, "claim")}>Claim</button> : null}
              {ticket.state !== "Closed" ? <button className="border border-zinc-300 px-3 py-1.5 text-sm" type="button"
                onClick={() => void transition(ticket.case_id, ticket.version, "close")}>Close</button> : null}
            </div>
          </li>)}
        </ul>}
    </section>
    {message ? <p className="mt-5" role="status">{message}</p> : null}
  </>;
}
