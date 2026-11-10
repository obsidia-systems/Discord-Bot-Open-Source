import { useEffect, useState } from "react";
import {
  type SupportTicket,
  type SupportTranscriptLine,
  readSupportTicket,
  transitionSupportTicket,
} from "../lib/session-client";

type DetailState =
  | { kind: "loading" }
  | { kind: "ready"; ticket: SupportTicket; lines: SupportTranscriptLine[] }
  | { kind: "no-access" }
  | { kind: "unavailable" };

export function SupportTicketView({ tenantId, caseId }: { tenantId: string; caseId: string }) {
  const [state, setState] = useState<DetailState>({ kind: "loading" });
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    async function poll() {
      const result = await readSupportTicket(tenantId, caseId);
      if (cancelled) return;
      if (result.kind === "unauthenticated") {
        window.location.assign("/auth/login");
        return;
      }
      if (result.kind === "ready") {
        setState(result);
        timer = window.setTimeout(() => void poll(), 5_000);
        return;
      }
      setState((previous) => previous.kind === "ready" ? previous : result);
      timer = window.setTimeout(() => void poll(), 5_000);
    }
    void poll();
    return () => { cancelled = true; if (timer !== undefined) window.clearTimeout(timer); };
  }, [tenantId, caseId]);

  async function transition(version: number, action: "claim" | "close" | "unclaim") {
    setMessage("");
    const result = await transitionSupportTicket(tenantId, caseId, version, action);
    if (result === "unauthenticated") { window.location.assign("/auth/login"); return; }
    if (result === "done") {
      const labels = { claim: "Ticket claimed.", close: "Ticket updated.", unclaim: "Ticket released." };
      setMessage(labels[action]);
      const refreshed = await readSupportTicket(tenantId, caseId);
      if (refreshed.kind === "ready") setState(refreshed);
      return;
    }
    setMessage(result === "stale" ? "This ticket changed. Refreshing." : "The ticket could not be updated.");
  }

  if (state.kind === "loading") return <p className="text-zinc-700">Loading this ticket.</p>;
  if (state.kind === "no-access") return <p role="alert">No access to this server.</p>;
  if (state.kind === "unavailable") return <p role="alert">This ticket is unavailable.</p>;
  const { ticket, lines } = state;
  const answers = ticket.answers ?? [];

  return <>
    <a className="text-sm underline decoration-zinc-400 underline-offset-4 hover:decoration-zinc-950" href={`/guild/${tenantId}/support`}>Back to support</a>
    <h1 className="mt-3 text-2xl font-semibold tracking-tight">Ticket #{ticket.support_number}</h1>
    <p className="mt-2 text-zinc-700">{ticket.state}{ticket.rating ? ` · rated ${ticket.rating}` : ""}{ticket.outside_hours ? " · opened outside usual hours" : ""}</p>
    {message ? <p className="mt-4 border-l-2 border-zinc-950 pl-3" role="status">{message}</p> : null}

    <section className="mt-8 border-t border-zinc-200 pt-5">
      <p className="text-xs font-semibold tracking-wide text-zinc-500">Ticket</p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight">Data</h2>
      <dl className="mt-4 space-y-2 text-sm text-zinc-700">
        <div><dt className="inline font-medium text-zinc-950">Member </dt><dd className="inline">{ticket.member_id}</dd></div>
        <div><dt className="inline font-medium text-zinc-950">Channel </dt><dd className="inline">{ticket.channel_id ?? "No channel"}</dd></div>
        <div><dt className="inline font-medium text-zinc-950">Rating </dt><dd className="inline">{ticket.rating ?? "Not rated"}</dd></div>
      </dl>
      {answers.length > 0 ? <ul className="mt-4 space-y-2 text-sm">
        {answers.map((answer) => <li key={answer.question}><span className="font-medium">{answer.question}</span> {answer.answer}</li>)}
      </ul> : <p className="mt-4 text-sm text-zinc-600">This ticket has no form answers.</p>}
      <div className="mt-4 flex gap-2">
        {ticket.state === "Open" ? <button className="border border-zinc-300 px-3 py-1.5 text-sm" type="button" onClick={() => void transition(ticket.version, "claim")}>Claim</button> : null}
        {ticket.state === "Claimed" ? <button className="border border-zinc-300 px-3 py-1.5 text-sm" type="button" onClick={() => void transition(ticket.version, "unclaim")}>Release</button> : null}
        {ticket.state !== "Closed" && ticket.state !== "Closing" ? <button className="border border-zinc-300 px-3 py-1.5 text-sm" type="button" onClick={() => void transition(ticket.version, "close")}>Close</button> : null}
      </div>
    </section>

    <section className="mt-10 border-t border-zinc-200 pt-5">
      <p className="text-xs font-semibold tracking-wide text-zinc-500">Transcript</p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight">What happened in the channel</h2>
      {lines.length === 0 ? <p className="mt-4 text-sm text-zinc-700">No messages have been captured yet.</p> : <ol className="mt-4 space-y-4">
        {lines.map((line) => <li key={line.message_id}>
          <p className="text-xs text-zinc-500">{line.author_id} · {new Date(line.observed_at_unix * 1000).toLocaleString()}</p>
          <p className="mt-1 text-sm">{line.body && line.body.length > 0 ? line.body : `Message ${line.message_id} was not captured.`}</p>
        </li>)}
      </ol>}
      {ticket.transcript_ready ? <a className="mt-4 inline-block text-sm underline decoration-zinc-400 underline-offset-4 hover:decoration-zinc-950" href={`/api/v1/guilds/${encodeURIComponent(tenantId)}/support/${encodeURIComponent(ticket.case_id)}/transcript`}>Open the saved transcript</a>
        : <p className="mt-4 text-sm text-zinc-600">The saved transcript is written when the ticket closes.</p>}
    </section>
  </>;
}
