import { useEffect, useMemo, useState } from "react";
import {
  BILLING_PLAN_PRICES,
  formatSeats,
  isPaidSubscriptionStatus,
  isUnlimited,
  PLAN_TIER_LABEL,
  seatsOverLimit,
  SUBSCRIPTION_STATUS_LABEL,
  TIER_CATALOG,
  type BillingStatusResponse,
  type PaidPlanTier,
  type PlanTier,
} from "@adobos/shared";
import { Check, CreditCard, Loader2 } from "lucide-react";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  assignGuildToPlan,
  fetchBilling,
  startBillingPortal,
  startCheckout,
  unassignGuildFromPlan,
} from "@/lib/api";

type Feedback =
  | { kind: "idle" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

const PLAN_POINTS: Record<PlanTier, string[]> = {
  free: [
    "All 18 current modules, complete",
    "Uncropped welcome canvas",
    "One server without a paid seat",
    "14-day logs",
  ],
  pro: [
    "Everything in Free",
    "Up to 3 covered servers",
    "90-day logs",
    "Per-server bot branding",
  ],
  business: [
    "Everything in Pro",
    "Unlimited servers",
    "1-year logs",
    "Outbound webhooks and public API",
  ],
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { dateStyle: "medium" });
}

export function BillingDashboard() {
  const [data, setData] = useState<BillingStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });
  const [confirmUnassign, setConfirmUnassign] = useState(false);

  const checkoutBanner = useMemo(() => {
    if (typeof window === "undefined") return null;
    const value = new URLSearchParams(window.location.search).get("checkout");
    if (value === "success") return "success" as const;
    if (value === "canceled") return "canceled" as const;
    return null;
  }, []);

  async function reload(): Promise<BillingStatusResponse> {
    const next = await fetchBilling();
    setData(next);
    return next;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchBilling();
        if (!cancelled) setData(next);
      } catch (error: unknown) {
        if (!cancelled) {
          setFeedback({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Couldn't load billing",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!checkoutBanner || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, [checkoutBanner]);

  useEffect(() => {
    if (checkoutBanner !== "success") return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 8;

    const tick = async (): Promise<void> => {
      if (cancelled) return;
      attempts += 1;
      try {
        const next = await fetchBilling();
        if (cancelled) return;
        setData(next);
        setLoading(false);
        if (next.guild.coveredByUser) return;
      } catch {
        // El GET inicial ya reporta el error de carga.
      }
      if (!cancelled && attempts < maxAttempts) {
        window.setTimeout(() => void tick(), 1500);
      }
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, [checkoutBanner]);

  async function onCheckout(tier: PaidPlanTier): Promise<void> {
    setBusy(`checkout-${tier}`);
    setFeedback({ kind: "idle" });
    try {
      const { url } = await startCheckout(tier);
      window.location.assign(url);
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Couldn't start the payment.",
      });
      setBusy(null);
    }
  }

  async function onPortal(): Promise<void> {
    setBusy("portal");
    setFeedback({ kind: "idle" });
    try {
      const { url } = await startBillingPortal();
      window.location.assign(url);
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Couldn't open the portal.",
      });
      setBusy(null);
    }
  }

  async function onAssign(): Promise<void> {
    setBusy("assign");
    setFeedback({ kind: "idle" });
    try {
      await assignGuildToPlan();
      await reload();
      setFeedback({
        kind: "ok",
        message: "This server already uses your paid plan.",
      });
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Couldn't assign the server.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function onUnassign(): Promise<void> {
    setBusy("unassign");
    setFeedback({ kind: "idle" });
    try {
      await unassignGuildFromPlan();
      await reload();
      setConfirmUnassign(false);
      setFeedback({
        kind: "ok",
        message: "This server went back to the Free plan.",
      });
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Couldn't remove the server.",
      });
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading billing…
      </div>
    );
  }

  const sub = data?.subscription;
  const paid = Boolean(sub && isPaidSubscriptionStatus(sub.status));
  const guildTier = data?.guild.tier ?? "free";

  return (
    <div className="space-y-6">
      {checkoutBanner === "success" && (
        <p className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          Payment received. Activating the plan… reload if you still see Free
          after a few seconds.
        </p>
      )}
      {checkoutBanner === "canceled" && (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Checkout canceled. Nothing was charged.
        </p>
      )}
      {feedback.kind === "error" && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {feedback.message}
        </p>
      )}
      {feedback.kind === "ok" && (
        <p className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          {feedback.message}
        </p>
      )}

      <section className="rounded-2xl border border-border/70 bg-card/70 p-5 shadow-sm sm:p-6">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.22em] text-primary">
          This server
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold">
          Plan {PLAN_TIER_LABEL[guildTier]}
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Feature access is decided by this server, not Stripe in real time.
          One subscription covers multiple servers (seats).
        </p>
        {sub && (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Subscription</dt>
              <dd className="font-medium">
                {PLAN_TIER_LABEL[sub.tier]} ·{" "}
                {SUBSCRIPTION_STATUS_LABEL[sub.status]}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Seats</dt>
              <dd className="font-medium">
                {formatSeats(sub.seatsUsed, sub.seatsMax)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Period</dt>
              <dd className="font-medium">
                {sub.cancelAt
                  ? `Cancels on ${formatDate(sub.cancelAt)}`
                  : (formatDate(sub.currentPeriodEnd) ?? "—")}
              </dd>
            </div>
          </dl>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {data?.hasCustomer && (
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(busy) || !data.configured}
              onClick={() => void onPortal()}
            >
              {busy === "portal" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <CreditCard className="size-4" aria-hidden />
              )}
              Manage subscription
            </Button>
          )}
          {paid && !data?.guild.coveredByUser && !data?.guild.coveredByOther && (
            <Button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void onAssign()}
            >
              {busy === "assign" && (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              )}
              Use the paid plan on this server
            </Button>
          )}
          {data?.guild.coveredByUser && (
            <Button
              type="button"
              variant="ghost"
              disabled={Boolean(busy)}
              onClick={() => setConfirmUnassign(true)}
            >
              Remove this server from the plan
            </Button>
          )}
        </div>
        {sub && seatsOverLimit(sub.seatsUsed, sub.seatsMax) ? (
          <p className="mt-3 text-sm text-muted-foreground">
            This subscription covers more servers than the plan cap (
            {formatSeats(sub.seatsUsed, sub.seatsMax)}). Seats aren't reduced
            when downgrading; you won't be able to assign more until you're
            within the limit.
          </p>
        ) : null}
        {data?.guild.coveredByOther ? (
          <p className="mt-3 text-sm text-muted-foreground">
            This server is already covered by another subscription.
          </p>
        ) : null}
        {data && !data.configured && (
          <p className="mt-3 text-sm text-muted-foreground">
            Stripe isn't configured in this environment. You can view the plans;
            checkout activates with <code>STRIPE_SECRET_KEY</code> and the
            price ids.
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {(["free", "pro", "business"] as const).map((tier) => {
          const current = guildTier === tier;
          const paidTier = tier === "free" ? null : tier;
          const price =
            paidTier && BILLING_PLAN_PRICES[paidTier]
              ? BILLING_PLAN_PRICES[paidTier].label
              : "$0";
          const covered = TIER_CATALOG[tier].limits.coveredGuilds;
          return (
            <Card
              key={tier}
              className={current ? "border-primary/50 shadow-md" : undefined}
            >
              <CardHeader>
                <CardTitle>{PLAN_TIER_LABEL[tier]}</CardTitle>
                <CardDescription>
                  {tier === "free"
                    ? "Free · one server without a seat"
                    : isUnlimited(covered)
                      ? `${price} · unlimited servers`
                      : `${price} · up to ${covered} servers`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm">
                  {PLAN_POINTS[tier].map((point) => (
                    <li key={point} className="flex gap-2">
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden
                      />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                {paidTier ? (
                  <Button
                    type="button"
                    className="w-full"
                    variant={current ? "outline" : "default"}
                    disabled={
                      Boolean(busy) ||
                      !data?.configured ||
                      !data.pricesConfigured ||
                      paid
                    }
                    onClick={() => void onCheckout(paidTier)}
                  >
                    {busy === `checkout-${paidTier}` && (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    )}
                    {paid
                      ? "Change plan in the portal"
                      : `Upgrade to ${PLAN_TIER_LABEL[tier]}`}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Default plan if the server doesn't use a paid seat.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog
        open={confirmUnassign}
        title="Remove this server from the plan"
        description="The server will return to Free immediately. Paid features will stop being available here."
        confirmLabel="Remove from plan"
        tone="destructive"
        confirming={busy === "unassign"}
        onCancel={() => {
          if (busy !== "unassign") setConfirmUnassign(false);
        }}
        onConfirm={() => void onUnassign()}
      />
    </div>
  );
}
