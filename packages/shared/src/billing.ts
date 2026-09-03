/** Tipos de facturación (Fase 4 / 0.12). Stripe rellena filas; `can()` lee entitlements. */

import { isUnlimited, type PlanTier, tierLimit } from "./entitlements.js";

export type PaidPlanTier = "pro" | "business";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "paused"
  | "canceled"
  | "unpaid";

export const SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "paused",
  "canceled",
  "unpaid",
] as const;

/** Sigue dando acceso de pago (gracia `past_due` y pause collections). */
export const PAID_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "active",
  "trialing",
  "past_due",
  "paused",
];

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active: "Active",
  trialing: "Trial period",
  past_due: "Past due",
  paused: "Paused",
  canceled: "Canceled",
  unpaid: "Unpaid",
};

export interface BillingPlanPrice {
  monthlyEur: number;
  label: string;
}

export const BILLING_PLAN_PRICES: Record<PaidPlanTier, BillingPlanPrice> = {
  pro: { monthlyEur: 4.99, label: "4,99€/mes" },
  business: { monthlyEur: 14.99, label: "14,99€/mes" },
};

export interface BillingSubscriptionView {
  id: number;
  tier: PlanTier;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
  seatsUsed: number;
  seatsMax: number;
  coveredGuildIds: string[];
  owner: boolean;
}

export interface BillingStatusResponse {
  configured: boolean;
  pricesConfigured: boolean;
  hasCustomer: boolean;
  guild: {
    guildId: string;
    tier: PlanTier;
    coveredByUser: boolean;
    coveredByOther: boolean;
  };
  subscription: BillingSubscriptionView | null;
}

export interface BillingCheckoutRequest {
  tier: PaidPlanTier;
}

export interface BillingCheckoutResponse {
  url: string;
}

export interface BillingPortalResponse {
  url: string;
}

export function isSubscriptionStatus(
  value: unknown,
): value is SubscriptionStatus {
  return (
    value === "active" ||
    value === "trialing" ||
    value === "past_due" ||
    value === "paused" ||
    value === "canceled" ||
    value === "unpaid"
  );
}

export function isPaidPlanTier(value: unknown): value is PaidPlanTier {
  return value === "pro" || value === "business";
}

export function isPaidSubscriptionStatus(status: string): boolean {
  return (PAID_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}

export function seatsMaxForTier(tier: PlanTier): number {
  return tierLimit(tier, "coveredGuilds");
}

export function formatSeats(used: number, max: number): string {
  if (isUnlimited(max)) return `${used} / ilimitados`;
  return `${used} / ${max}`;
}

/** True si asignar un guild nuevo superaría el tope. Ilimitado o ya cubierto = no. */
export function seatsAtCapacity(
  used: number,
  max: number,
  guildAlreadyCovered: boolean,
): boolean {
  if (guildAlreadyCovered) return false;
  if (isUnlimited(max)) return false;
  return used >= max;
}

export function seatsOverLimit(used: number, max: number): boolean {
  if (isUnlimited(max)) return false;
  return used > max;
}

/** Otra suscripción de pago cubre este guild; el comprador no es el dueño. */
export function guildCoveredByOtherPayer(
  buyerUserId: string,
  covering: { userId: string; status: string } | null | undefined,
): boolean {
  if (!covering) return false;
  if (!isPaidSubscriptionStatus(covering.status)) return false;
  return covering.userId !== buyerUserId;
}
