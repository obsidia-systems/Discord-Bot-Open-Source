import {
  entitlementsSnapshot,
  type FeatureKey,
  featureLockedMessage,
  isPlanTier,
  isUnlimited,
  type LimitKey,
  limitExceededMessage,
  type PlanTier,
  tierHasFeature,
  tierLimit,
} from "@adobos/shared";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "express";
import { getDb, one } from "../../db/client.js";
import { guildEntitlements } from "../../db/schema.js";
import { cache } from "../cache/store.js";
import { HttpError } from "../http/httpError.js";

const TIER_TTL_MS = 60_000;
const tierKey = (guildId: string) => `ent:tier:${guildId}`;

export class EntitlementError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: "FEATURE_LOCKED" | "LIMIT_EXCEEDED" | "SEATS_EXCEEDED",
    readonly feature?: FeatureKey,
    readonly limit?: LimitKey,
  ) {
    super(message);
    this.name = "EntitlementError";
  }
}

export function entitlementsOf(tier: PlanTier): {
  tier: PlanTier;
  can: (feature: FeatureKey) => boolean;
  limit: (key: LimitKey) => number;
} {
  return {
    tier,
    can: (feature) => tierHasFeature(tier, feature),
    limit: (key) => tierLimit(tier, key),
  };
}

export async function getGuildTier(guildId: string): Promise<PlanTier> {
  const cached = await cache().get<PlanTier>(tierKey(guildId));
  if (cached) return cached;

  const row = await one(
    getDb()
      .select({ tier: guildEntitlements.tier })
      .from(guildEntitlements)
      .where(eq(guildEntitlements.guildId, guildId))
      .limit(1),
  );

  const tier = isPlanTier(row?.tier) ? row.tier : "free";
  await cache().set(tierKey(guildId), tier, TIER_TTL_MS);
  return tier;
}

export async function can(
  guildId: string,
  feature: FeatureKey,
): Promise<boolean> {
  const tier = await getGuildTier(guildId);
  return tierHasFeature(tier, feature);
}

export async function limit(guildId: string, key: LimitKey): Promise<number> {
  const tier = await getGuildTier(guildId);
  return tierLimit(tier, key);
}

export async function getGuildEntitlements(guildId: string) {
  const tier = await getGuildTier(guildId);
  return entitlementsSnapshot(guildId, tier);
}

export function invalidateGuildEntitlement(guildId: string): void {
  // Fire-and-forget: con RedisStore (P2.16) esto además publica la invalidación
  // a las demás réplicas. Los callers ya son async si necesitan esperarla.
  void cache().del(tierKey(guildId));
}

export async function upsertGuildEntitlement(input: {
  guildId: string;
  tier: PlanTier;
  subscriptionId?: number | null;
}): Promise<void> {
  const now = new Date();
  await getDb()
    .insert(guildEntitlements)
    .values({
      guildId: input.guildId,
      tier: input.tier,
      subscriptionId: input.subscriptionId ?? null,
      assignedAt: now,
    })
    .onConflictDoUpdate({
      target: guildEntitlements.guildId,
      set: {
        tier: input.tier,
        subscriptionId: input.subscriptionId ?? null,
        assignedAt: now,
      },
    });
  invalidateGuildEntitlement(input.guildId);
}

export async function clearGuildEntitlement(guildId: string): Promise<void> {
  await getDb()
    .delete(guildEntitlements)
    .where(eq(guildEntitlements.guildId, guildId));
  invalidateGuildEntitlement(guildId);
}

export async function countSubscriptionSeats(
  subscriptionId: number,
): Promise<number> {
  const rows = await getDb()
    .select({ guildId: guildEntitlements.guildId })
    .from(guildEntitlements)
    .where(eq(guildEntitlements.subscriptionId, subscriptionId));
  return rows.length;
}

export async function getGuildEntitlementRow(guildId: string) {
  return one(
    getDb()
      .select()
      .from(guildEntitlements)
      .where(eq(guildEntitlements.guildId, guildId))
      .limit(1),
  );
}

export async function listGuildIdsForSubscription(
  subscriptionId: number,
): Promise<string[]> {
  const rows = await getDb()
    .select({ guildId: guildEntitlements.guildId })
    .from(guildEntitlements)
    .where(eq(guildEntitlements.subscriptionId, subscriptionId));
  return rows.map((row) => row.guildId);
}

export async function setTierForSubscriptionGuilds(
  subscriptionId: number,
  tier: PlanTier,
): Promise<void> {
  const ids = await listGuildIdsForSubscription(subscriptionId);
  if (ids.length === 0) return;
  await getDb()
    .update(guildEntitlements)
    .set({ tier })
    .where(eq(guildEntitlements.subscriptionId, subscriptionId));
  for (const id of ids) invalidateGuildEntitlement(id);
}

/** Plazas contra el plan de pago de la suscripción, no el tier actual del guild. */
export async function assertSeatsAvailable(
  subscriptionId: number,
  paidTier: PlanTier,
  guildId: string,
): Promise<void> {
  const max = tierLimit(paidTier, "coveredGuilds");
  if (isUnlimited(max)) return;
  const ids = await listGuildIdsForSubscription(subscriptionId);
  if (ids.includes(guildId)) return;
  if (ids.length >= max) {
    throw new EntitlementError(
      limitExceededMessage(paidTier, "coveredGuilds", max),
      403,
      "SEATS_EXCEEDED",
      undefined,
      "coveredGuilds",
    );
  }
}

export function requireFeature(feature: FeatureKey): RequestHandler {
  return (req, _res, next) => {
    const guild = req.guild;
    if (!guild) {
      next(
        new HttpError(
          "requireGuildAccess was not applied on this route.",
          500,
          "MISSING_GUILD_CONTEXT",
        ),
      );
      return;
    }
    if (!guild.can(feature)) {
      next(
        new EntitlementError(
          featureLockedMessage(guild.tier, feature),
          403,
          "FEATURE_LOCKED",
          feature,
        ),
      );
      return;
    }
    next();
  };
}

export async function assertFeature(
  guildId: string,
  feature: FeatureKey,
): Promise<void> {
  const tier = await getGuildTier(guildId);
  if (!tierHasFeature(tier, feature)) {
    throw new EntitlementError(
      featureLockedMessage(tier, feature),
      403,
      "FEATURE_LOCKED",
      feature,
    );
  }
}

export async function assertWithinLimit(
  guildId: string,
  key: LimitKey,
  used: number,
): Promise<void> {
  const tier = await getGuildTier(guildId);
  const max = tierLimit(tier, key);
  if (isUnlimited(max)) return;
  if (used >= max) {
    throw new EntitlementError(
      limitExceededMessage(tier, key, max),
      403,
      key === "coveredGuilds" ? "SEATS_EXCEEDED" : "LIMIT_EXCEEDED",
      undefined,
      key,
    );
  }
}

export function sendIfEntitlementError(
  error: unknown,
  res: { status: (code: number) => { json: (body: unknown) => void } },
): boolean {
  if (!(error instanceof EntitlementError)) return false;
  res.status(error.status).json({
    error: error.message,
    code: error.code,
    feature: error.feature,
    limit: error.limit,
  });
  return true;
}
