/** Catálogo de planes. Fuente de verdad de features y límites (Fase 3 / 0.7). */

export type PlanTier = "free" | "pro" | "business";

export const PLAN_TIERS = ["free", "pro", "business"] as const;

export const PLAN_TIER_LABEL: Record<PlanTier, string> = {
  free: "Gratis",
  pro: "Pro",
  business: "Business",
};

/** -1 = sin tope numérico (JSON no admite Infinity). */
export const UNLIMITED = -1;

export type FeatureKey =
  | "welcome"
  | "messages"
  | "autoroles"
  | "economy"
  | "moderation"
  | "logs"
  | "automod"
  | "auto-delete"
  | "forms"
  | "scheduled-messages"
  | "custom-commands"
  | "system-commands"
  | "levels"
  | "roles-builder"
  | "utilities"
  | "tickets"
  | "giveaways"
  | "analytics"
  | "exports"
  | "antinuke"
  | "branding"
  | "backups"
  | "outbound-webhooks"
  | "public-api"
  | "panel-audit"
  | "staff-roles";

export type LimitKey =
  | "logRetentionDays"
  | "streamAlerts"
  | "scheduledMessages"
  | "customCommands"
  | "storageMb"
  | "coveredGuilds";

export interface TierLimits {
  logRetentionDays: number;
  streamAlerts: number;
  scheduledMessages: number;
  customCommands: number;
  storageMb: number;
  coveredGuilds: number;
}

export interface TierDefinition {
  features: readonly FeatureKey[];
  limits: TierLimits;
}

const FREE_FEATURES: readonly FeatureKey[] = [
  "welcome",
  "messages",
  "autoroles",
  "economy",
  "moderation",
  "logs",
  "automod",
  "auto-delete",
  "forms",
  "scheduled-messages",
  "custom-commands",
  "system-commands",
  "levels",
  "roles-builder",
  "utilities",
  "tickets",
  "giveaways",
];

const PRO_FEATURES: readonly FeatureKey[] = [
  ...FREE_FEATURES,
  "analytics",
  "exports",
  "antinuke",
  "branding",
  "backups",
];

const BUSINESS_FEATURES: readonly FeatureKey[] = [
  ...PRO_FEATURES,
  "outbound-webhooks",
  "public-api",
  "panel-audit",
  "staff-roles",
];

export const TIER_CATALOG: Record<PlanTier, TierDefinition> = {
  free: {
    features: FREE_FEATURES,
    limits: {
      logRetentionDays: 14,
      streamAlerts: 2,
      scheduledMessages: 25,
      customCommands: 25,
      storageMb: 100,
      coveredGuilds: 3,
    },
  },
  pro: {
    features: PRO_FEATURES,
    limits: {
      logRetentionDays: 90,
      streamAlerts: UNLIMITED,
      scheduledMessages: 500,
      customCommands: 100,
      storageMb: 2048,
      coveredGuilds: 3,
    },
  },
  business: {
    features: BUSINESS_FEATURES,
    limits: {
      logRetentionDays: 365,
      streamAlerts: UNLIMITED,
      scheduledMessages: UNLIMITED,
      customCommands: 100,
      storageMb: 10240,
      coveredGuilds: UNLIMITED,
    },
  },
};

export interface GuildEntitlements {
  guildId: string;
  tier: PlanTier;
  features: FeatureKey[];
  limits: TierLimits;
}

export function isPlanTier(value: unknown): value is PlanTier {
  return value === "free" || value === "pro" || value === "business";
}

export function isUnlimited(value: number): boolean {
  return value < 0;
}

export function tierHasFeature(tier: PlanTier, feature: FeatureKey): boolean {
  return TIER_CATALOG[tier].features.includes(feature);
}

export function tierLimit(tier: PlanTier, key: LimitKey): number {
  return TIER_CATALOG[tier].limits[key];
}

export function minTierForFeature(feature: FeatureKey): PlanTier {
  for (const tier of PLAN_TIERS) {
    if (tierHasFeature(tier, feature)) return tier;
  }
  return "business";
}

export function entitlementsSnapshot(
  guildId: string,
  tier: PlanTier,
): GuildEntitlements {
  const def = TIER_CATALOG[tier];
  return {
    guildId,
    tier,
    features: [...def.features],
    limits: { ...def.limits },
  };
}

export function featureLockedMessage(
  tier: PlanTier,
  feature: FeatureKey,
): string {
  const needed = PLAN_TIER_LABEL[minTierForFeature(feature)];
  const current = PLAN_TIER_LABEL[tier];
  return `Esta función requiere el plan ${needed}. Este servidor está en ${current}.`;
}

export function limitExceededMessage(
  tier: PlanTier,
  key: LimitKey,
  max: number,
): string {
  const current = PLAN_TIER_LABEL[tier];
  if (key === "scheduledMessages") {
    return `Has alcanzado el límite de ${max} mensajes programados del plan ${current}.`;
  }
  if (key === "customCommands") {
    return `Has alcanzado el límite de ${max} Custom Commands del plan ${current}.`;
  }
  if (key === "logRetentionDays") {
    return `El plan ${current} conserva logs hasta ${max} días.`;
  }
  if (key === "coveredGuilds") {
    return `El plan ${current} cubre como máximo ${max} servidores.`;
  }
  return `Has alcanzado un límite del plan ${current}.`;
}
