export {
  EntitlementError,
  assertFeature,
  assertWithinLimit,
  can,
  clearGuildEntitlement,
  countSubscriptionSeats,
  entitlementsOf,
  getGuildEntitlements,
  getGuildTier,
  invalidateGuildEntitlement,
  limit,
  requireFeature,
  sendIfEntitlementError,
  upsertGuildEntitlement,
} from "./service.js";
export { featureForCommandCategory } from "./features.js";
export { entitlementsRoutes } from "./routes.js";
