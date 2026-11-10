import { type ReactNode, type SyntheticEvent, useEffect, useState } from "react";
import {
  type SupportInbox,
  type SupportLimits,
  type SupportPanelChoice,
  type SupportPanelDraft,
  type SupportQuestionDraft,
  type SupportTicket,
  type SupportWindowDraft,
  type WelcomeChannel,
  publishSupportPanel,
  readSupportInbox,
  saveSupportPanel,
} from "../lib/session-client";

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; body: SupportInbox; channels: WelcomeChannel[] }
  | { kind: "no-access" }
  | { kind: "unavailable" };

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const STEPS = ["Panel", "Service", "Tickets", "Review"] as const;

const emptyDraft = (): SupportPanelDraft => ({
  name: "Support",
  channelId: "",
  buttonLabel: "Open ticket",
  categoryId: "",
  overflowCategoryId: "",
  staffRoleId: "",
  questions: [],
  timezoneOffsetMinutes: 0,
  weeklyHours: [],
  closedHours: "open",
  confirmClose: false,
  inactivityMinutes: "",
  transcriptEnabled: false,
  logChannelId: "",
});

export function SupportInboxView({ tenantId }: { tenantId: string }) {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [draft, setDraft] = useState<SupportPanelDraft>(emptyDraft);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let catalogRetries = 0;
    async function poll(catalog: boolean) {
      const result = await readSupportInbox(tenantId, catalog);
      if (cancelled) return;
      if (result.kind === "unauthenticated") {
        window.location.assign("/auth/login");
        return;
      }
      if (result.kind === "ready") {
        setState((previous) => {
          if (previous.kind !== "ready") return result;
          return {
            kind: "ready",
            channels: result.channels.length > 0 ? result.channels : previous.channels,
            body: {
              ...result.body,
              categories: result.body.categories.length > 0 ? result.body.categories : previous.body.categories,
              roles: result.body.roles.length > 0 ? result.body.roles : previous.body.roles,
            },
          };
        });
      } else {
        setState((previous) => previous.kind === "ready" ? previous : result);
      }
      const catalogsMissing = result.kind === "ready" && catalog
        && (result.channels.length === 0 || result.body.categories.length === 0 || result.body.roles.length === 0);
      if (catalogsMissing && catalogRetries < 2) {
        catalogRetries += 1;
        timer = window.setTimeout(() => void poll(true), 30_000);
        return;
      }
      timer = window.setTimeout(() => void poll(false), 5_000);
    }
    void poll(true);
    return () => { cancelled = true; if (timer !== undefined) window.clearTimeout(timer); };
  }, [tenantId]);

  async function refresh() {
    const result = await readSupportInbox(tenantId, false);
    if (result.kind !== "ready") return;
    setState((previous) => previous.kind === "ready"
      ? {
          kind: "ready",
          channels: previous.channels,
          body: { ...result.body, categories: previous.body.categories, roles: previous.body.roles },
        }
      : result);
  }

  async function publish(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const result = await publishSupportPanel(tenantId, draft);
    if (result === "unauthenticated") { window.location.assign("/auth/login"); return; }
    if (result === "done") {
      setMessage("The panel is in Discord. Other panels stay active.");
      setCreating(false);
      setStep(0);
      await refresh();
      return;
    }
    const errors: Record<string, string> = {
      invalid: "Choose a channel, a category, a staff role, and a button label of up to 80 characters.",
      "discord-missing-permissions": "The bot needs Manage Channels, View Channel, and Send Messages in this server.",
      "discord-channel-unavailable": "Discord could not find this channel. Choose another text channel.",
      "discord-invalid-request": "Discord rejected the panel. Check the channel, category, and button label.",
    };
    setMessage(errors[result] ?? "The panel could not be published.");
  }

  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    setMessage("");
    if (draft.name.trim() === "" || !stepReady(1, draft) || !stepReady(2, draft)) {
      setMessage("Finish the name, staff role, and category before saving.");
      return;
    }
    const result = await saveSupportPanel(tenantId, editingId, draft);
    if (result === "unauthenticated") { window.location.assign("/auth/login"); return; }
    if (result === "done") {
      setMessage("Saved. The Discord button still opens this ticket type.");
      setEditingId(null);
      await refresh();
      return;
    }
    setMessage(result === "invalid"
      ? "Choose a category, a staff role, and a name of up to 80 characters."
      : "This ticket type could not be saved.");
  }

  function beginCreate() {
    setDraft(emptyDraft());
    setStep(0);
    setEditingId(null);
    setCreating(true);
    setMessage("");
  }

  function beginEdit(panel: SupportPanelChoice) {
    setDraft(draftFromPanel(panel));
    setCreating(false);
    setEditingId(panel.revision_id);
    setMessage("");
  }

  if (state.kind === "loading") return <p className="text-zinc-700">Loading support.</p>;
  if (state.kind === "no-access") return <p role="alert">No access to this server.</p>;
  if (state.kind === "unavailable") return <p role="alert">Support is unavailable.</p>;

  const editing = state.body.panels.find((panel) => panel.revision_id === editingId) ?? null;
  const showWizard = creating || (state.body.panels.length === 0 && editing === null);
  const names = {
    channel: (id: string) => named(state.channels, id),
    category: (id: string) => named(state.body.categories, id),
    role: (id: string) => named(state.body.roles, id),
  };

  return <>
    <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
    <p className="mt-3 max-w-2xl text-zinc-700">Each panel is a ticket type. Several can stay active. A button uses that panel's category, staff, hours, and questions.</p>
    {message ? <p className="mt-4 border-l-2 border-zinc-950 pl-3" role="status">{message}</p> : null}
    <Limits limits={state.body.limits} />

    <Section kicker="Panels" title="Ticket types">
      {state.body.panels.length === 0 ? <p className="mt-4 text-zinc-700">No panels yet. Create one to put a button in Discord.</p> : (
        <ul className="mt-4 divide-y divide-zinc-200 border border-zinc-200">
          {state.body.panels.map((panel) => <li key={panel.revision_id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
            <div>
              <p className="font-medium">{panel.name}</p>
              <p className="mt-1 text-sm text-zinc-600">#{names.channel(panel.channel_id)} · {panel.button_label}</p>
            </div>
            <button type="button" className={quietButton} onClick={() => beginEdit(panel)}>Edit</button>
          </li>)}
        </ul>
      )}
      {showWizard || editing ? null : <button type="button" className={`${solidButton} mt-4`} onClick={beginCreate}>Create a panel</button>}
    </Section>

    {showWizard ? (
      <form className="mt-8" onSubmit={(event) => void publish(event)}>
        <p className="text-sm text-zinc-500">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
        {step === 0 ? <Section kicker="Panel" title="Where members press the button">
          <Field label="Name" id="support-panel-name">
            <input id="support-panel-name" required maxLength={80} value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={selectClass} />
          </Field>
          <Field label="Text channel" id="support-channel">
            <select id="support-channel" required value={draft.channelId} onChange={(event) => setDraft({ ...draft, channelId: event.target.value })} className={selectClass}>
              <option value="">Select a channel</option>
              {state.channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
            </select>
          </Field>
          <Field label="Button label" id="support-button-label">
            <input id="support-button-label" required maxLength={80} value={draft.buttonLabel}
              onChange={(event) => setDraft({ ...draft, buttonLabel: event.target.value })} className={selectClass} />
          </Field>
        </Section> : null}
        {step === 1 ? <Section kicker="Service" title="Who works the desk, and when">
          <ServiceFields draft={draft} setDraft={setDraft} roles={state.body.roles} channels={state.channels} />
        </Section> : null}
        {step === 2 ? <Section kicker="Tickets" title="Where a ticket opens, and what it asks">
          <TicketFields draft={draft} setDraft={setDraft} categories={state.body.categories} />
        </Section> : null}
        {step === 3 ? <Section kicker="Review" title="Publish this panel">
          <Review draft={draft} names={names} />
        </Section> : null}
        <div className="mt-6 flex gap-2">
          {step > 0 ? <button type="button" className={quietButton} onClick={() => setStep((value) => value - 1)}>Back</button> : null}
          {state.body.panels.length > 0 && step === 0 ? <button type="button" className={quietButton} onClick={() => setCreating(false)}>Cancel</button> : null}
          {step < STEPS.length - 1 ? <button type="button" className={solidButton} onClick={() => {
            if (!stepReady(step, draft)) { setMessage("Finish this step before continuing."); return; }
            setMessage("");
            setStep((value) => value + 1);
          }}>Continue</button>
            : <button className={solidButton} type="submit">Send panel</button>}
        </div>
      </form>
    ) : null}

    {editing ? (
      <form className="mt-8" onSubmit={(event) => void save(event)}>
        <Section kicker="Panel" title={draft.name || "Ticket type"}>
          <div className="mt-4 space-y-4">
            <Field label="Name" id="support-edit-name">
              <input id="support-edit-name" required maxLength={80} value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={selectClass} />
            </Field>
            <Field label="Text channel" id="support-edit-channel">
              <input id="support-edit-channel" readOnly value={`#${names.channel(draft.channelId)}`} className={selectClass} />
            </Field>
            <Field label="Button label" id="support-edit-button">
              <input id="support-edit-button" readOnly value={draft.buttonLabel} className={selectClass} />
            </Field>
            <p className="text-sm text-zinc-600">This message is already in Discord. Saving updates this ticket type. The button keeps working.</p>
          </div>
        </Section>
        <Section kicker="Service" title="Who works this ticket type, and when">
          <ServiceFields draft={draft} setDraft={setDraft} roles={state.body.roles} channels={state.channels} />
        </Section>
        <Section kicker="Tickets" title="Where this ticket opens, and what it asks">
          <TicketFields draft={draft} setDraft={setDraft} categories={state.body.categories} />
        </Section>
        <div className="mt-6 flex gap-2">
          <button type="button" className={quietButton} onClick={() => setEditingId(null)}>Cancel</button>
          <button className={solidButton} type="submit">Save</button>
        </div>
      </form>
    ) : null}

    <Section kicker="Tickets" title="Record">
      <TicketTable tenantId={tenantId} tickets={state.body.tickets} />
    </Section>
  </>;
}

function ServiceFields({ draft, setDraft, roles, channels }: {
  draft: SupportPanelDraft;
  setDraft: (draft: SupportPanelDraft) => void;
  roles: { id: string; name: string }[];
  channels: WelcomeChannel[];
}) {
  return <div className="mt-4 space-y-4">
    <Field label="Staff role" id="support-staff-role">
      <select id="support-staff-role" required value={draft.staffRoleId} onChange={(event) => setDraft({ ...draft, staffRoleId: event.target.value })} className={selectClass}>
        <option value="">Select a role</option>
        {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
      </select>
    </Field>
    <Field label="UTC offset in minutes" id="support-offset">
      <input id="support-offset" type="number" min={-720} max={840} value={draft.timezoneOffsetMinutes}
        onChange={(event) => setDraft({ ...draft, timezoneOffsetMinutes: Number(event.target.value) })} className={selectClass} />
    </Field>
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Weekly hours</legend>
      <p className="text-sm text-zinc-600">Leave this empty to stay open all week.</p>
      {WEEKDAYS.map((name, weekday) => {
        const window = draft.weeklyHours.find((item) => item.weekday === weekday);
        return <label key={name} className="flex flex-wrap items-center gap-3 text-sm">
          <input type="checkbox" checked={window !== undefined} onChange={(event) => setDraft({
            ...draft,
            weeklyHours: event.target.checked
              ? [...draft.weeklyHours, { weekday, start_minute: 9 * 60, end_minute: 17 * 60 }]
              : draft.weeklyHours.filter((item) => item.weekday !== weekday),
          })} />
          {name}
          {window ? <>
            <input aria-label={`${name} start`} type="time" value={minutesToTime(window.start_minute)}
              onChange={(event) => setDraft({ ...draft, weeklyHours: draft.weeklyHours.map((item) => item.weekday === weekday ? { ...item, start_minute: timeToMinutes(event.target.value) } : item) })} />
            <input aria-label={`${name} end`} type="time" value={minutesToTime(window.end_minute)}
              onChange={(event) => setDraft({ ...draft, weeklyHours: draft.weeklyHours.map((item) => item.weekday === weekday ? { ...item, end_minute: timeToMinutes(event.target.value) } : item) })} />
          </> : null}
        </label>;
      })}
    </fieldset>
    <Field label="Outside those hours" id="support-closed-hours">
      <select id="support-closed-hours" value={draft.closedHours} onChange={(event) => setDraft({ ...draft, closedHours: event.target.value as SupportPanelDraft["closedHours"] })} className={selectClass}>
        <option value="open">Stay open</option>
        <option value="block">Block new tickets</option>
        <option value="warn">Warn and still open</option>
      </select>
    </Field>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={draft.confirmClose} onChange={(event) => setDraft({ ...draft, confirmClose: event.target.checked })} />
      Ask the member to confirm before closing
    </label>
    <Field label="Close after inactive minutes" id="support-inactivity">
      <input id="support-inactivity" inputMode="numeric" placeholder="Optional, 5 to 10080" value={draft.inactivityMinutes}
        onChange={(event) => setDraft({ ...draft, inactivityMinutes: event.target.value })} className={selectClass} />
    </Field>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={draft.transcriptEnabled} onChange={(event) => setDraft({ ...draft, transcriptEnabled: event.target.checked })} />
      Save a transcript when a ticket closes
    </label>
    {draft.transcriptEnabled ? <Field label="Transcript log channel" id="support-log-channel">
      <select id="support-log-channel" required value={draft.logChannelId} onChange={(event) => setDraft({ ...draft, logChannelId: event.target.value })} className={selectClass}>
        <option value="">Select a channel</option>
        {channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
      </select>
    </Field> : null}
  </div>;
}

function TicketFields({ draft, setDraft, categories }: {
  draft: SupportPanelDraft;
  setDraft: (draft: SupportPanelDraft) => void;
  categories: WelcomeChannel[];
}) {
  function updateQuestion(index: number, patch: Partial<SupportQuestionDraft>) {
    setDraft({
      ...draft,
      questions: draft.questions.map((question, position) => position === index ? { ...question, ...patch } : question),
    });
  }
  return <div className="mt-4 space-y-4">
    <Field label="Ticket category" id="support-category">
      <select id="support-category" required value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })} className={selectClass}>
        <option value="">Select a category</option>
        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select>
    </Field>
    <Field label="Overflow category" id="support-overflow">
      <select id="support-overflow" value={draft.overflowCategoryId} onChange={(event) => setDraft({ ...draft, overflowCategoryId: event.target.value })} className={selectClass}>
        <option value="">None</option>
        {categories.filter((category) => category.id !== draft.categoryId).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select>
    </Field>
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Questions</legend>
      <p className="text-sm text-zinc-600">Up to five. The button opens a form and does not open a ticket until it is submitted.</p>
      {draft.questions.map((question, index) => <div key={index} className="flex flex-wrap gap-3">
        <input aria-label={`Question ${index + 1}`} maxLength={45} value={question.title}
          onChange={(event) => updateQuestion(index, { title: event.target.value })} className={selectClass} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(index, { required: event.target.checked })} />
          Required
        </label>
      </div>)}
      {draft.questions.length < 5 ? <button type="button" className={quietButton}
        onClick={() => setDraft({ ...draft, questions: [...draft.questions, { title: "", required: false }] })}>Add question</button> : null}
    </fieldset>
  </div>;
}

function Review({ draft, names }: { draft: SupportPanelDraft; names: NameLookup }) {
  return <dl className="mt-4 space-y-2 text-sm text-zinc-700">
    <Row label="Name" value={draft.name} />
    <Row label="Channel" value={`#${names.channel(draft.channelId)}`} />
    <Row label="Button" value={draft.buttonLabel} />
    <Row label="Staff" value={names.role(draft.staffRoleId)} />
    <Row label="Hours" value={hoursText(draft.weeklyHours, draft.closedHours)} />
    <Row label="Category" value={names.category(draft.categoryId)} />
    <Row label="Questions" value={draft.questions.filter((question) => question.title.trim() !== "").map((question) => question.title).join(", ") || "None"} />
  </dl>;
}

function Limits({ limits }: { limits: SupportLimits | null }) {
  const cap = !limits
    ? "The plan limits how many tickets can be open on the server."
    : limits.support_open
      ? limits.open_cap == null
        ? "Other members can still open a ticket."
        : `Up to ${limits.open_cap} tickets can be open on this server.`
      : "New tickets are closed on this plan.";
  return <Section kicker="Server" title="Limits">
    <p className="mt-3 text-zinc-700">Each member can have one open ticket.</p>
    <p className="mt-1 text-zinc-700">{cap}</p>
  </Section>;
}

function TicketTable({ tenantId, tickets }: { tenantId: string; tickets: SupportTicket[] }) {
  if (tickets.length === 0) return <p className="mt-4 text-zinc-700">No tickets yet.</p>;
  return <table className="mt-4 w-full text-left text-sm">
    <thead className="border-b border-zinc-200 text-zinc-500">
      <tr>
        <th className="py-2 font-medium">Ticket</th>
        <th className="py-2 font-medium">State</th>
        <th className="py-2 font-medium">Member</th>
        <th className="py-2 font-medium">Rating</th>
      </tr>
    </thead>
    <tbody>
      {tickets.map((ticket) => <tr key={ticket.case_id} className="border-b border-zinc-100">
        <td className="py-3">
          <a className="underline decoration-zinc-400 underline-offset-4 hover:decoration-zinc-950" href={`/guild/${tenantId}/support/${ticket.case_id}`}>
            #{ticket.support_number}
          </a>
        </td>
        <td className="py-3">{ticket.state}</td>
        <td className="py-3">{ticket.member_id}</td>
        <td className="py-3">{ticket.rating ?? "—"}</td>
      </tr>)}
    </tbody>
  </table>;
}

const selectClass = "mt-1 w-full border border-zinc-300 bg-white px-3 py-2";
const solidButton = "border border-zinc-950 bg-zinc-950 px-4 py-2 text-sm text-white";
const quietButton = "border border-zinc-300 px-3 py-1.5 text-sm";

function Section({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return <section className="mt-10 border-t border-zinc-200 pt-5">
    <p className="text-xs font-semibold tracking-wide text-zinc-500">{kicker}</p>
    <h2 className="mt-1 text-lg font-semibold tracking-tight">{title}</h2>
    {children}
  </section>;
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div>
    <label className="block text-sm font-medium" htmlFor={id}>{label}</label>
    {children}
  </div>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <div>
    <dt className="inline font-medium text-zinc-950">{label} </dt>
    <dd className="inline">{value}</dd>
  </div>;
}

type NameLookup = {
  channel: (id: string) => string;
  category: (id: string) => string;
  role: (id: string) => string;
};

function stepReady(step: number, draft: SupportPanelDraft): boolean {
  if (step === 0) return draft.name.trim() !== "" && draft.channelId !== "" && draft.buttonLabel.trim() !== "";
  if (step === 1) return draft.staffRoleId !== "" && (!draft.transcriptEnabled || draft.logChannelId !== "");
  if (step === 2) return draft.categoryId !== "";
  return true;
}

function named(items: { id: string; name: string }[], id: string): string {
  return items.find((item) => item.id === id)?.name ?? (id || "Unknown");
}

function draftFromPanel(panel: SupportPanelChoice): SupportPanelDraft {
  const closed = panel.closed_hours === "block" || panel.closed_hours === "warn" ? panel.closed_hours : "open";
  return {
    name: panel.name || panel.button_label,
    channelId: panel.channel_id,
    buttonLabel: panel.button_label,
    categoryId: panel.category_id ?? "",
    overflowCategoryId: panel.overflow_category_id ?? "",
    staffRoleId: panel.staff_role_id ?? "",
    questions: asQuestions(panel.questions),
    timezoneOffsetMinutes: panel.timezone_offset_minutes ?? 0,
    weeklyHours: asWindows(panel.weekly_hours),
    closedHours: closed,
    confirmClose: panel.confirm_close,
    inactivityMinutes: panel.inactivity_minutes == null ? "" : String(panel.inactivity_minutes),
    transcriptEnabled: panel.transcript_enabled,
    logChannelId: panel.log_channel_id ?? "",
  };
}

function asQuestions(value: unknown): SupportQuestionDraft[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const title = "title" in item && typeof item.title === "string" ? item.title : "";
    const required = "required" in item && item.required === true;
    return title ? [{ title, required }] : [];
  });
}

function asWindows(value: unknown): SupportWindowDraft[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const weekday = "weekday" in item ? Number(item.weekday) : Number.NaN;
    const start = "start_minute" in item ? Number(item.start_minute) : Number.NaN;
    const end = "end_minute" in item ? Number(item.end_minute) : Number.NaN;
    if (!Number.isInteger(weekday) || !Number.isInteger(start) || !Number.isInteger(end)) return [];
    return [{ weekday, start_minute: start, end_minute: end }];
  });
}

function hoursText(windows: SupportWindowDraft[], closed: string): string {
  if (windows.length === 0 || closed === "open") return "Open all week";
  const days = windows
    .map((window) => `${WEEKDAYS[window.weekday] ?? "Day"} ${minutesToTime(window.start_minute)}–${minutesToTime(window.end_minute)}`)
    .join(", ");
  const outside = closed === "block" ? "blocked outside hours" : closed === "warn" ? "a warning outside hours" : "still open outside hours";
  return `${days}; ${outside}`;
}

function minutesToTime(minutes: number): string {
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map((part) => Number(part));
  return (hour || 0) * 60 + (minute || 0);
}
