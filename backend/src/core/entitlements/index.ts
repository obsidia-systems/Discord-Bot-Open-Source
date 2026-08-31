export { featureForCommandCategory } from "./features.js";
export { entitlementsRoutes } from "./routes.js";
export {
  assertFeature,
  assertSeatsAvailable,
  assertWithinLimit,
  can,
  clearGuildEntitlement,
  countSubscriptionSeats,
  EntitlementError,
  entitlementsOf,
  getGuildEntitlementRow,
  getGuildEntitlements,
  getGuildTier,
  invalidateGuildEntitlement,
  limit,
  listGuildIdsForSubscription,
  requireFeature,
  sendIfEntitlementError,
  setTierForSubscriptionGuilds,
  upsertGuildEntitlement,
} from "./service.js";
