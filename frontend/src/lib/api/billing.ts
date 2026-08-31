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
        `No se pudo cargar la facturación (${response.status})`,
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
      await readApiError(response, "No se pudo iniciar el pago."),
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
      await readApiError(response, "No se pudo abrir el portal de Stripe."),
    );
  }
  return response.json() as Promise<BillingPortalResponse>;
}

export async function assignGuildToPlan(): Promise<void> {
  const response = await apiFetch("/api/billing/assign", { method: "POST" });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "No se pudo asignar este servidor."),
    );
  }
}

export async function unassignGuildFromPlan(): Promise<void> {
  const response = await apiFetch("/api/billing/unassign", { method: "POST" });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "No se pudo quitar este servidor del plan."),
    );
  }
}
