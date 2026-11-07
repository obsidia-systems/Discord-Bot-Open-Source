import { useState } from "react";

async function post(path: string, body: object): Promise<string> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) return `Request failed (${response.status}).`;
  return "Saved.";
}

export function AiSetup() {
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="mt-8 space-y-10">
      <form className="space-y-3" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const number = (key: string) => Number(data.get(key));
        void post("/api/ai/pricing", {
          model_class: String(data.get("model_class") ?? ""),
          estimate_amount: number("estimate_amount"),
          maximum_amount: number("maximum_amount"),
          unit_charge: number("unit_charge"),
          user_daily_ceiling: number("user_daily_ceiling"),
          guild_daily_ceiling: number("guild_daily_ceiling"),
        }).then(setNotice);
      }}>
        <h2 className="text-lg font-semibold">Text price</h2>
        <p className="text-sm text-zinc-700">Amounts are credit-minors. Publishing retires the previous active text price. Existing operations keep the price they reserved. Model id is the provider model name, such as gemma4:12b-it-qat.</p>
        <label className="block text-sm">Model id <input className="mt-1 block border px-2 py-1" name="model_class" required maxLength={40} placeholder="gemini-2.5-flash" /></label>
        <label className="block text-sm">Reserve maximum <input className="mt-1 block border px-2 py-1" name="estimate_amount" type="number" min={1} required /></label>
        <label className="block text-sm">Charge ceiling <input className="mt-1 block border px-2 py-1" name="maximum_amount" type="number" min={1} required /></label>
        <label className="block text-sm">Charge per character <input className="mt-1 block border px-2 py-1" name="unit_charge" type="number" min={1} required /></label>
        <label className="block text-sm">Member daily ceiling <input className="mt-1 block border px-2 py-1" name="user_daily_ceiling" type="number" min={1} required /></label>
        <label className="block text-sm">Server daily ceiling <input className="mt-1 block border px-2 py-1" name="guild_daily_ceiling" type="number" min={1} required /></label>
        <button className="border px-3 py-1.5 text-sm" type="submit">Publish price</button>
      </form>
      <form className="space-y-3" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void post("/api/ai/compensation", {
          tenant_id: String(data.get("tenant_id") ?? ""),
          credit_minors: Number(data.get("credit_minors")),
        }).then(setNotice);
      }}>
        <h2 className="text-lg font-semibold">Compensation grant</h2>
        <p className="text-sm text-zinc-700">Mints one credit lot for an installation and turns on text access. This does not change a paid plan.</p>
        <label className="block text-sm">Installation id <input className="mt-1 block w-full border px-2 py-1 font-mono" name="tenant_id" required /></label>
        <label className="block text-sm">Credit-minors <input className="mt-1 block border px-2 py-1" name="credit_minors" type="number" min={1} required /></label>
        <button className="border px-3 py-1.5 text-sm" type="submit">Grant credits</button>
      </form>
      {notice ? <p role="status">{notice}</p> : null}
    </div>
  );
}
