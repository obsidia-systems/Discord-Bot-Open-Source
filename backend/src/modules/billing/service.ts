import {
  guildCoveredByOtherPayer,
  isPaidSubscriptionStatus,
  isPlanTier,
  isSubscriptionStatus,
  type PaidPlanTier,
  type PlanTier,
  seatsAtCapacity,
  seatsMaxForTier,
  type SubscriptionStatus,
} from "@adobos/shared";
import { desc, eq } from "drizzle-orm";
import type Stripe from "stripe";
import {
  assertSeatsAvailable,
  clearGuildEntitlement,
  EntitlementError,
  getGuildEntitlementRow,
  getGuildTier,
  listGuildIdsForSubscription,
  setTierForSubscriptionGuilds,
  upsertGuildEntitlement,
} from "../../core/entitlements/service.js";
import { HttpError } from "../../core/http/httpError.js";
import { logger } from "../../core/log.js";
import { getDb, one } from "../../db/client.js";
import {
  billingCustomers,
  type SubscriptionRow,
  subscriptions,
} from "../../db/schema.js";
import {
  invoiceSubscriptionId,
  isPaidStripeStatus,
  normalizeStripeStatus,
  paidTierOrPro,
  stripeObjectId,
  subscriptionPeriodEndUnix,
  tierFromPriceId,
  unixToDate,
} from "./map.js";
import {
  getStripe,
  priceIdForTier,
  publicAppUrl,
  requireStripe,
  stripePriceEnv,
  stripeReady,
  pricesConfigured as stripePricesConfigured,
} from "./stripe.js";

function metadataString(
  metadata: Stripe.Metadata | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key]?.trim();
  return value || null;
}

function priceIdFromSubscription(sub: Stripe.Subscription): string | null {
  const price = sub.items.data[0]?.price;
  return stripeObjectId(price);
}

function periodEndFromSubscription(sub: Stripe.Subscription): Date | null {
  return unixToDate(subscriptionPeriodEndUnix(sub));
}

function cancelAtFromSubscription(sub: Stripe.Subscription): Date | null {
  const unix = sub.cancel_at;
  if (typeof unix === "number") return unixToDate(unix);
  if (sub.cancel_at_period_end) return periodEndFromSubscription(sub);
  return null;
}

export async function getBillingCustomer(
  userId: string,
): Promise<string | null> {
  const row = await one(
    getDb()
      .select({ stripeCustomerId: billingCustomers.stripeCustomerId })
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, userId))
      .limit(1),
  );
  return row?.stripeCustomerId ?? null;
}

export async function getUserIdByCustomer(
  stripeCustomerId: string,
): Promise<string | null> {
  const row = await one(
    getDb()
      .select({ userId: billingCustomers.userId })
      .from(billingCustomers)
      .where(eq(billingCustomers.stripeCustomerId, stripeCustomerId))
      .limit(1),
  );
  return row?.userId ?? null;
}

export async function ensureBillingCustomer(
  userId: string,
  stripeCustomerId: string,
): Promise<void> {
  const now = new Date();
  await getDb()
    .insert(billingCustomers)
    .values({
      userId,
      stripeCustomerId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: billingCustomers.userId,
      set: { stripeCustomerId, updatedAt: now },
    });
}

async function stripeCustomerExists(customerId: string): Promise<boolean> {
  const stripe = requireStripe();
  try {
    const customer = await stripe.customers.retrieve(customerId);
    return !("deleted" in customer && customer.deleted);
  } catch (error: unknown) {
    if (error instanceof Error && /No such customer/i.test(error.message)) {
      return false;
    }
    throw error;
  }
}

/** Customer de esta cuenta Stripe. Si el id local es de otra cuenta (test anterior), se recrea. */
export async function getOrCreateStripeCustomer(
  userId: string,
): Promise<string> {
  const stripe = requireStripe();
  const existing = await getBillingCustomer(userId);
  if (existing && (await stripeCustomerExists(existing))) {
    return existing;
  }
  if (existing) {
    logger.warn(
      { userId },
      "Customer de Stripe obsoleto (otra cuenta o borrado); se crea uno nuevo",
    );
  }
  const customer = await stripe.customers.create({
    metadata: { discordUserId: userId },
  });
  await ensureBillingCustomer(userId, customer.id);
  return customer.id;
}

export async function getSubscriptionByStripeId(
  stripeSubscriptionId: string,
): Promise<SubscriptionRow | undefined> {
  return one(
    getDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
      .limit(1),
  );
}

export async function getSubscriptionById(
  id: number,
): Promise<SubscriptionRow | undefined> {
  return one(
    getDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, id))
      .limit(1),
  );
}

export async function getLatestSubscriptionForUser(
  userId: string,
): Promise<SubscriptionRow | undefined> {
  const rows = await getDb()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.updatedAt));
  return (
    rows.find((row) => isPaidSubscriptionStatus(row.status)) ?? rows[0]
  );
}

async function upsertSubscriptionRow(input: {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string | null;
  tier: PlanTier;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAt: Date | null;
}): Promise<SubscriptionRow> {
  const now = new Date();
  const existing = await getSubscriptionByStripeId(input.stripeSubscriptionId);
  if (existing) {
    const [updated] = await getDb()
      .update(subscriptions)
      .set({
        userId: input.userId,
        stripeCustomerId: input.stripeCustomerId,
        stripePriceId: input.stripePriceId,
        tier: input.tier,
        status: input.status,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAt: input.cancelAt,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  const [created] = await getDb()
    .insert(subscriptions)
    .values({
      userId: input.userId,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripePriceId: input.stripePriceId,
      tier: input.tier,
      status: input.status,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAt: input.cancelAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!created) {
    throw new HttpError(
      "No se pudo guardar la suscripción.",
      500,
      "SUBSCRIPTION_INSERT_FAILED",
    );
  }
  return created;
}

export async function assignGuildToSubscription(input: {
  guildId: string;
  subscriptionId: number;
  tier: PlanTier;
  userId: string;
}): Promise<void> {
  const existing = await getGuildEntitlementRow(input.guildId);
  if (
    existing?.subscriptionId &&
    existing.subscriptionId !== input.subscriptionId
  ) {
    const other = await getSubscriptionById(existing.subscriptionId);
    if (other && isPaidSubscriptionStatus(other.status)) {
      throw new HttpError(
        "Este servidor ya está cubierto por otra suscripción.",
        409,
        "GUILD_ALREADY_COVERED",
      );
    }
  }

  const paidTier = isPlanTier(input.tier) && input.tier !== "free"
    ? input.tier
    : "pro";
  await assertSeatsAvailable(input.subscriptionId, paidTier, input.guildId);
  await upsertGuildEntitlement({
    guildId: input.guildId,
    tier: paidTier,
    subscriptionId: input.subscriptionId,
  });
}

export async function unassignGuildFromUser(
  guildId: string,
  userId: string,
): Promise<void> {
  const existing = await getGuildEntitlementRow(guildId);
  if (!existing?.subscriptionId) return;
  const sub = await getSubscriptionById(existing.subscriptionId);
  if (!sub || sub.userId !== userId) {
    throw new HttpError(
      "Este servidor no está cubierto por tu suscripción.",
      403,
      "GUILD_NOT_OWNED",
    );
  }
  await clearGuildEntitlement(guildId);
}

async function resolveUserIdForStripe(input: {
  metadata?: Stripe.Metadata | null;
  customerId: string | null;
  clientReferenceId?: string | null;
}): Promise<string | null> {
  const fromMeta = metadataString(input.metadata, "userId");
  if (fromMeta) return fromMeta;
  const fromRef = input.clientReferenceId?.trim();
  if (fromRef) return fromRef;
  if (input.customerId) return getUserIdByCustomer(input.customerId);
  return null;
}

export async function applyStripeSubscription(
  sub: Stripe.Subscription,
  extra?: { userId?: string | null; guildId?: string | null },
): Promise<SubscriptionRow | null> {
  const customerId = stripeObjectId(sub.customer);
  const userId = await resolveUserIdForStripe({
    metadata: sub.metadata,
    customerId,
    clientReferenceId: extra?.userId,
  });
  if (!userId || !customerId) {
    logger.warn(
      { stripeSubscriptionId: sub.id },
      "Suscripción Stripe sin userId o customer; se ignora",
    );
    return null;
  }

  await ensureBillingCustomer(userId, customerId);

  const priceId = priceIdFromSubscription(sub);
  const mappedTier = tierFromPriceId(priceId, stripePriceEnv());
  const status = normalizeStripeStatus(sub.status);
  const paid = isPaidStripeStatus(sub.status);
  const existing = await getSubscriptionByStripeId(sub.id);
  const tier: PlanTier = paid
    ? (mappedTier ??
      (isPlanTier(existing?.tier) && existing!.tier !== "free"
        ? existing!.tier
        : "pro"))
    : "pro";

  const row = await upsertSubscriptionRow({
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    tier: paid ? tier : existing && isPlanTier(existing.tier) ? existing.tier : tier,
    status,
    currentPeriodEnd: periodEndFromSubscription(sub),
    cancelAt: cancelAtFromSubscription(sub),
  });

  const effectiveTier: PlanTier = paid ? paidTierOrPro(tier) : "free";
  await setTierForSubscriptionGuilds(row.id, effectiveTier);

  const guildId = extra?.guildId ?? metadataString(sub.metadata, "guildId");
  if (paid && guildId) {
    try {
      await assignGuildToSubscription({
        guildId,
        subscriptionId: row.id,
        tier: effectiveTier,
        userId,
      });
    } catch (error: unknown) {
      if (error instanceof EntitlementError && error.code === "SEATS_EXCEEDED") {
        logger.warn(
          { guildId, subscriptionId: row.id },
          "Sin plazas para asignar el servidor del checkout",
        );
        return row;
      }
      if (
        error instanceof HttpError &&
        error.code === "GUILD_ALREADY_COVERED"
      ) {
        logger.warn(
          { guildId, subscriptionId: row.id },
          "Servidor ya cubierto por otra suscripción",
        );
        return row;
      }
      throw error;
    }
  }

  return row;
}

export async function applyCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (session.mode !== "subscription") return;
  const stripe = getStripe();
  if (!stripe) return;

  const subId = stripeObjectId(session.subscription);
  const customerId = stripeObjectId(session.customer);
  const userId = await resolveUserIdForStripe({
    metadata: session.metadata,
    customerId,
    clientReferenceId: session.client_reference_id,
  });
  if (customerId && userId) {
    await ensureBillingCustomer(userId, customerId);
  }
  if (!subId) {
    logger.warn({ sessionId: session.id }, "Checkout sin subscription id");
    return;
  }

  const sub = await stripe.subscriptions.retrieve(subId);
  await applyStripeSubscription(sub, {
    userId,
    guildId: metadataString(session.metadata, "guildId"),
  });
}

export async function applyInvoiceEvent(
  invoice: Stripe.Invoice,
): Promise<void> {
  const stripe = getStripe();
  if (!stripe) return;
  const subId = invoiceSubscriptionId(invoice);
  if (!subId) return;
  const sub = await stripe.subscriptions.retrieve(subId);
  await applyStripeSubscription(sub);
}

export async function getBillingStatus(input: {
  userId: string;
  guildId: string;
}) {
  const guildTier = await getGuildTier(input.guildId);
  const entitlement = await getGuildEntitlementRow(input.guildId);
  const sub = await getLatestSubscriptionForUser(input.userId);
  const customerId = await getBillingCustomer(input.userId);
  const coveredByUser = Boolean(
    sub && entitlement?.subscriptionId === sub.id,
  );
  const coveredByOther = Boolean(
    entitlement?.subscriptionId &&
      (!sub || entitlement.subscriptionId !== sub.id),
  );

  let subscriptionView = null;
  if (sub && isSubscriptionStatus(sub.status) && isPlanTier(sub.tier)) {
    const coveredGuildIds = await listGuildIdsForSubscription(sub.id);
    const seatsMax = seatsMaxForTier(sub.tier);
    subscriptionView = {
      id: sub.id,
      tier: sub.tier,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      cancelAt: sub.cancelAt?.toISOString() ?? null,
      seatsUsed: coveredGuildIds.length,
      seatsMax,
      coveredGuildIds,
      owner: sub.userId === input.userId,
    };
  }

  return {
    configured: stripeReady(),
    pricesConfigured: stripePricesConfigured(),
    hasCustomer: Boolean(customerId),
    guild: {
      guildId: input.guildId,
      tier: guildTier,
      coveredByUser,
      coveredByOther,
    },
    subscription: subscriptionView,
  };
}

async function assertGuildFreeForCheckout(
  userId: string,
  guildId: string,
  tier: PaidPlanTier,
): Promise<void> {
  const entitlement = await getGuildEntitlementRow(guildId);
  if (entitlement?.subscriptionId) {
    const covering = await getSubscriptionById(entitlement.subscriptionId);
    if (
      covering &&
      guildCoveredByOtherPayer(userId, {
        userId: covering.userId,
        status: covering.status,
      })
    ) {
      throw new HttpError(
        "Este servidor ya está cubierto por otra suscripción.",
        409,
        "GUILD_ALREADY_COVERED",
      );
    }
  }
  if (seatsAtCapacity(0, seatsMaxForTier(tier), false)) {
    throw new HttpError(
      "Este plan no tiene plazas para cubrir un servidor.",
      409,
      "SEATS_EXCEEDED",
    );
  }
}

export async function createCheckoutSession(input: {
  userId: string;
  guildId: string;
  tier: PaidPlanTier;
}): Promise<{ url: string }> {
  const stripe = requireStripe();
  const priceId = priceIdForTier(input.tier);
  const existing = await getLatestSubscriptionForUser(input.userId);
  if (existing && isPaidSubscriptionStatus(existing.status)) {
    throw new HttpError(
      "Ya tienes una suscripción activa. Usa el portal para cambiar de plan.",
      409,
      "ALREADY_SUBSCRIBED",
    );
  }

  await assertGuildFreeForCheckout(input.userId, input.guildId, input.tier);

  const customerId = await getOrCreateStripeCustomer(input.userId);

  const base = publicAppUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/dashboard/general/billing?checkout=success`,
    cancel_url: `${base}/dashboard/general/billing?checkout=canceled`,
    client_reference_id: input.userId,
    allow_promotion_codes: true,
    metadata: {
      userId: input.userId,
      guildId: input.guildId,
      tier: input.tier,
    },
    subscription_data: {
      metadata: {
        userId: input.userId,
        guildId: input.guildId,
        tier: input.tier,
      },
    },
  });

  if (!session.url) {
    throw new HttpError(
      "Stripe no devolvió URL de checkout.",
      502,
      "STRIPE_CHECKOUT_FAILED",
    );
  }
  return { url: session.url };
}

export async function createPortalSession(input: {
  userId: string;
}): Promise<{ url: string }> {
  const stripe = requireStripe();
  const customerId = await getBillingCustomer(input.userId);
  if (!customerId) {
    throw new HttpError(
      "No hay un cliente de Stripe para esta cuenta.",
      404,
      "STRIPE_CUSTOMER_MISSING",
    );
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${publicAppUrl()}/dashboard/general/billing`,
  });
  return { url: session.url };
}

export async function assignCurrentGuild(input: {
  userId: string;
  guildId: string;
}): Promise<void> {
  const sub = await getLatestSubscriptionForUser(input.userId);
  if (!sub || !isPaidSubscriptionStatus(sub.status) || !isPlanTier(sub.tier)) {
    throw new HttpError(
      "No tienes una suscripción activa.",
      400,
      "NO_ACTIVE_SUBSCRIPTION",
    );
  }
  const tier = paidTierOrPro(sub.tier);
  await assignGuildToSubscription({
    guildId: input.guildId,
    subscriptionId: sub.id,
    tier,
    userId: input.userId,
  });
}
