import { useEffect, useState, type SyntheticEvent } from "react";
import type { CatalogStatus } from "../lib/catalog";

type Product = { id: string; name: string; active: boolean; tax_code: string };
type Price = { id: string; product_id: string; active: boolean; currency: string; unit_amount: number; interval_name: string };
type Provider = { products: Product[]; prices: Price[]; has_more: boolean };
type Capability = { kind: "feature" | "limit" | "perk"; key: string; label?: string; description?: string; unit: string | null; minimum: number | null; maximum: number | null; owner: string };
type Benefit = { kind: "feature" | "perk"; key: string } | { kind: "limit"; key: string; quantity: number; unit: string };
type Notice = { section: "create" | "prices" | "publish" | "offers"; text: string };

const TAX_CATEGORIES = [
  { code: "txcd_10103000", label: "SaaS, business use" },
  { code: "txcd_10103001", label: "SaaS, personal use" },
  { code: "txcd_10000000", label: "Electronically supplied services" },
];
const DEFAULT_TAX = "txcd_10103000";
const COUNTRIES = [
  { code: "MX", label: "Mexico" },
  { code: "US", label: "United States" },
];

function taxChoices(current: string) {
  if (!current || TAX_CATEGORIES.some((category) => category.code === current)) return TAX_CATEGORIES;
  return [...TAX_CATEGORIES, { code: current, label: current }];
}

function taxLabel(code: string): string {
  return taxChoices(code).find((category) => category.code === code)?.label ?? code;
}

function money(minor: number, currency: string): string {
  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(minor / 10 ** fractionDigits);
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

export function BillingSetup() {
  const [revisions, setRevisions] = useState<CatalogStatus[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [provider, setProvider] = useState<Provider>({ products: [], prices: [], has_more: false });
  const [selected, setSelected] = useState("");
  const [identity, setIdentity] = useState("new");
  const [countries, setCountries] = useState<string[]>(["MX"]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [catalogError, setCatalogError] = useState("");

  async function refresh() {
    try {
      const [catalog, plans, registry] = await Promise.all([
        fetch("/api/billing/catalog", { cache: "no-store" }),
        fetch("/api/billing/provider/plans", { cache: "no-store" }),
        fetch("/api/billing/capabilities", { cache: "no-store" }),
      ]);
      if (!catalog.ok || !plans.ok || !registry.ok) throw new Error();
      setRevisions(await catalog.json() as CatalogStatus[]);
      setProvider(await plans.json() as Provider);
      setCapabilities(await registry.json() as Capability[]);
      setCatalogError("");
    } catch {
      setCatalogError("Billing catalog is unavailable. Check Billing and the Stripe test key.");
    }
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => clearInterval(timer);
  }, []);

  async function post(section: Notice["section"], path: string, body: object, success: string) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await fetch(`/api/billing/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!result.ok) {
        const detail = await result.json().catch(() => null) as { error?: string } | null;
        const reason = detail?.error ?? (result.status === 409
          ? "This Price or offer is already in use. Review the published offers below."
          : result.status === 502 || result.status === 503
            ? "Billing or Stripe is unavailable. Try again after the service recovers."
            : result.status === 400 || result.status === 422
              ? "Check the required fields and accepted values."
              : `HTTP ${result.status}`);
        throw new Error(reason);
      }
      const payload = await result.json().catch(() => null);
      setNotice({ section, text: success });
      await refresh();
      return payload;
    } catch (error) {
      setNotice({ section, text: error instanceof Error ? error.message : "Operation failed. Try again." });
      return null;
    } finally {
      setBusy(false);
    }
  }

  function priceFields(form: FormData) {
    return {
      request_id: crypto.randomUUID(),
      currency: String(form.get("currency") ?? "").toLowerCase(),
      unit_amount: Math.round(Number(form.get("amount")) * 100),
      interval_name: String(form.get("interval_name") ?? ""),
    };
  }

  async function create(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const created = await post("create", "provider/plans", {
      ...priceFields(form),
      name: String(form.get("name") ?? "").trim(),
      tax_code: String(form.get("tax_code") ?? DEFAULT_TAX),
    }, "Stripe test price created. It is not for sale in Dash until you publish it below.");
    if (!created) return;
    const priceId = typeof created === "object" && "price" in created
      ? (created as { price?: { id?: string } }).price?.id
      : undefined;
    if (priceId) choosePrice(priceId);
    event.currentTarget.reset();
  }

  function choosePrice(priceId: string) {
    const offer = revisions.find((revision) => revision.revision.provider_price_ref === priceId && revision.state !== "Retired")?.revision;
    setSelected(priceId);
    setIdentity(offer?.product_key ?? "new");
    const regions = offer?.regions.filter((code) => code.length === 2) ?? [];
    setCountries(regions.length ? regions : ["MX"]);
  }

  const selectedPrice = provider.prices.find((price) => price.id === selected);
  const selectedProduct = provider.products.find((product) => product.id === selectedPrice?.product_id);
  const selectedOffer = revisions.find((revision) => revision.revision.provider_price_ref === selected && revision.state !== "Retired")?.revision;
  const offerNames = new Map<string, string>();
  for (const revision of revisions) {
    if (!offerNames.has(revision.revision.product_key)) offerNames.set(revision.revision.product_key, revision.revision.display_name);
  }
  const takenKeys = new Set(offerNames.keys());
  const newOfferKey = offerKeyFromName(selectedProduct?.name ?? "offer", takenKeys);
  const productKey = identity === "new" ? newOfferKey : identity;
  const countryChoices = [...COUNTRIES];
  for (const code of selectedOffer?.regions ?? []) {
    if (!countryChoices.some((country) => country.code === code)) countryChoices.push({ code, label: code });
  }

  function toggleCountry(code: string) {
    setCountries((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  }

  function publish(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const benefits = capabilities.flatMap<Benefit>((capability) => {
      const value = form.get(`benefit:${capability.key}`);
      if (capability.key === "platform.base" && capability.kind === "feature") return [{ kind: "feature", key: capability.key }];
      if (capability.kind !== "limit") return value === "on" ? [{ kind: capability.kind, key: capability.key }] : [];
      if (value === null || String(value).trim() === "") return [];
      const quantity = Number(value);
      if (!Number.isSafeInteger(quantity)) return [];
      return [{ kind: "limit", key: capability.key, quantity, unit: capability.unit ?? "" }];
    });
    if (!benefits.some((benefit) => benefit.kind === "feature" && benefit.key === "platform.base")) {
      setNotice({ section: "publish", text: "Platform plan access is unavailable. Refresh the capability registry before publishing." });
      return;
    }
    if (countries.length === 0) {
      setNotice({ section: "publish", text: "Choose at least one country." });
      return;
    }
    void post("publish", "catalog", {
      request_id: crypto.randomUUID(),
      price_id: selected,
      product_key: productKey,
      benefits,
      regions: countries.join(","),
      merchant_of_record: String(form.get("merchant_of_record") ?? ""),
      terms_url: String(form.get("terms_url") ?? ""),
      privacy_url: String(form.get("privacy_url") ?? ""),
      support_url: String(form.get("support_url") ?? ""),
    }, "Publication requested. This offer appears in Dash after Billing accepts it.");
  }

  function benefitText(revision: CatalogStatus["revision"]): string {
    if (!revision.benefits?.length) return "Legacy revision: hidden from new checkout until you publish benefits.";
    return revision.benefits.map((benefit) => {
      const capability = capabilities.find((item) => item.key === benefit.key);
      return benefit.kind === "limit" ? `${capability?.label ?? benefit.key}: ${benefit.quantity} ${benefit.unit}` : capability?.label ?? benefit.key;
    }).join(" · ");
  }

  return <div className="mt-8 space-y-10">
    {catalogError ? <p role="alert" className="border border-red-300 bg-red-50 p-3 text-sm">{catalogError}</p> : null}

    <section className="border-t border-zinc-200 pt-5" aria-labelledby="create-price">
      <h2 id="create-price" className="text-xl font-semibold">1. Create a Stripe price</h2>
      <p className="mt-2 text-sm text-zinc-700">This is the name and amount the customer pays. Creating it does not put the plan on sale in Dash.</p>
      <form className="mt-5 grid gap-3" onSubmit={(event) => void create(event)}>
        <label className="grid gap-1 text-sm">Plan name
          <input className={fieldClass()} name="name" required maxLength={120} placeholder="Tobot Pro" />
          <span className="text-xs text-zinc-600">Customers see this name in Dash.</span>
        </label>
        <label className="grid gap-1 text-sm">Tax category
          <select className={fieldClass()} name="tax_code" defaultValue={DEFAULT_TAX}>
            {TAX_CATEGORIES.map((category) => <option key={category.code} value={category.code}>{category.label}</option>)}
          </select>
          <span className="text-xs text-zinc-600">Saved on the Stripe Product and checked again when you publish.</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">Amount
            <input className={fieldClass()} name="amount" type="number" min="0.01" step="0.01" required />
          </label>
          <label className="grid gap-1 text-sm">Currency
            <select className={fieldClass()} name="currency"><option value="USD">USD</option><option value="MXN">MXN</option></select>
          </label>
          <label className="grid gap-1 text-sm">Interval
            <select className={fieldClass()} name="interval_name"><option value="month">Monthly</option><option value="year">Yearly</option></select>
          </label>
        </div>
        <button className="w-fit bg-zinc-950 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={busy}>Create price</button>
      </form>
      {notice?.section === "create" ? <p role="status" className="mt-3 text-sm">{notice.text}</p> : null}
    </section>

    <section className="border-t border-zinc-200 pt-5" aria-labelledby="existing-prices">
      <h2 id="existing-prices" className="text-xl font-semibold">2. Choose a price</h2>
      <p className="mt-2 text-sm text-zinc-700">Use a price when you are ready to publish it. Choosing one does not publish it.</p>
      {provider.has_more ? <p className="mt-2 text-sm text-red-700">More than 100 Stripe items exist. Selective publication is paused until pagination is available.</p> : null}
      {provider.products.length === 0 ? <p className="mt-3 text-sm">No prices yet. Create one above.</p> : null}
      <div className="mt-4 space-y-4">{provider.products.map((product) => <article key={product.id} className="border border-zinc-300 p-4">
        <h3 className="font-semibold">{product.name}{product.active ? "" : " · archived"}</h3>
        <p className="text-xs text-zinc-600">{product.tax_code ? taxLabel(product.tax_code) : "Tax category missing"}</p>
        <ul className="mt-3 space-y-2">{provider.prices.filter((price) => price.product_id === product.id).map((price) => <li key={price.id} className="flex flex-wrap items-center gap-3 text-sm">
          <span>{money(price.unit_amount, price.currency)} / {price.interval_name}</span>
          <span className="text-zinc-600">{price.active ? "Active" : "Archived"}</span>
          {price.active && product.active ? <button className="underline" type="button" aria-pressed={selected === price.id} disabled={busy} onClick={() => choosePrice(price.id)}>{selected === price.id ? "Selected" : "Use for an offer"}</button> : null}
          {price.active ? <button className="text-zinc-600 underline" type="button" disabled={busy} onClick={() => void post("prices", `provider/prices/${price.id}/archive`, { request_id: crypto.randomUUID() }, "Price archived.")}>Archive price</button> : null}
        </li>)}</ul>
        {product.active ? <div className="mt-3 space-y-2">
          <details>
            <summary className="cursor-pointer text-sm">Change name or tax category</summary>
            <form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void post("prices", `provider/products/${product.id}`, { request_id: crypto.randomUUID(), name: form.get("name"), tax_code: form.get("tax_code") }, "Product updated."); }}>
              <input className={`min-w-40 flex-1 ${fieldClass()}`} name="name" defaultValue={product.name} required maxLength={120} aria-label={`Name for ${product.name}`} />
              <select className={fieldClass()} name="tax_code" defaultValue={taxChoices(product.tax_code).some((category) => category.code === product.tax_code) ? product.tax_code : DEFAULT_TAX} aria-label={`Tax category for ${product.name}`}>
                {taxChoices(product.tax_code).map((category) => <option key={category.code} value={category.code}>{category.label}</option>)}
              </select>
              <button className="border border-zinc-500 px-3 text-sm" disabled={busy}>Save</button>
            </form>
          </details>
          <details>
            <summary className="cursor-pointer text-sm">Add another price</summary>
            <form className="mt-3 grid gap-2 sm:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void post("prices", `provider/products/${product.id}/prices`, priceFields(new FormData(event.currentTarget)), "Price created.").then((created) => { const priceId = created && typeof created === "object" && "price" in created ? (created as { price?: { id?: string } }).price?.id : undefined; if (priceId) choosePrice(priceId); }); }}>
              <input className={fieldClass()} name="amount" type="number" min="0.01" step="0.01" placeholder="Amount" required aria-label={`New amount for ${product.name}`} />
              <select className={fieldClass()} name="currency" aria-label={`Currency for ${product.name}`}><option value="USD">USD</option><option value="MXN">MXN</option></select>
              <select className={fieldClass()} name="interval_name" aria-label={`Interval for ${product.name}`}><option value="month">Monthly</option><option value="year">Yearly</option></select>
              <button className="bg-zinc-950 p-2 text-sm text-white" disabled={busy}>Add price</button>
            </form>
          </details>
          <button className="text-sm text-zinc-600 underline" type="button" disabled={busy} onClick={() => void post("prices", `provider/products/${product.id}/archive`, { request_id: crypto.randomUUID() }, "Product archived.")}>Archive product</button>
        </div> : null}
      </article>)}</div>
      <p className="mt-3 text-xs text-zinc-600">Archive hides an unused price or product from future sales. A price already used by an offer cannot be archived, even after that offer is retired.</p>
      {notice?.section === "prices" ? <p role="status" className="mt-3 text-sm">{notice.text}</p> : null}
    </section>

    <section className="border-t border-zinc-200 pt-5" aria-labelledby="publish-offer">
      <h2 id="publish-offer" className="text-xl font-semibold">3. Publish this offer</h2>
      <p className="mt-2 text-sm text-zinc-700">Publishing makes the chosen price available in Dash. A server that already has a base plan cannot buy another one.</p>
      {!selected || !selectedPrice || !selectedProduct ? <p className="mt-3 text-sm">Choose a price above to fill out this offer.</p> : <form key={selected} className="mt-5 grid gap-4" onSubmit={publish}>
        <p className="border border-zinc-300 p-3 text-sm"><strong>{selectedProduct.name}</strong> · {money(selectedPrice.unit_amount, selectedPrice.currency)} / {selectedPrice.interval_name} · {taxLabel(selectedProduct.tax_code)}</p>
        <label className="grid gap-1 text-sm">Offer
          <select className={fieldClass()} value={identity} onChange={(event) => setIdentity(event.target.value)}>
            <option value="new">New offer</option>
            {[...offerNames].map(([key, name]) => <option key={key} value={key}>Replace {name}</option>)}
          </select>
          <span className="text-xs text-zinc-600">Customers see the plan name. This offer is stored as <span className="font-mono">{productKey}</span>. Replace keeps that offer’s identity. New offer does not change the others.</span>
        </label>
        <fieldset className="grid gap-3 border border-zinc-300 p-3">
          <legend className="px-1 text-sm font-semibold">Benefits</legend>
          <p className="text-sm"><strong>Platform plan access</strong> <span className="text-xs text-zinc-600">Included with every offer.</span></p>
          {capabilities.filter((capability) => capability.key !== "platform.base").map((capability) => capability.kind === "limit" ? <label key={capability.key} className="grid gap-1 text-sm">{capability.label ?? capability.key}
            <span className="text-xs text-zinc-600">Optional. This tests admission. Free support has no cap, so it is not a paid upgrade. Allowed: {capability.minimum}–{capability.maximum}. Leave empty to omit.</span>
            <input className={fieldClass()} type="number" name={`benefit:${capability.key}`} min={capability.minimum ?? undefined} max={capability.maximum ?? undefined} step="1" placeholder="Optional" />
          </label> : <label key={capability.key} className="text-sm"><input type="checkbox" name={`benefit:${capability.key}`} /> {capability.label ?? capability.key}</label>)}
        </fieldset>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">Countries</legend>
          <span className="text-xs text-zinc-600">Where this offer may be sold. This does not turn on Stripe Tax.</span>
          {countryChoices.map((country) => <label key={country.code} className="text-sm"><input type="checkbox" checked={countries.includes(country.code)} onChange={() => toggleCountry(country.code)} /> {country.label}</label>)}
        </fieldset>
        <label className="grid gap-1 text-sm">Legal business name
          <input className={fieldClass()} name="merchant_of_record" required maxLength={120} defaultValue={selectedOffer?.merchant_of_record ?? ""} placeholder="Your legal business name" />
          <span className="text-xs text-zinc-600">The business that sells and invoices this plan.</span>
        </label>
        <fieldset className="grid gap-3">
          <legend className="text-sm font-semibold">Legal pages</legend>
          <span className="text-xs text-zinc-600">Public HTTPS pages. They are saved with this offer.</span>
          <label className="grid gap-1 text-sm">Terms<input className={fieldClass()} name="terms_url" type="url" required defaultValue={selectedOffer?.terms_url ?? ""} placeholder="https://example.com/terms" /></label>
          <label className="grid gap-1 text-sm">Privacy<input className={fieldClass()} name="privacy_url" type="url" required defaultValue={selectedOffer?.privacy_url ?? ""} placeholder="https://example.com/privacy" /></label>
          <label className="grid gap-1 text-sm">Support<input className={fieldClass()} name="support_url" type="url" required defaultValue={selectedOffer?.support_url ?? ""} placeholder="https://example.com/support" /></label>
        </fieldset>
        <button className="w-fit bg-zinc-950 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={busy || provider.has_more}>Publish offer</button>
      </form>}
      {notice?.section === "publish" ? <p role="status" className="mt-3 text-sm">{notice.text}</p> : null}
    </section>

    <section className="border-t border-zinc-200 pt-5" aria-labelledby="published-offers">
      <h2 id="published-offers" className="text-xl font-semibold">Published offers</h2>
      <p className="mt-2 text-sm text-zinc-700">Pending is still being checked. Active can be bought. Retired is hidden from new checkout and does not cancel a subscription.</p>
      {revisions.length === 0 ? <p className="mt-3 text-sm">No published offers yet.</p> : <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-300">
              <th className="py-2 pr-3 font-semibold">Status</th>
              <th className="py-2 pr-3 font-semibold">Plan</th>
              <th className="py-2 pr-3 font-semibold">Price</th>
              <th className="py-2 pr-3 font-semibold">Benefits</th>
              <th className="py-2 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>{revisions.map((revision) => <tr key={revision.revision.revision_id} className="border-b border-zinc-200 align-top">
            <td className="py-2 pr-3">{revision.state}</td>
            <td className="py-2 pr-3">{revision.revision.display_name}</td>
            <td className="py-2 pr-3">{money(revision.revision.unit_amount, revision.revision.currency)} / {revision.revision.interval_name}</td>
            <td className="py-2 pr-3">{benefitText(revision.revision)}{revision.last_error ? <span className="mt-1 block text-red-700">{revision.last_error}</span> : null}</td>
            <td className="py-2">{revision.state !== "Retired" ? <button className="underline" type="button" disabled={busy} onClick={() => void post("offers", `revisions/${revision.revision.revision_id}/retire`, {}, "Revision retired.")}>Retire</button> : null}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      {notice?.section === "offers" ? <p role="status" className="mt-3 text-sm">{notice.text}</p> : null}
    </section>
  </div>;
}
