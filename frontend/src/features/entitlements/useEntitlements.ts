import { useEffect, useState } from "react";
import type { FeatureKey, GuildEntitlements, LimitKey } from "@adobos/shared";
import { isUnlimited, TIER_CATALOG, tierHasFeature } from "@adobos/shared";
import { fetchEntitlements } from "@/lib/api";

export function useEntitlements(): {
  entitlements: GuildEntitlements | null;
  loading: boolean;
  can: (feature: FeatureKey) => boolean;
  limitOf: (key: LimitKey) => number;
  isUnlimited: (key: LimitKey) => boolean;
} {
  const [entitlements, setEntitlements] = useState<GuildEntitlements | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchEntitlements();
        if (!cancelled) setEntitlements(data);
      } catch {
        if (!cancelled) setEntitlements(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tier = entitlements?.tier ?? "free";
  return {
    entitlements,
    loading,
    can: (feature) =>
      entitlements
        ? entitlements.features.includes(feature)
        : tierHasFeature(tier, feature),
    limitOf: (key) =>
      entitlements?.limits[key] ?? TIER_CATALOG.free.limits[key],
    isUnlimited: (key) =>
      entitlements ? isUnlimited(entitlements.limits[key]) : false,
  };
}
