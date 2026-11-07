import { useState } from "react";

interface CreditReview {
  reservation_id: string;
  operation_id: string;
  actor_id: string;
  reservation_state: string;
  estimated_amount: number;
  captured_amount: number;
  review_at: string | null;
  model_class: string;
}

function when(value: string | null): string {
  if (!value) return "Review time is not set.";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Review time is not set.";
  return date.toLocaleString();
}

function held(review: CreditReview): number {
  return Math.max(0, review.estimated_amount - review.captured_amount);
}

export function AiReviews() {
  const [tenantId, setTenantId] = useState("");
  const [reviews, setReviews] = useState<CreditReview[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function load(tenant: string, keepNotice = false) {
    setPending(true);
    const response = await fetch(`/api/ai/reviews?tenant_id=${encodeURIComponent(tenant)}`);
    setPending(false);
    if (!response.ok) {
      setReviews(null);
      setNotice(response.status === 400 ? "Enter a valid installation id." : "Credit review is unavailable.");
      return;
    }
    const body = await response.json() as { reviews?: CreditReview[] };
    setReviews(Array.isArray(body.reviews) ? body.reviews : []);
    if (!keepNotice) setNotice(null);
  }

  async function close(review: CreditReview, evidence: "usage" | "absence") {
    const prompt = evidence === "absence"
      ? "Release the held credits for this reservation?"
      : "Capture the full reserve for this reservation?";
    if (!window.confirm(prompt)) return;
    setPending(true);
    const response = await fetch("/api/ai/reconciliation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        reservation_id: review.reservation_id,
        evidence,
      }),
    });
    if (response.status === 422) {
      setNotice("This reservation is not in review yet.");
    } else if (!response.ok) {
      setNotice("Credit review is unavailable.");
    } else {
      setNotice(evidence === "absence" ? "Credits released." : "Usage captured.");
    }
    await load(tenantId, true);
  }

  const waiting = reviews ?? [];
  const heldTotal = waiting.reduce((sum, review) => sum + held(review), 0);

  return (
    <section className="mt-10 space-y-3">
      <h2 className="text-lg font-semibold">Credit review</h2>
      <p className="text-sm text-zinc-700">Pending verification stays reserved. Release and capture are available only after the reservation enters review. Release returns the held credits. Confirm usage captures the full reserve.</p>
      <form className="space-y-3" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const tenant = String(data.get("tenant_id") ?? "").trim();
        setTenantId(tenant);
        void load(tenant);
      }}>
        <label className="block text-sm">Installation id <input className="mt-1 block w-full border px-2 py-1 font-mono" name="tenant_id" required defaultValue={tenantId} /></label>
        <button className="border px-3 py-1.5 text-sm" type="submit" disabled={pending}>Load reviews</button>
      </form>
      {reviews && reviews.length === 0 ? <p>No reservations are waiting.</p> : null}
      {reviews && reviews.length > 0 ? <p>{reviews.length} waiting. Held {heldTotal} credit-minors.</p> : null}
      <ul className="space-y-3">
        {waiting.map((review) => (
          <li key={review.reservation_id} className="border border-zinc-200 px-3 py-2">
            <p>{review.reservation_state === "Disputed" ? "In review" : "Pending verification"}</p>
            <p className="text-sm text-zinc-700">Held {held(review)} credit-minors. Model {review.model_class || "unknown"}. Member {review.actor_id}.</p>
            <p className="text-sm text-zinc-700">{review.reservation_state === "Disputed" ? `In review since ${when(review.review_at)}.` : `Enters review ${when(review.review_at)}.`}</p>
            {review.reservation_state === "Disputed" ? (
              <div className="mt-2 flex gap-2">
                <button className="border px-3 py-1.5 text-sm" type="button" disabled={pending} onClick={() => void close(review, "absence")}>Release credits</button>
                <button className="border px-3 py-1.5 text-sm" type="button" disabled={pending} onClick={() => void close(review, "usage")}>Confirm usage</button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  );
}
