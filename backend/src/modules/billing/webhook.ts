import { eq } from "drizzle-orm";
import type { RequestHandler } from "express";
import Stripe from "stripe";
import { HttpError } from "#core/http/httpError.js";
import { logger } from "#core/log.js";
import { getDb, one } from "#db/client.js";
import { webhookEvents } from "#db/schema.js";
import {
  applyCheckoutSession,
  applyInvoiceEvent,
  applyStripeSubscription,
} from "./domain/billing.js";
import { requireStripe, requireWebhookSecret } from "./stripe.js";

async function alreadyProcessed(eventId: string): Promise<boolean> {
  const row = await one(
    getDb()
      .select({ eventId: webhookEvents.eventId })
      .from(webhookEvents)
      .where(eq(webhookEvents.eventId, eventId))
      .limit(1),
  );
  return Boolean(row);
}

async function markProcessed(
  eventId: string,
  eventType: string,
): Promise<void> {
  await getDb()
    .insert(webhookEvents)
    .values({ eventId, eventType, processedAt: new Date() })
    .onConflictDoNothing();
}

async function processStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await applyCheckoutSession(event.data.object);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applyStripeSubscription(event.data.object);
      break;
    case "invoice.paid":
    case "invoice.payment_failed":
      await applyInvoiceEvent(event.data.object);
      break;
    default:
      break;
  }
}

/**
 * POST /api/billing/webhook — público, body crudo, firma verificada.
 * Express 5 enruta el throw síncrono y la promesa rechazada al errorHandler;
 * el `try/catch` interno se queda porque traduce el error de firma de Stripe.
 */
export const stripeWebhookHandler: RequestHandler = async (req, res) => {
  if (!Buffer.isBuffer(req.body)) {
    throw new HttpError(
      "The Stripe webhook requires the raw body.",
      500,
      "WEBHOOK_BODY_PARSED",
    );
  }

  const signature = req.headers["stripe-signature"];
  if (!signature || Array.isArray(signature)) {
    throw new HttpError(
      "Missing the Stripe-Signature header.",
      400,
      "STRIPE_SIGNATURE_MISSING",
    );
  }

  const stripe = requireStripe();
  const secret = requireWebhookSecret();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, secret);
  } catch (error: unknown) {
    if (
      error instanceof Stripe.errors.StripeSignatureVerificationError ||
      (error instanceof Error &&
        error.name === "StripeSignatureVerificationError")
    ) {
      throw new HttpError(
        "Invalid webhook signature.",
        400,
        "STRIPE_SIGNATURE_INVALID",
      );
    }
    throw error;
  }

  if (await alreadyProcessed(event.id)) {
    res.json({ received: true, duplicate: true });
    return;
  }

  await processStripeEvent(event);
  await markProcessed(event.id, event.type);
  logger.info({ eventId: event.id, type: event.type }, "webhook stripe");
  res.json({ received: true });
};
