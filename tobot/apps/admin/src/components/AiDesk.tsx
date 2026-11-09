import { useEffect, useState } from "react";
import { AiReviews } from "./AiReviews";

type Tab = "Functions" | "Providers" | "Usage" | "Credits";
const TABS: Tab[] = ["Functions", "Providers", "Usage", "Credits"];

type ProviderRow = {
  provider_id: string;
  display_name: string;
  kind: string;
  base_url: string;
  secret_hint: string | null;
  secret_configured: boolean;
  enabled: boolean;
};
type ModelRow = {
  model_id: string;
  provider_id: string;
  model_name: string;
  input_micro_usd: number | null;
  output_micro_usd: number | null;
};
type CreditPrice = {
  model_class: string;
  estimate_amount: number;
  maximum_amount: number;
  unit_charge: number;
  user_daily_ceiling: number;
  guild_daily_ceiling: number;
};
type AskBinding = CreditPrice & {
  provider_id: string;
  model_id: string;
  model_name: string;
  system_prompt: string;
  input_micro_usd: number | null;
  output_micro_usd: number | null;
};
type Desk = {
  secret_storage: boolean;
  providers: ProviderRow[];
  models: ModelRow[];
  ask: AskBinding | null;
  active_price: CreditPrice | null;
};
type ServerRow = { tenant_id: string; guild_id: string };
type OperationRow = {
  operation_id: string;
  tenant_id: string;
  guild_id: string | null;
  actor_id: string;
  occurred_at: string | null;
  model_name: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  captured: number;
  cost_micro_usd: number | null;
  usage_reported: boolean;
};

const ASK_VOICE = "Eres un bot de Discord amigable. Responde en español, de forma breve (máximo 3 frases).";
const field = "mt-1 block w-full border border-zinc-300 px-2 py-1 text-sm";
const primary = "bg-zinc-950 px-4 py-2 text-sm text-white disabled:opacity-50";
const quiet = "border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50";

function dollars(micro: number | null): string {
  if (micro === null) return "";
  const whole = Math.trunc(micro / 1_000_000);
  const fraction = String(Math.abs(micro % 1_000_000)).padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function microFromDollars(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const micro = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0"));
  if (!Number.isSafeInteger(micro) || micro > 1_000_000_000_000) return null;
  return micro;
}

async function failure(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { code?: string } | null;
  return body?.code ?? `Request failed (${response.status}).`;
}

async function post(path: string, body: object): Promise<string | null> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.ok ? null : failure(response);
}

export function AiDesk() {
  const [tab, setTab] = useState<Tab>("Functions");
  const [desk, setDesk] = useState<Desk | null>(null);
  const [servers, setServers] = useState<ServerRow[] | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const response = await fetch("/api/ai/desk", { cache: "no-store" });
    if (!response.ok) {
      setNotice({ tone: "bad", text: "The AI desk is unavailable." });
      return;
    }
    setDesk(await response.json() as Desk);
  }

  useEffect(() => {
    void reload();
    void fetch("/api/billing/servers", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) {
        setServers([]);
        return;
      }
      const body = await response.json() as { servers?: ServerRow[] };
      setServers(Array.isArray(body.servers) ? body.servers : []);
    });
  }, []);

  async function run(task: () => Promise<string | null>) {
    setBusy(true);
    setNotice(null);
    const error = await task();
    setNotice(error ? { tone: "bad", text: error } : { tone: "ok", text: "Saved." });
    await reload();
    setBusy(false);
  }

  return (
    <div className="mt-8 space-y-8">
      {notice ? <p role="status" className={`text-sm ${notice.tone === "bad" ? "text-red-700" : ""}`}>{notice.text}</p> : null}
      <div role="tablist" aria-label="AI desk" className="flex flex-wrap gap-1 border-b border-zinc-200">
        {TABS.map((item) => (
          <button key={item} className={`border-b-2 px-3 py-2 text-sm ${tab === item ? "border-zinc-950 font-semibold" : "border-transparent text-zinc-600"}`} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>
      {tab === "Functions" ? <Functions desk={desk} busy={busy} onRun={run} /> : null}
      {tab === "Providers" ? <Providers desk={desk} busy={busy} onRun={run} /> : null}
      {tab === "Usage" ? <Usage servers={servers ?? []} /> : null}
      {tab === "Credits" ? <Credits servers={servers} busy={busy} onRun={run} /> : null}
    </div>
  );
}

function Functions({ desk, busy, onRun }: { desk: Desk | null; busy: boolean; onRun: (task: () => Promise<string | null>) => Promise<void> }) {
  const enabled = desk?.providers.find((provider) => provider.enabled) ?? null;
  const [providerId, setProviderId] = useState("");
  const [modelId, setModelId] = useState("");
  useEffect(() => {
    setProviderId(desk?.ask?.provider_id ?? enabled?.provider_id ?? "");
    setModelId(desk?.ask?.model_id ?? "");
  }, [desk, enabled?.provider_id]);
  const models = (desk?.models ?? []).filter((model) => model.provider_id === providerId);
  const selected = models.find((model) => model.model_id === modelId) ?? null;
  const priced = selected?.input_micro_usd !== null && selected?.input_micro_usd !== undefined && selected.output_micro_usd !== null && selected.output_micro_usd !== undefined;
  const price = desk?.ask ?? desk?.active_price ?? null;

  return (
    <section className="grid gap-6">
      <p className="text-sm text-zinc-700">Ask uses one model for every server. One credit is one micro-USD of the token price you save, rounded up, and never more than the reserve. A model priced at zero spends nothing. If the provider omits token usage, the reserve is captured. The provider does not send a price.</p>
      {desk === null ? <p className="text-sm">Loading Ask.</p> : enabled ? (
        <form key={price ? `${price.model_class}-${price.estimate_amount}-${desk.ask?.system_prompt ?? ""}` : "ask"} className="grid gap-4 border border-zinc-300 p-4" onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const number = (key: string) => Number(data.get(key));
          void onRun(() => post("/api/ai/functions/ask", {
            provider_id: providerId,
            model_id: modelId,
            estimate_amount: number("estimate_amount"),
            maximum_amount: number("maximum_amount"),
            user_daily_ceiling: number("user_daily_ceiling"),
            guild_daily_ceiling: number("guild_daily_ceiling"),
            system_prompt: String(data.get("system_prompt") ?? ""),
          }));
        }}>
          <h2 className="text-lg font-semibold">Ask</h2>
          <label className="text-sm">Provider
            <select className={field} value={providerId} onChange={(event) => { setProviderId(event.target.value); setModelId(""); }}>
              <option value="">Choose</option>
              {desk?.providers.filter((provider) => provider.enabled).map((provider) => <option key={provider.provider_id} value={provider.provider_id}>{provider.display_name}</option>)}
            </select>
          </label>
          <label className="text-sm">Model
            <select className={field} value={modelId} onChange={(event) => setModelId(event.target.value)}>
              <option value="">Choose</option>
              {models.map((model) => <option key={model.model_id} value={model.model_id}>{model.model_name}</option>)}
            </select>
          </label>
          <p className="text-sm text-zinc-700">{selected ? `Input ${dollars(selected.input_micro_usd) || "not set"} USD / 1M tokens. Output ${dollars(selected.output_micro_usd) || "not set"} USD / 1M tokens.` : "Choose a model to see its token prices."}</p>
          {selected && !priced ? <p className="text-sm text-red-700">Enter both token prices on the model before assigning it.</p> : null}
          <label className="text-sm">Voice
            <textarea className={field} name="system_prompt" maxLength={2000} rows={4} defaultValue={desk.ask?.system_prompt || ASK_VOICE} />
          </label>
          <p className="text-sm text-zinc-700">This is Ask's voice for every server. The member's question is untrusted data. Do not put keys, addresses, or other people's information here. A fixed rule is added after this text and cannot be removed. Leave the field empty to restore the short default.</p>
          <CreditFields price={price} />
          <button className={`w-fit ${primary}`} disabled={busy || !priced}>Save Ask</button>
        </form>
      ) : (
        <section className="grid gap-4 border border-zinc-300 p-4">
          <h2 className="text-lg font-semibold">Ask</h2>
          <p className="text-sm text-zinc-700">Enable a saved provider before assigning Ask. The model and its key come from that provider. Nothing is read from the process environment.</p>
        </section>
      )}
    </section>
  );
}

function CreditFields({ price }: { price: CreditPrice | null }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Reserve <input className={field} name="estimate_amount" type="number" min={1} required defaultValue={price?.estimate_amount ?? ""} /></label>
      <label className="text-sm">Charge ceiling <input className={field} name="maximum_amount" type="number" min={1} required defaultValue={price?.maximum_amount ?? ""} /></label>
      <label className="text-sm">Member daily ceiling <input className={field} name="user_daily_ceiling" type="number" min={1} required defaultValue={price?.user_daily_ceiling ?? ""} /></label>
      <label className="text-sm sm:col-span-2">Server daily ceiling <input className={field} name="guild_daily_ceiling" type="number" min={1} required defaultValue={price?.guild_daily_ceiling ?? ""} /></label>
    </div>
  );
}

function Providers({ desk, busy, onRun }: { desk: Desk | null; busy: boolean; onRun: (task: () => Promise<string | null>) => Promise<void> }) {
  return (
    <section className="grid gap-6">
      <p className="text-sm text-zinc-700">One provider can be enabled. The key is saved once on this screen and is not shown again. Ask does not read a provider or a key from the environment.</p>
      {desk && !desk.secret_storage ? <p className="text-sm text-zinc-700">A new API key cannot be saved until the AI process has an encryption key. Ollama can be saved without a key.</p> : null}
      <ul className="grid gap-3">
        {(desk?.providers ?? []).map((provider) => (
          <li key={provider.provider_id} className="border border-zinc-300 p-4">
            <p className="font-semibold">{provider.display_name}</p>
            <p className="mt-1 text-sm text-zinc-700">{provider.kind} · {provider.base_url}</p>
            <p className="mt-1 text-sm text-zinc-700">{provider.enabled ? "Enabled" : "Disabled"} · {provider.secret_configured ? `Key set${provider.secret_hint ? ` · ${provider.secret_hint}` : ""}` : "No key"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={primary} type="button" disabled={busy || provider.enabled} onClick={() => void onRun(() => post("/api/ai/providers/enable", { provider_id: provider.provider_id }))}>Enable</button>
              <button className={quiet} type="button" disabled={busy} onClick={() => void onRun(() => post("/api/ai/providers/models", { provider_id: provider.provider_id }))}>Refresh models</button>
            </div>
            <ul className="mt-4 grid gap-3">
              {(desk?.models ?? []).filter((model) => model.provider_id === provider.provider_id).map((model) => (
                <ModelPrice key={`${model.model_id}-${model.input_micro_usd ?? "none"}-${model.output_micro_usd ?? "none"}`} model={model} busy={busy} onRun={onRun} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <form className="grid gap-3 border border-zinc-300 p-4" onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const secret = String(data.get("secret") ?? "");
        void onRun(async () => {
          const error = await post("/api/ai/providers", {
            display_name: String(data.get("display_name") ?? ""),
            kind: String(data.get("kind") ?? ""),
            base_url: String(data.get("base_url") ?? ""),
            ...(secret.trim() ? { secret } : {}),
          });
          if (!error) form.reset();
          return error;
        });
      }}>
        <h2 className="text-lg font-semibold">Add provider</h2>
        <label className="text-sm">Name <input className={field} name="display_name" required maxLength={80} /></label>
        <label className="text-sm">Type
          <select className={field} name="kind" defaultValue="ollama">
            <option value="ollama">Ollama</option>
            <option value="gemini">Gemini</option>
            <option value="openai">OpenAI-compatible</option>
          </select>
        </label>
        <label className="text-sm">Base URL <input className={field} name="base_url" required placeholder="http://127.0.0.1:11434" /></label>
        <label className="text-sm">API key <input className={field} name="secret" type="password" autoComplete="off" placeholder="Leave empty for Ollama" /></label>
        <button className={`w-fit ${primary}`} disabled={busy}>Save provider</button>
      </form>
    </section>
  );
}

function ModelPrice({ model, busy, onRun }: { model: ModelRow; busy: boolean; onRun: (task: () => Promise<string | null>) => Promise<void> }) {
  const [inputPrice, setInputPrice] = useState(dollars(model.input_micro_usd));
  const [outputPrice, setOutputPrice] = useState(dollars(model.output_micro_usd));
  return (
    <li className="grid gap-2 border border-zinc-200 p-3">
      <p className="text-sm font-semibold">{model.model_name}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">Input USD / 1M <input className={field} value={inputPrice} onChange={(event) => setInputPrice(event.target.value)} inputMode="decimal" /></label>
        <label className="text-sm">Output USD / 1M <input className={field} value={outputPrice} onChange={(event) => setOutputPrice(event.target.value)} inputMode="decimal" /></label>
      </div>
      <button className={`w-fit ${quiet}`} type="button" disabled={busy} onClick={() => {
        const input = microFromDollars(inputPrice);
        const output = microFromDollars(outputPrice);
        if (input === null || output === null) {
          void onRun(async () => "Enter both token prices as dollars per 1M tokens. Zero is allowed.");
          return;
        }
        void onRun(() => post("/api/ai/models/price", { model_id: model.model_id, input_micro_usd: input, output_micro_usd: output }));
      }}>Save token prices</button>
    </li>
  );
}

function Usage({ servers }: { servers: ServerRow[] }) {
  const [rows, setRows] = useState<OperationRow[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  return (
    <section className="grid gap-4">
      <p className="text-sm text-zinc-700">Captured credits are the token cost in micro-USD, rounded up. Cost is that price, truncated. A row without tokens means the provider did not report usage. Prompts are not shown.</p>
      <form className="grid gap-3 border border-zinc-300 p-4 sm:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const params = new URLSearchParams();
        const tenant = String(data.get("tenant_id") ?? "");
        const actor = String(data.get("actor_id") ?? "").trim();
        const from = String(data.get("from") ?? "");
        const to = String(data.get("to") ?? "");
        if (tenant) params.set("tenant_id", tenant);
        if (actor) params.set("actor_id", actor);
        const start = from ? Math.floor(new Date(`${from}T00:00:00`).getTime() / 1000) : null;
        const endDate = to ? new Date(`${to}T00:00:00`) : null;
        if (endDate) endDate.setDate(endDate.getDate() + 1);
        const end = endDate ? Math.floor(endDate.getTime() / 1000) : null;
        if (start) params.set("from", String(start));
        if (end) params.set("to", String(end));
        void fetch(`/api/ai/operations?${params.toString()}`, { cache: "no-store" }).then(async (response) => {
          if (!response.ok) {
            setRows(null);
            setNotice(await failure(response));
            return;
          }
          const body = await response.json() as { operations?: OperationRow[]; truncated?: boolean };
          setRows(Array.isArray(body.operations) ? body.operations : []);
          setTruncated(body.truncated === true);
          setNotice(null);
        });
      }}>
        <label className="text-sm">Server
          <select className={field} name="tenant_id" defaultValue="">
            <option value="">All servers</option>
            {servers.map((server) => <option key={server.tenant_id} value={server.tenant_id}>{server.guild_id}</option>)}
          </select>
        </label>
        <label className="text-sm">Member id <input className={field} name="actor_id" inputMode="numeric" /></label>
        <label className="text-sm">From <input className={field} name="from" type="date" /></label>
        <label className="text-sm">To <input className={field} name="to" type="date" /></label>
        <button className={`w-fit ${primary}`} type="submit">Show usage</button>
      </form>
      {notice ? <p role="alert" className="text-sm text-red-700">{notice}</p> : null}
      {truncated ? <p className="text-sm">Showing the first 200 rows.</p> : null}
      {rows && rows.length === 0 ? <p className="text-sm">No text operations yet.</p> : null}
      {rows && rows.length > 0 ? (
        <div className="overflow-x-auto border border-zinc-300">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-600">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Server</th>
                <th className="px-3 py-2 font-medium">Member</th>
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 font-medium">Tokens</th>
                <th className="px-3 py-2 font-medium">Credits</th>
                <th className="px-3 py-2 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.operation_id} className="border-b border-zinc-100">
                  <td className="px-3 py-2">{row.occurred_at ? new Date(row.occurred_at).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2 font-mono">{row.guild_id ?? row.tenant_id}</td>
                  <td className="px-3 py-2 font-mono">{row.actor_id}</td>
                  <td className="px-3 py-2">{row.model_name ?? "—"}</td>
                  <td className="px-3 py-2">{row.usage_reported ? `${row.input_tokens} in / ${row.output_tokens} out` : "Usage was not reported."}</td>
                  <td className="px-3 py-2">{row.captured}</td>
                  <td className="px-3 py-2">{row.cost_micro_usd === null ? "—" : `${dollars(row.cost_micro_usd)} USD`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function Credits({ servers, busy, onRun }: { servers: ServerRow[] | null; busy: boolean; onRun: (task: () => Promise<string | null>) => Promise<void> }) {
  const [tenantId, setTenantId] = useState("");
  return (
    <section className="grid gap-8">
      <form className="grid gap-3 border border-zinc-300 p-4" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void onRun(() => post("/api/ai/compensation", {
          tenant_id: String(data.get("tenant_id") ?? ""),
          credit_minors: Number(data.get("credit_minors")),
        }));
      }}>
        <h2 className="text-lg font-semibold">Compensation grant</h2>
        <p className="text-sm text-zinc-700">Mints one credit lot for a server and turns on text access. One credit is one micro-USD at the token price saved on the model. 1,000,000 credits is 1 USD. This does not change a paid plan.</p>
        {servers === null ? <p className="text-sm">Loading servers.</p> : servers.length === 0 ? <p className="text-sm">The server list is unavailable.</p> : (
          <label className="text-sm">Server
            <select className={field} name="tenant_id" required value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
              <option value="">Choose</option>
              {servers.map((server) => <option key={server.tenant_id} value={server.tenant_id}>{server.guild_id}</option>)}
            </select>
          </label>
        )}
        <label className="text-sm">Credits <input className={field} name="credit_minors" type="number" min={1} required /></label>
        <button className={`w-fit ${primary}`} disabled={busy || !servers || servers.length === 0}>Grant credits</button>
      </form>
      <AiReviews tenantId={tenantId} />
    </section>
  );
}
