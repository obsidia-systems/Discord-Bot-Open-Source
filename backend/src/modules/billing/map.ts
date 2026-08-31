/** Mapeo puro Stripe → planes Adobos. Sin I/O ni SDK. */

import type { PaidPlanTier, PlanTier, SubscriptionStatus } from "@adobos/shared";

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
    case "unpaid":
    case "incomplete":
      return "unpaid";
    default:
      return "canceled";
  }
}

/** Acceso de pago: activo, prueba o gracia (`past_due`). */
export function isPaidStripeStatus(status: string): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
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
