/** Mapeo puro Stripe → planes Adobos. Sin I/O ni SDK. */

import type {
  PaidPlanTier,
  PlanTier,
  SubscriptionStatus,
} from "@adobos/shared";

export interface StripePriceEnv {
  pro: string | null;
  business: string | null;
}

export function normalizeStripeStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "paused":
      return "paused";
    case "unpaid":
    case "incomplete":
      return "unpaid";
    default:
      return "canceled";
  }
}

/** Acceso de pago: activo, prueba, gracia (`past_due`) o pause collections. */
export function isPaidStripeStatus(status: string): boolean {
  return (
    status === "active" ||
    status === "trialing" ||
    status === "past_due" ||
    status === "paused"
  );
}

export function stripeObjectId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof (value as { id: unknown }).id === "string"
  ) {
    return (value as { id: string }).id;
  }
  return null;
}

/** Invoice API 2025+: parent.subscription_details; fallback al campo plano. */
export function invoiceSubscriptionId(invoice: {
  subscription?: unknown;
  parent?: {
    subscription_details?: { subscription?: unknown } | null;
  } | null;
}): string | null {
  return (
    stripeObjectId(invoice.parent?.subscription_details?.subscription) ??
    stripeObjectId(invoice.subscription)
  );
}

export function subscriptionPeriodEndUnix(sub: {
  current_period_end?: number | null;
  items?: { data?: Array<{ current_period_end?: number | null }> };
}): number | null {
  const fromItem = sub.items?.data?.[0]?.current_period_end;
  if (typeof fromItem === "number" && Number.isFinite(fromItem))
    return fromItem;
  const fromSub = sub.current_period_end;
  if (typeof fromSub === "number" && Number.isFinite(fromSub)) return fromSub;
  return null;
}

export function tierFromPriceId(
  priceId: string | null | undefined,
  prices: StripePriceEnv,
): PaidPlanTier | null {
  if (!priceId) return null;
  if (prices.business && priceId === prices.business) return "business";
  if (prices.pro && priceId === prices.pro) return "pro";
  return null;
}

export function paidTierOrPro(tier: PlanTier | null): PaidPlanTier {
  return tier === "business" ? "business" : "pro";
}

export function unixToDate(unix: number | null | undefined): Date | null {
  if (typeof unix !== "number" || !Number.isFinite(unix)) return null;
  return new Date(unix * 1000);
}
