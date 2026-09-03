import type {
  BillingCheckoutResponse,
  BillingPortalResponse,
  BillingStatusResponse,
  PaidPlanTier,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchBilling(): Promise<BillingStatusResponse> {
  const response = await apiFetch("/api/billing");
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't load billing (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<BillingStatusResponse>;
}

export async function startCheckout(
  tier: PaidPlanTier,
): Promise<BillingCheckoutResponse> {
  const response = await apiFetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier }),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't start the payment."),
    );
  }
  return response.json() as Promise<BillingCheckoutResponse>;
}

export async function startBillingPortal(): Promise<BillingPortalResponse> {
  const response = await apiFetch("/api/billing/portal", {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't open the Stripe portal."),
    );
  }
  return response.json() as Promise<BillingPortalResponse>;
}

export async function assignGuildToPlan(): Promise<void> {
  const response = await apiFetch("/api/billing/assign", { method: "POST" });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't assign this server."),
    );
  }
}

export async function unassignGuildFromPlan(): Promise<void> {
  const response = await apiFetch("/api/billing/unassign", { method: "POST" });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't remove this server from the plan."),
    );
  }
}
