import Stripe from "stripe";
import { HttpError } from "../../core/http/httpError.js";
import type { StripePriceEnv } from "./map.js";

let client: Stripe | null | undefined;

export function stripeSecretKey(): string | null {
  return process.env.STRIPE_SECRET_KEY?.trim() || null;
}

export function stripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

export function stripePriceEnv(): StripePriceEnv {
  return {
    pro: process.env.STRIPE_PRICE_PRO?.trim() || null,
    business: process.env.STRIPE_PRICE_BUSINESS?.trim() || null,
  };
}

export function stripeReady(): boolean {
  return Boolean(stripeSecretKey());
}

export function pricesConfigured(): boolean {
  const prices = stripePriceEnv();
  return Boolean(prices.pro || prices.business);
}

export function getStripe(): Stripe | null {
  if (client !== undefined) return client;
  const key = stripeSecretKey();
  client = key
    ? new Stripe(key, {
        // Fija la versión de API contra la que compila este código.
        // `Stripe.API_VERSION` = la versión probada del SDK instalado
        // (hoy "2026-08-26.dahlia"); solo cambia al subir `stripe` a propósito,
        // nunca por drift de la versión rolling de la cuenta.
        apiVersion: Stripe.API_VERSION,
        // Reintentos idempotentes con backoff en fallos de red / 429 / 5xx.
        maxNetworkRetries: 2,
      })
    : null;
  return client;
}

export function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) {
    throw new HttpError(
      "Stripe is not configured. STRIPE_SECRET_KEY is missing.",
      503,
      "STRIPE_NOT_CONFIGURED",
    );
  }
  return stripe;
}

export function requireWebhookSecret(): string {
  const secret = stripeWebhookSecret();
  if (!secret) {
    throw new HttpError(
      "STRIPE_WEBHOOK_SECRET is missing.",
      503,
      "STRIPE_WEBHOOK_NOT_CONFIGURED",
    );
  }
  return secret;
}

export function priceIdForTier(tier: "pro" | "business"): string {
  const prices = stripePriceEnv();
  const priceId = tier === "business" ? prices.business : prices.pro;
  if (!priceId) {
    throw new HttpError(
      `The Stripe price id for the ${tier} plan is missing.`,
      503,
      "STRIPE_PRICE_MISSING",
    );
  }
  if (priceId.startsWith("prod_")) {
    throw new HttpError(
      "STRIPE_PRICE_* is a product id (prod_…). In the dashboard open the monthly price and copy the id starting with price_.",
      400,
      "STRIPE_PRICE_INVALID",
    );
  }
  if (!priceId.startsWith("price_")) {
    throw new HttpError(
      "STRIPE_PRICE_* must be a Stripe price id (price_…).",
      400,
      "STRIPE_PRICE_INVALID",
    );
  }
  return priceId;
}

export function publicAppUrl(): string {
  const url = process.env.PUBLIC_APP_URL?.trim();
  if (!url) {
    throw new HttpError(
      "PUBLIC_APP_URL is required for Checkout and the portal.",
      500,
      "MISSING_PUBLIC_APP_URL",
    );
  }
  return url.replace(/\/$/, "");
}
