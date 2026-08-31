/** Tipos de facturación (Fase 4 / 0.12). Stripe rellena filas; `can()` lee entitlements. */

import { isUnlimited, type PlanTier, tierLimit } from "./entitlements.js";

export type PaidPlanTier = "pro" | "business";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid";

export const SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
] as const;

/** Sigue dando acceso de pago (gracia incluida en `past_due`). */
export const PAID_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "active",
  "trialing",
  "past_due",
];

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active: "Activa",
  trialing: "Periodo de prueba",
  past_due: "Pago pendiente",
  canceled: "Cancelada",
  unpaid: "Impagada",
};

export interface BillingPlanPrice {
  monthlyUsd: number;
  label: string;
}

export const BILLING_PLAN_PRICES: Record<PaidPlanTier, BillingPlanPrice> = {
  pro: { monthlyUsd: 4.99, label: "$4.99/mes" },
  business: { monthlyUsd: 14.99, label: "$14.99/mes" },
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
