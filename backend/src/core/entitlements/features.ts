import type { FeatureKey, SystemCommandCategory } from "@adobos/shared";

/** Slash nativos → feature. Categorías del catálogo shared. */
const CATEGORY_FEATURE: Record<SystemCommandCategory, FeatureKey> = {
  moderation: "moderation",
  levels: "levels",
  economy: "economy",
  utilities: "utilities",
  forms: "forms",
  pokemon: "pokemon",
};

export function featureForCommandCategory(
  category: SystemCommandCategory,
): FeatureKey {
  return CATEGORY_FEATURE[category];
}
