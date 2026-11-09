import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { CatalogStatus, PublishedCatalog } from "../lib/catalog";

type Product = { id: string; name: string; active: boolean; tax_code: string };
type Price = { id: string; product_id: string; active: boolean; currency: string; unit_amount: number; interval_name: string };
type Provider = { products: Product[]; prices: Price[]; has_more: boolean };
type Capability = { kind: "feature" | "limit" | "perk"; key: string; label?: string; description?: string; unit: string | null; minimum: number | null; maximum: number | null };
type Benefit = { kind: "feature" | "perk"; key: string } | { kind: "limit"; key: string; quantity: number; unit: string };
type Tab = "Free" | "Active" | "Pending" | "Retired" | "Draft";
type FreePlan = { enabled: boolean; support_open: boolean; ticket_quantity: number | null };
type ServerRow = { tenant_id: string; guild_id: string; tenant_state: string; installation_state: string | null; plan_state: string | null; plan_active: boolean; benefits: Benefit[] };
type ServerListBody = { servers: ServerRow[]; truncated: boolean };
type FormMode = "add" | "version" | "draft";

const BUSINESS_TAX = "txcd_10103000";
const PERSONAL_TAX = "txcd_10103001";
const TAX_CHOICES = [
  { code: BUSINESS_TAX, label: "SaaS, business use" },
  { code: PERSONAL_TAX, label: "SaaS, personal use" },
];
const COUNTRIES = [
  { code: "MX", label: "Mexico" },
  { code: "US", label: "United States" },
];
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "Free", label: "Free" },
  { id: "Active", label: "Active" },
  { id: "Pending", label: "Pending" },
  { id: "Retired", label: "Retired" },
  { id: "Draft", label: "Not for sale" },
];

function taxChoices(current: string) {
  if (!current || TAX_CHOICES.some((choice) => choice.code === current)) return TAX_CHOICES;
  return [...TAX_CHOICES, { code: current, label: current }];
}

function taxLabel(code: string): string {
  return taxChoices(code).find((choice) => choice.code === code)?.label ?? code;
}

function money(minor: number, currency: string): string {
  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(minor / 10 ** fractionDigits);
}

function intervalLabel(interval: string): string {
  if (interval === "month") return "Monthly";
  if (interval === "year") return "Yearly";
  return interval;
}

function offerKeyFromName(name: string, taken: Set<string>): string {
  const raw = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const base = /^[a-z]/.test(raw) && raw.length >= 2 ? raw : "offer";
  if (!taken.has(base)) return base.slice(0, 79);
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const tail = `-${suffix}`;
    const candidate = `${base.slice(0, 79 - tail.length)}${tail}`;
    if (!taken.has(candidate)) return candidate;
  }
  return base.slice(0, 79);
}

function fieldClass() {
  return "border border-zinc-400 p-2 text-sm";
}

function failureText(status: number, detail: { error?: string } | null): string {
  if (detail?.error) return detail.error;
  if (status === 409) return "This Price or offer is already in use.";
  if (status === 502 || status === 503) return "Billing or Stripe is unavailable. Try again after the service recovers.";
  if (status === 400 || status === 422) return "Check the required fields and accepted values.";
  return `HTTP ${status}`;
}

function priceIdFrom(created: unknown): string | undefined {
  if (!created || typeof created !== "object" || !("price" in created)) return undefined;
  const price = (created as { price?: { id?: string } }).price;
  return typeof price?.id === "string" ? price.id : undefined;
}

function revisionIdFrom(created: unknown): string | undefined {
  if (!created || typeof created !== "object" || !("revision_id" in created)) return undefined;
  const revisionId = (created as { revision_id?: unknown }).revision_id;
  return typeof revisionId === "string" ? revisionId : undefined;
}

function tabCopy(tab: Tab): string {
  if (tab === "Free") return "Servers without a paid plan use this. It has no Stripe price. Turning it off removes these features from those servers.";
  if (tab === "Active") return "Dash can sell these. A server that already has a base plan cannot buy another one.";
  if (tab === "Pending") return "Billing is still checking these. A version moves to Active only after Billing accepts it.";
  if (tab === "Retired") return "Hidden from new checkout. A paid server keeps its plan. A retired offer cannot be turned back on.";
  return "Stripe products that have not been published. The name and tax can still change. Archiving removes an unused price.";
}

function stateCopy(state: "Active" | "Pending" | "Retired"): string {
  if (state === "Pending") return "Billing is checking this version. When it accepts the version, this card moves to Active. If this plan already had an Active version, that one moves to Retired.";
  if (state === "Active") return "This version stays fixed for servers that already paid. Publishing a new version starts another card in Pending. When Billing accepts it, that card becomes Active and this one moves to Retired.";
  return "Hidden from new checkout. Servers that already paid keep it. Selling a new version publishes another card; this one stays in Retired.";
}

function includedBenefit(benefits: Benefit[] | undefined, capability: Capability): Benefit | undefined {
  return benefits?.find((benefit) => benefit.key === capability.key);
}

function readBenefits(form: FormData, capabilities: Capability[]): Benefit[] | string {
  const benefits: Benefit[] = [];
  for (const capability of capabilities) {
    if (capability.key === "platform.base" && capability.kind === "feature") {
      benefits.push({ kind: "feature", key: capability.key });
      continue;
    }
    if (capability.kind === "limit") {
      if (form.get(`benefit-on:${capability.key}`) !== "on") {
        if (capability.key === "support.max_open_tickets") benefits.push({ kind: "feature", key: "support.closed" });
        continue;
      }
      const raw = String(form.get(`benefit:${capability.key}`) ?? "").trim();
      if (raw === "") continue;
      const quantity = Number(raw);
      const minimum = capability.minimum ?? 1;
      const maximum = capability.maximum ?? 1000;
      if (!Number.isSafeInteger(quantity) || quantity < minimum || quantity > maximum) {
        return `${capability.label ?? capability.key} must be a whole number from ${minimum} to ${maximum}, or empty for no cap.`;
      }
      benefits.push({ kind: "limit", key: capability.key, quantity, unit: capability.unit ?? "" });
      continue;
    }
    if (form.get(`benefit:${capability.key}`) === "on" && (capability.kind === "feature" || capability.kind === "perk")) {
      benefits.push({ kind: capability.kind, key: capability.key });
    }
  }
  if (!benefits.some((benefit) => benefit.kind === "feature" && benefit.key === "platform.base")) {
    return "Platform plan access is unavailable. Refresh the page before publishing.";
  }
  return benefits;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="break-all">{children}</dd>
    </div>
  );
}

function supportIncluded(benefits: Benefit[] | undefined): boolean {
  return !benefits?.some((benefit) => benefit.kind === "feature" && benefit.key === "support.closed");
}

function CapabilityList({ capabilities, benefits, disabled }: { capabilities: Capability[]; benefits?: Benefit[]; disabled: boolean }) {
  if (capabilities.length === 0) return <p className="text-sm">Feature list is unavailable. Refresh the page before publishing.</p>;
  return (
    <ul className="grid gap-2">
      {capabilities.map((capability) => (
        <CapabilityRow
          key={capability.key}
          capability={capability}
          benefit={includedBenefit(benefits, capability)}
          enabled={capability.key === "support.max_open_tickets" ? supportIncluded(benefits) : Boolean(includedBenefit(benefits, capability))}
          disabled={disabled}
        />
      ))}
    </ul>
  );
}

function CapabilityRow({ capability, benefit, enabled, disabled }: { capability: Capability; benefit?: Benefit; enabled: boolean; disabled: boolean }) {
  const locked = capability.key === "platform.base";
  const [on, setOn] = useState(locked || enabled);
  const quantity = benefit?.kind === "limit" ? String(benefit.quantity) : "";
  const checkboxName = capability.kind === "limit" ? `benefit-on:${capability.key}` : `benefit:${capability.key}`;
  return (
    <li className="border border-zinc-200 p-3">
      <label className="flex items-start gap-2 text-sm">
        <input
          className="mt-1"
          type="checkbox"
          name={checkboxName}
          checked={locked ? true : on}
          disabled={disabled || locked}
          onChange={(event) => setOn(event.target.checked)}
        />
        <span>
          <span className="font-semibold">{capability.label ?? capability.key}</span>
          {capability.description ? <span className="mt-1 block text-xs leading-relaxed text-zinc-600">{capability.description}</span> : null}
        </span>
      </label>
      {capability.kind === "limit" ? (
        <label className="mt-3 grid gap-1 pl-6 text-sm">
          {capability.unit ?? "Quantity"}
          <input
            className={fieldClass()}
            type="number"
            name={`benefit:${capability.key}`}
            min={capability.minimum ?? undefined}
            max={capability.maximum ?? undefined}
            step="1"
            defaultValue={quantity}
            placeholder="No cap"
            disabled={disabled || !on}
          />
          <span className="text-xs text-zinc-600">Leave empty for no cap.</span>
        </label>
      ) : null}
    </li>
  );
}

function CountryFields({ initial }: { initial: string[] }) {
  const [countries, setCountries] = useState(initial);
  const choices = [...COUNTRIES];
  for (const code of initial) {
    if (!choices.some((country) => country.code === code)) choices.push({ code, label: code });
  }
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-semibold">Countries</legend>
      <span className="text-xs text-zinc-600">Where this offer may be sold.</span>
      {choices.map((country) => (
        <label key={country.code} className="text-sm">
          <input
            type="checkbox"
            value={country.code}
            checked={countries.includes(country.code)}
            onChange={() => setCountries((current) => current.includes(country.code) ? current.filter((item) => item !== country.code) : [...current, country.code])}
          /> {country.label}
        </label>
      ))}
      {countries.map((code) => <input key={code} type="hidden" name="region" value={code} />)}
    </fieldset>
  );
}

function PlanForm({
  formKey,
  mode,
  defaults,
  capabilities,
  priceChoices,
  busy,
  extra,
  submitLabel,
  onSaveIdentity,
  onCancel,
  onSubmit,
}: {
  formKey: string;
  mode: FormMode;
  defaults: {
    name: string;
    amount: string;
    currency: string;
    intervalName: string;
    taxCode: string;
    countries: string[];
    merchant: string;
    terms: string;
    privacy: string;
    support: string;
    benefits: Benefit[];
    priceId: string;
  };
  capabilities: Capability[];
  priceChoices?: Price[];
  busy: boolean;
  extra?: ReactNode;
  submitLabel: string;
  onSaveIdentity?: (form: FormData) => void;
  onCancel?: () => void;
  onSubmit: (form: FormData) => void;
}) {
  return (
    <form key={formKey} className="grid gap-8 lg:grid-cols-2" onSubmit={(event) => {
      event.preventDefault();
      onSubmit(new FormData(event.currentTarget));
    }}>
      <div className="grid content-start gap-4">
        <h3 className="text-lg font-semibold">Stripe</h3>
        {mode === "version" ? (
          <p className="text-sm"><strong>{defaults.name}</strong> · {taxLabel(defaults.taxCode)}. The name and tax stay on this Stripe product.</p>
        ) : (
          <>
            <label className="grid gap-1 text-sm">Plan name
              <input className={fieldClass()} name="name" required maxLength={120} defaultValue={defaults.name} />
              <span className="text-xs text-zinc-600">Customers see this name in Dash.</span>
            </label>
            <label className="grid gap-1 text-sm">Tax category
              <select className={fieldClass()} name="tax_code" defaultValue={defaults.taxCode || BUSINESS_TAX}>
                {taxChoices(defaults.taxCode).map((choice) => <option key={choice.code} value={choice.code}>{choice.label}</option>)}
              </select>
            </label>
          </>
        )}
        {mode === "draft" ? (
          <fieldset className="grid gap-2">
            <legend className="text-sm font-semibold">Price</legend>
            {(priceChoices ?? []).map((price, index) => (
              <label key={price.id} className="text-sm">
                <input type="radio" name="price_id" value={price.id} required defaultChecked={price.id === defaults.priceId || (defaults.priceId === "" && index === 0)} /> {money(price.unit_amount, price.currency)} / {intervalLabel(price.interval_name)}
              </label>
            ))}
          </fieldset>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">Amount
                <input className={fieldClass()} name="amount" type="number" min="0.01" step="0.01" required defaultValue={defaults.amount} />
              </label>
              <label className="grid gap-1 text-sm">Currency
                <select className={fieldClass()} name="currency" defaultValue={defaults.currency || "usd"}>
                  <option value="usd">USD</option>
                  <option value="mxn">MXN</option>
                </select>
              </label>
            </div>
            <label className="grid gap-1 text-sm">Interval
              <select className={fieldClass()} name="interval_name" defaultValue={defaults.intervalName || "month"}>
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </select>
            </label>
            {mode === "version" ? <p className="text-xs text-zinc-600">Changing the amount, currency, or interval creates another Stripe price. Benefits, countries, and legal pages reuse the current price.</p> : null}
          </>
        )}
        {extra}
        <CountryFields key={formKey} initial={defaults.countries} />
        <label className="grid gap-1 text-sm">Legal business name
          <input className={fieldClass()} name="merchant_of_record" required maxLength={120} defaultValue={defaults.merchant} />
        </label>
        <label className="grid gap-1 text-sm">Terms
          <input className={fieldClass()} name="terms_url" type="url" required defaultValue={defaults.terms} placeholder="https://example.com/terms" />
        </label>
        <label className="grid gap-1 text-sm">Privacy
          <input className={fieldClass()} name="privacy_url" type="url" required defaultValue={defaults.privacy} placeholder="https://example.com/privacy" />
        </label>
        <label className="grid gap-1 text-sm">Support
          <input className={fieldClass()} name="support_url" type="url" required defaultValue={defaults.support} placeholder="https://example.com/support" />
        </label>
      </div>
      <div className="grid content-start gap-4">
        <h3 className="text-lg font-semibold">Features</h3>
        <p className="text-sm text-zinc-700">These checks describe the next version. The version already published does not change.</p>
        <CapabilityList key={formKey} capabilities={capabilities} benefits={defaults.benefits} disabled={false} />
        <div className="flex flex-wrap gap-2">
          {onSaveIdentity ? (
            <button className="border border-zinc-500 px-3 py-1.5 text-sm disabled:opacity-50" type="button" disabled={busy} onClick={(event) => {
              const form = event.currentTarget.form;
              if (form) onSaveIdentity(new FormData(form));
            }}>Save name</button>
          ) : null}
          {onCancel ? <button className="border border-zinc-500 px-3 py-1.5 text-sm" type="button" onClick={onCancel}>Cancel</button> : null}
          <button className="bg-zinc-950 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={busy}>{submitLabel}</button>
        </div>
      </div>
    </form>
  );
}

function OfferDetail({
  row,
  productId,
  capabilities,
  busy,
  blocked,
  editing,
  onEdit,
  onCancel,
  onRetire,
  onPublish,
}: {
  row: CatalogStatus;
  productId?: string;
  capabilities: Capability[];
  busy: boolean;
  blocked: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onRetire: () => void;
  onPublish: (form: FormData) => void;
}) {
  const revision = row.revision;
  return (
    <div className="grid gap-4">
      <div>
        <h3 className="text-lg font-semibold">{revision.display_name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-700">{stateCopy(row.state)}</p>
        {row.last_error ? <p className="mt-2 text-sm text-red-700">{row.last_error}</p> : null}
      </div>
      {editing ? (
        <PlanForm
          formKey={revision.revision_id}
          mode="version"
          defaults={{
            name: revision.display_name,
            amount: (revision.unit_amount / 100).toFixed(2),
            currency: revision.currency,
            intervalName: revision.interval_name,
            taxCode: revision.tax_classification,
            countries: revision.regions.length ? revision.regions : ["MX"],
            merchant: revision.merchant_of_record,
            terms: revision.terms_url,
            privacy: revision.privacy_url,
            support: revision.support_url,
            benefits: revision.benefits,
            priceId: revision.provider_price_ref,
          }}
          capabilities={capabilities}
          busy={busy}
          submitLabel="Publish new version"
          onCancel={onCancel}
          onSubmit={onPublish}
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="text-lg font-semibold">Stripe</h3>
            <dl className="mt-3 grid gap-3 text-sm">
              <Fact label="Price">{money(revision.unit_amount, revision.currency)} / {intervalLabel(revision.interval_name)}</Fact>
              <Fact label="Tax">{taxLabel(revision.tax_classification)}</Fact>
              <Fact label="Stripe price">{revision.provider_price_ref}</Fact>
              {productId ? <Fact label="Stripe product">{productId}</Fact> : null}
              <Fact label="Countries">{revision.regions.join(", ") || "None"}</Fact>
              <Fact label="Legal business">{revision.merchant_of_record}</Fact>
              <Fact label="Terms">{revision.terms_url}</Fact>
              <Fact label="Privacy">{revision.privacy_url}</Fact>
              <Fact label="Support">{revision.support_url}</Fact>
            </dl>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Features</h3>
            <p className="mt-2 text-sm text-zinc-700">Included with this version. A check here does not edit it.</p>
            <div className="mt-3">
              <CapabilityList key={revision.revision_id} capabilities={capabilities} benefits={revision.benefits} disabled />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {row.state !== "Pending" ? (
                blocked ? <p className="text-sm">A new version is still being checked.</p> : (
                  <button className="border border-zinc-500 px-3 py-1.5 text-sm disabled:opacity-50" type="button" disabled={busy} onClick={onEdit}>{row.state === "Retired" ? "Sell a new version" : "New version"}</button>
                )
              ) : null}
              {row.state !== "Retired" ? <button className="border border-zinc-500 px-3 py-1.5 text-sm disabled:opacity-50" type="button" disabled={busy} onClick={onRetire}>Retire</button> : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function supportSummary(benefits: Benefit[], freePlan: FreePlan | null, paid: boolean): string {
  if (paid) {
    if (benefits.some((benefit) => benefit.kind === "feature" && benefit.key === "support.closed")) return "Support is not included.";
    const limit = benefits.find((benefit) => benefit.kind === "limit" && benefit.key === "support.max_open_tickets");
    return limit && limit.kind === "limit" ? `Open support tickets: ${limit.quantity}` : "Open support tickets: no cap";
  }
  if (!freePlan || !freePlan.enabled || !freePlan.support_open) return "Uses the free plan. Support is not included.";
  return freePlan.ticket_quantity === null ? "Uses the free plan. Open support tickets: no cap" : `Uses the free plan. Open support tickets: ${freePlan.ticket_quantity}`;
}

function FreeEditor({ plan, busy, onSave }: { plan: FreePlan; busy: boolean; onSave: (plan: FreePlan) => void }) {
  const [enabled, setEnabled] = useState(plan.enabled);
  const [open, setOpen] = useState(plan.support_open);
  const [quantity, setQuantity] = useState(plan.ticket_quantity === null ? "" : String(plan.ticket_quantity));
  const [error, setError] = useState("");
  const support = { kind: "limit" as const, key: "support.max_open_tickets", label: "Open support tickets", description: "Checked with an empty number means no cap. A number from 1 to 1000 is the cap. Unchecked means support is not included.", unit: "tickets", minimum: 1, maximum: 1000 };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = quantity.trim();
    let ticketQuantity: number | null = null;
    if (trimmed !== "") {
      const value = Number(trimmed);
      if (!Number.isSafeInteger(value) || value < 1 || value > 1000) {
        if (open) {
          setError("Open support tickets must be a whole number from 1 to 1000, or empty for no cap.");
          return;
        }
      } else {
        ticketQuantity = value;
      }
    }
    setError("");
    onSave({ enabled, support_open: open, ticket_quantity: ticketQuantity });
  }

  return (
    <form className="grid gap-8 lg:grid-cols-2" onSubmit={submit}>
      <div className="grid content-start gap-4">
        <h3 className="text-lg font-semibold">Free</h3>
        <p className="text-sm text-zinc-700">This plan has no Stripe price. A server keeps it until someone buys a paid plan.</p>
        <label className="flex items-start gap-2 text-sm">
          <input className="mt-1" type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          <span>
            <span className="font-semibold">Enabled</span>
            <span className="mt-1 block text-xs text-zinc-600">Turn this off and servers without a paid plan lose these features.</span>
          </span>
        </label>
      </div>
      <div className="grid content-start gap-4">
        <h3 className="text-lg font-semibold">Features</h3>
        <ul>
          <li className="border border-zinc-200 p-3">
            <label className="flex items-start gap-2 text-sm">
              <input className="mt-1" type="checkbox" checked={open} onChange={(event) => setOpen(event.target.checked)} />
              <span>
                <span className="font-semibold">{support.label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-zinc-600">{support.description}</span>
              </span>
            </label>
            <label className="mt-3 grid gap-1 pl-6 text-sm">tickets
              <input className={fieldClass()} type="number" min={1} max={1000} step="1" value={quantity} placeholder="No cap" disabled={!open} onChange={(event) => setQuantity(event.target.value)} />
              <span className="text-xs text-zinc-600">Leave empty for no cap.</span>
            </label>
          </li>
        </ul>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <button className="w-fit bg-zinc-950 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={busy}>Save free plan</button>
      </div>
    </form>
  );
}

function ServerTable({
  list,
  error,
  filter,
  selectedId,
  freePlan,
  onFilter,
  onSelect,
}: {
  list: ServerListBody;
  error: string;
  filter: "paid" | "free";
  selectedId: string | null;
  freePlan: FreePlan | null;
  onFilter: (filter: "paid" | "free") => void;
  onSelect: (tenantId: string | null) => void;
}) {
  const rows = list.servers.filter((server) => filter === "paid" ? server.plan_active : !server.plan_active);
  const selected = list.servers.find((server) => server.tenant_id === selectedId) ?? null;
  return (
    <section className="border-t border-zinc-200 pt-5" aria-labelledby="servers">
      <h2 id="servers" className="text-xl font-semibold">Servers</h2>
      <p className="mt-2 text-sm text-zinc-700">A server without a paid plan uses the free plan. This list does not change a server's plan.</p>
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      {list.truncated ? <p className="mt-3 text-sm text-red-700">More than 200 servers exist. The rest stay hidden until pagination is available.</p> : null}
      <div className="mt-4 flex gap-2" role="tablist" aria-label="Server plan">
        <button className={`border px-3 py-1.5 text-sm ${filter === "paid" ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-500"}`} type="button" aria-selected={filter === "paid"} onClick={() => { onFilter("paid"); onSelect(null); }}>With a plan</button>
        <button className={`border px-3 py-1.5 text-sm ${filter === "free" ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-500"}`} type="button" aria-selected={filter === "free"} onClick={() => { onFilter("free"); onSelect(null); }}>No plan</button>
      </div>
      {rows.length === 0 ? <p className="mt-4 text-sm">None.</p> : (
        <table className="mt-4 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-xs text-zinc-500">
              <th className="py-2 pr-3 font-medium">Server</th>
              <th className="py-2 pr-3 font-medium">Discord</th>
              <th className="py-2 pr-3 font-medium">Installation</th>
              <th className="py-2 font-medium">Plan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((server) => (
              <tr key={server.tenant_id} className={selectedId === server.tenant_id ? "bg-zinc-50" : undefined}>
                <td className="border-b border-zinc-200 py-2 pr-3 font-mono text-xs">
                  <button className="text-left underline" type="button" onClick={() => onSelect(selectedId === server.tenant_id ? null : server.tenant_id)}>{server.tenant_id}</button>
                </td>
                <td className="border-b border-zinc-200 py-2 pr-3 font-mono text-xs">{server.guild_id}</td>
                <td className="border-b border-zinc-200 py-2 pr-3">{server.installation_state ?? server.tenant_state}</td>
                <td className="border-b border-zinc-200 py-2">{server.plan_active ? server.plan_state ?? "Active" : "Free"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {selected ? (
        <dl className="mt-4 grid gap-3 border border-zinc-300 p-4 text-sm">
          <Fact label="Server">{selected.tenant_id}</Fact>
          <Fact label="Discord">{selected.guild_id}</Fact>
          <Fact label="Tenant">{selected.tenant_state}</Fact>
          <Fact label="Installation">{selected.installation_state ?? "None"}</Fact>
          <Fact label="Plan">{selected.plan_active ? selected.plan_state ?? "Active" : "Free"}</Fact>
          <Fact label="Support">{supportSummary(selected.benefits, freePlan, selected.plan_active)}</Fact>
        </dl>
      ) : null}
    </section>
  );
}

export function BillingSetup() {
  const [revisions, setRevisions] = useState<CatalogStatus[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [provider, setProvider] = useState<Provider>({ products: [], prices: [], has_more: false });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [tab, setTab] = useState<Tab>("Active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [freePlan, setFreePlan] = useState<FreePlan | null>(null);
  const [freeError, setFreeError] = useState("");
  const [servers, setServers] = useState<ServerListBody>({ servers: [], truncated: false });
  const [serverError, setServerError] = useState("");
  const [serverFilter, setServerFilter] = useState<"paid" | "free">("paid");
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const seen = useRef<{ id: string; state: string } | null>(null);

  async function refresh() {
    try {
      const [catalog, plans, registry, free, serverList] = await Promise.all([
        fetch("/api/billing/catalog", { cache: "no-store" }),
        fetch("/api/billing/provider/plans", { cache: "no-store" }),
        fetch("/api/billing/capabilities", { cache: "no-store" }),
        fetch("/api/billing/default-plan", { cache: "no-store" }),
        fetch("/api/billing/servers", { cache: "no-store" }),
      ]);
      if (!catalog.ok || !plans.ok || !registry.ok) throw new Error();
      setRevisions(await catalog.json() as CatalogStatus[]);
      setProvider(await plans.json() as Provider);
      setCapabilities(await registry.json() as Capability[]);
      setCatalogError("");
      if (free.ok) {
        setFreePlan(await free.json() as FreePlan);
        setFreeError("");
      } else setFreeError("The free plan is unavailable.");
      if (serverList.ok) {
        setServers(await serverList.json() as ServerListBody);
        setServerError("");
      } else setServerError("The server list is unavailable.");
    } catch {
      setCatalogError("Billing catalog is unavailable. Check Billing and the Stripe test key.");
    }
  }

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, []);

  // La revisión no se edita: Billing la pasa de Pending a Active y retira la Active anterior.
  useEffect(() => {
    if (!selectedId) {
      seen.current = null;
      return;
    }
    const row = revisions.find((item) => item.revision.revision_id === selectedId);
    if (!row) return;
    const previous = seen.current;
    if (previous?.id === row.revision.revision_id && previous.state === "Pending" && row.state === "Active") {
      setNotice("Billing accepted this version. It is Active. The previous version of this plan is Retired.");
    }
    seen.current = { id: row.revision.revision_id, state: row.state };
    if (tab !== "Draft" && tab !== "Free" && row.state !== tab) setTab(row.state);
  }, [revisions, selectedId, tab]);

  async function send(path: string, body: object): Promise<unknown> {
    const result = await fetch(`/api/billing/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!result.ok) {
      const detail = await result.json().catch(() => null) as { error?: string } | null;
      throw new Error(failureText(result.status, detail));
    }
    return result.json().catch(() => null);
  }

  function takenKeys(): Set<string> {
    return new Set(revisions.map((revision) => revision.revision.product_key));
  }

  function pendingFor(productKey: string): boolean {
    return revisions.some((revision) => revision.revision.product_key === productKey && revision.state === "Pending");
  }

  function pricesFor(productId: string): Price[] {
    return provider.prices.filter((price) => price.product_id === productId);
  }

  function draftProducts(): Product[] {
    return provider.products.filter((product) => {
      if (!product.active) return false;
      const prices = pricesFor(product.id);
      return prices.length > 0 && prices.every((price) => !revisions.some((revision) => revision.revision.provider_price_ref === price.id));
    });
  }

  function chooseTab(next: Tab) {
    setTab(next);
    setSelectedId(null);
    setAdding(false);
    setEditing(false);
  }

  function selectCard(id: string) {
    setAdding(false);
    setEditing(false);
    setSelectedId((current) => current === id ? null : id);
  }

  function remember(created: unknown) {
    const revisionId = revisionIdFrom(created);
    if (!revisionId) return;
    seen.current = { id: revisionId, state: "Pending" };
    setAdding(false);
    setEditing(false);
    setSelectedId(revisionId);
    setTab("Pending");
  }

  async function productIdFor(priceId: string): Promise<string | undefined> {
    const known = provider.prices.find((price) => price.id === priceId)?.product_id;
    if (known) return known;
    const response = await fetch(`/api/billing/provider/prices/${priceId}`, { cache: "no-store" });
    if (!response.ok) return undefined;
    const body = await response.json() as { product?: { id?: string } };
    return body.product?.id;
  }

  function publicationBody(form: FormData, priceId: string, productKey: string): Record<string, unknown> | string {
    const regions = form.getAll("region").map(String);
    if (regions.length === 0) return "Choose at least one country.";
    const benefits = readBenefits(form, capabilities);
    if (typeof benefits === "string") return benefits;
    return {
      price_id: priceId,
      product_key: productKey,
      benefits,
      regions: regions.join(","),
      merchant_of_record: String(form.get("merchant_of_record") ?? ""),
      terms_url: String(form.get("terms_url") ?? ""),
      privacy_url: String(form.get("privacy_url") ?? ""),
      support_url: String(form.get("support_url") ?? ""),
    };
  }

  async function run(work: () => Promise<string>) {
    setBusy(true);
    setNotice(null);
    try {
      setNotice(await work());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Operation failed. Try again.");
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  function addPlan(form: FormData) {
    void run(async () => {
      const created = await send("provider/plans", {
        name: String(form.get("name") ?? "").trim(),
        tax_code: String(form.get("tax_code") ?? BUSINESS_TAX),
        currency: String(form.get("currency") ?? "").toLowerCase(),
        unit_amount: Math.round(Number(form.get("amount")) * 100),
        interval_name: String(form.get("interval_name") ?? ""),
      });
      const priceId = priceIdFrom(created);
      if (!priceId) throw new Error("Stripe created a product, but the price id was missing.");
      const body = publicationBody(form, priceId, offerKeyFromName(String(form.get("name") ?? ""), takenKeys()));
      if (typeof body === "string") throw new Error(`${body} The Stripe price is listed under Not for sale.`);
      try {
        remember(await send("catalog", body));
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Publication failed.";
        throw new Error(`${reason} The Stripe price is listed under Not for sale.`);
      }
      return "Plan submitted. It stays Pending until Billing accepts it, then it becomes Active.";
    });
  }

  function publishVersion(revision: PublishedCatalog, form: FormData) {
    void run(async () => {
      const amount = Math.round(Number(form.get("amount")) * 100);
      const currency = String(form.get("currency") ?? "").toLowerCase();
      const intervalName = String(form.get("interval_name") ?? "");
      let priceId = revision.provider_price_ref;
      if (amount !== revision.unit_amount || currency !== revision.currency || intervalName !== revision.interval_name) {
        const productId = await productIdFor(priceId);
        if (!productId) throw new Error("The Stripe product for this offer is not available.");
        const created = await send(`provider/products/${productId}/prices`, {
          currency,
          unit_amount: amount,
          interval_name: intervalName,
        });
        const nextPrice = priceIdFrom(created);
        if (!nextPrice) throw new Error("Stripe created a price, but the price id was missing.");
        priceId = nextPrice;
      }
      const body = publicationBody(form, priceId, revision.product_key);
      if (typeof body === "string") throw new Error(body);
      remember(await send("catalog", body));
      return "New version submitted. It stays Pending until Billing accepts it. Then it becomes Active and the previous version moves to Retired.";
    });
  }

  function publishDraft(product: Product, form: FormData) {
    void run(async () => {
      const priceId = String(form.get("price_id") ?? pricesFor(product.id).find((price) => price.active)?.id ?? "");
      if (!priceId) throw new Error("Choose an active price before publishing.");
      const name = String(form.get("name") ?? "").trim();
      const taxCode = String(form.get("tax_code") ?? product.tax_code);
      if (name !== product.name || taxCode !== product.tax_code) {
        await send(`provider/products/${product.id}`, { name, tax_code: taxCode });
      }
      const body = publicationBody(form, priceId, offerKeyFromName(name, takenKeys()));
      if (typeof body === "string") throw new Error(body);
      remember(await send("catalog", body));
      return "Draft submitted. It stays Pending until Billing accepts it, then it becomes Active.";
    });
  }

  function saveDraft(product: Product, form: FormData) {
    void run(async () => {
      await send(`provider/products/${product.id}`, {
        name: String(form.get("name") ?? "").trim(),
        tax_code: String(form.get("tax_code") ?? product.tax_code),
      });
      return "Name and tax saved. This product is still not for sale.";
    });
  }

  function archive(path: string, success: string) {
    void run(async () => {
      await send(path, {});
      return success;
    });
  }

  function retire(revisionId: string) {
    if (!window.confirm("Retire this offer? New checkouts stop. Servers that already paid keep it.")) return;
    void run(async () => {
      await send(`revisions/${revisionId}/retire`, {});
      return "Offer retired. It stays in Retired and cannot be turned back on.";
    });
  }

  function saveFree(plan: FreePlan) {
    void run(async () => {
      const saved = await send("default-plan", {
        enabled: plan.enabled,
        support_open: plan.support_open,
        ticket_quantity: plan.ticket_quantity,
      });
      if (saved && typeof saved === "object") setFreePlan(saved as FreePlan);
      return "Free plan saved. Servers without a paid plan use it now.";
    });
  }

  const drafts = draftProducts();
  const rows = tab === "Active" || tab === "Pending" || tab === "Retired"
    ? revisions.filter((revision) => revision.state === tab)
    : [];
  const selected = revisions.find((revision) => revision.revision.revision_id === selectedId) ?? null;
  const selectedDraft = drafts.find((product) => product.id === selectedId) ?? null;
  const counts: Record<Tab, number> = {
    Free: freePlan ? 1 : 0,
    Active: revisions.filter((revision) => revision.state === "Active").length,
    Pending: revisions.filter((revision) => revision.state === "Pending").length,
    Retired: revisions.filter((revision) => revision.state === "Retired").length,
    Draft: drafts.length,
  };

  return (
    <div className="mt-8 space-y-8">
      {catalogError ? <p role="alert" className="border border-red-300 bg-red-50 p-3 text-sm">{catalogError}</p> : null}
      {provider.has_more ? <p className="text-sm text-red-700">More than 100 Stripe items exist. Adding and publishing stay paused until pagination is available.</p> : null}
      {notice ? <p role="status" className="text-sm">{notice}</p> : null}

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-200">
        <div role="tablist" aria-label="Plan status" className="flex flex-wrap gap-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              id={`tab-${item.id}`}
              className={`border-b-2 px-3 py-2 text-sm ${tab === item.id ? "border-zinc-950 font-semibold" : "border-transparent text-zinc-600"}`}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              aria-controls="plan-panel"
              onClick={() => chooseTab(item.id)}
            >{item.id === "Free" ? item.label : `${item.label} ${counts[item.id]}`}</button>
          ))}
        </div>
        {tab === "Free" ? null : <button className="mb-2 bg-zinc-950 px-4 py-2 text-sm text-white disabled:opacity-50" type="button" disabled={busy || provider.has_more} onClick={() => { setAdding((current) => !current); setSelectedId(null); setEditing(false); }}>Add plan</button>}
      </div>

      <section id="plan-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        <p className="text-sm text-zinc-700">{tabCopy(tab)}</p>
        {tab === "Free" ? (
          <div className="mt-4 border border-zinc-300 p-4">
            {freeError ? <p role="alert" className="text-sm text-red-700">{freeError}</p> : null}
            <FreeEditor key={`${freePlan?.enabled ?? true}-${freePlan?.support_open ?? true}-${freePlan?.ticket_quantity ?? "none"}`} plan={freePlan ?? { enabled: true, support_open: true, ticket_quantity: null }} busy={busy || Boolean(freeError)} onSave={saveFree} />
          </div>
        ) : tab === "Draft" ? (
          drafts.length === 0 ? <p className="mt-4 text-sm">None.</p> : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {drafts.map((product) => {
                const selectedCard = selectedId === product.id;
                return (
                  <li key={product.id}>
                    <button className={`h-full w-full border p-4 text-left ${selectedCard ? "border-zinc-950 bg-zinc-50" : "border-zinc-300"}`} type="button" aria-pressed={selectedCard} onClick={() => selectCard(product.id)}>
                      <span className="font-semibold">{product.name}</span>
                      <span className="mt-1 block text-sm text-zinc-700">Not for sale · {taxLabel(product.tax_code)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : rows.length === 0 ? <p className="mt-4 text-sm">None.</p> : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {rows.map((row) => {
              const revision = row.revision;
              const selectedCard = selectedId === revision.revision_id;
              return (
                <li key={revision.revision_id}>
                  <button className={`h-full w-full border p-4 text-left ${selectedCard ? "border-zinc-950 bg-zinc-50" : "border-zinc-300"}`} type="button" aria-pressed={selectedCard} onClick={() => selectCard(revision.revision_id)}>
                    <span className="font-semibold">{revision.display_name}</span>
                    <span className="mt-1 block text-sm text-zinc-700">{money(revision.unit_amount, revision.currency)} / {intervalLabel(revision.interval_name)}</span>
                    {row.last_error ? <span className="mt-1 block text-sm text-red-700">Billing reported an error.</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {tab !== "Free" && (adding || selected || selectedDraft) ? (
          <div id="plan-detail" className="mt-6 border border-zinc-300 p-4">
            {adding ? (
              <div className="grid gap-4">
                <div>
                  <h3 className="text-lg font-semibold">Add plan</h3>
                  <p className="mt-2 text-sm text-zinc-700">This creates the Stripe price and submits the offer. The new card starts in Pending and moves to Active after Billing accepts it.</p>
                </div>
                <PlanForm
                  formKey="add"
                  mode="add"
                  defaults={{ name: "", amount: "", currency: "usd", intervalName: "month", taxCode: BUSINESS_TAX, countries: ["MX"], merchant: "", terms: "", privacy: "", support: "", benefits: [], priceId: "" }}
                  capabilities={capabilities}
                  busy={busy || provider.has_more}
                  submitLabel="Add plan"
                  onSubmit={addPlan}
                />
              </div>
            ) : null}
            {selected ? (
              <OfferDetail
                row={selected}
                productId={provider.prices.find((price) => price.id === selected.revision.provider_price_ref)?.product_id}
                capabilities={capabilities}
                busy={busy || provider.has_more}
                blocked={pendingFor(selected.revision.product_key)}
                editing={editing}
                onEdit={() => setEditing(true)}
                onCancel={() => setEditing(false)}
                onRetire={() => retire(selected.revision.revision_id)}
                onPublish={(form) => publishVersion(selected.revision, form)}
              />
            ) : null}
            {selectedDraft ? (
              <div className="grid gap-4">
                <div>
                  <h3 className="text-lg font-semibold">{selectedDraft.name}</h3>
                  <p className="mt-2 text-sm text-zinc-700">This Stripe product is not for sale yet. Save the name and tax, or publish it. Publishing starts a Pending card.</p>
                </div>
                {pricesFor(selectedDraft.id).some((price) => price.active) ? (
                  <PlanForm
                    formKey={selectedDraft.id}
                    mode="draft"
                    defaults={{ name: selectedDraft.name, amount: "", currency: "usd", intervalName: "month", taxCode: selectedDraft.tax_code || BUSINESS_TAX, countries: ["MX"], merchant: "", terms: "", privacy: "", support: "", benefits: [], priceId: "" }}
                    capabilities={capabilities}
                    priceChoices={pricesFor(selectedDraft.id).filter((price) => price.active)}
                    busy={busy || provider.has_more}
                    extra={(
                      <div className="grid gap-2 text-sm">
                        {pricesFor(selectedDraft.id).map((price) => (
                          <div key={price.id} className="flex flex-wrap items-center gap-3">
                            <span>{money(price.unit_amount, price.currency)} / {intervalLabel(price.interval_name)}</span>
                            <span className="text-zinc-600">{price.active ? "Active" : "Archived"}</span>
                            {price.active ? <button className="text-zinc-700 underline disabled:opacity-50" type="button" disabled={busy} onClick={() => archive(`provider/prices/${price.id}/archive`, "Price archived.")}>Archive price</button> : null}
                          </div>
                        ))}
                        <button className="w-fit text-zinc-700 underline disabled:opacity-50" type="button" disabled={busy} onClick={() => archive(`provider/products/${selectedDraft.id}/archive`, "Product archived.")}>Archive product</button>
                      </div>
                    )}
                    submitLabel="Publish draft"
                    onSaveIdentity={(form) => saveDraft(selectedDraft, form)}
                    onSubmit={(form) => publishDraft(selectedDraft, form)}
                  />
                ) : <p className="text-sm">No active price left on this product.</p>}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <ServerTable
        list={servers}
        error={serverError}
        filter={serverFilter}
        selectedId={selectedServer}
        freePlan={freePlan}
        onFilter={setServerFilter}
        onSelect={setSelectedServer}
      />
    </div>
  );
}
