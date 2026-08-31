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
  client = key ? new Stripe(key) : null;
  return client;
}

export function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) {
    throw new HttpError(
      "Stripe no está configurado. Falta STRIPE_SECRET_KEY.",
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
      "Falta STRIPE_WEBHOOK_SECRET.",
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
      `Falta el price id de Stripe para el plan ${tier}.`,
      503,
      "STRIPE_PRICE_MISSING",
    );
  }
  if (priceId.startsWith("prod_")) {
    throw new HttpError(
      "STRIPE_PRICE_* es un product id (prod_…). En el dashboard abre el precio mensual y copia el id que empieza por price_.",
      400,
      "STRIPE_PRICE_INVALID",
    );
  }
  if (!priceId.startsWith("price_")) {
    throw new HttpError(
      "STRIPE_PRICE_* debe ser un price id de Stripe (price_…).",
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
      "PUBLIC_APP_URL es obligatorio para Checkout y el portal.",
      500,
      "MISSING_PUBLIC_APP_URL",
    );
  }
  return url.replace(/\/$/, "");
}
