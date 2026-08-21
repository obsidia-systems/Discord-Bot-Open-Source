/** Tienda del servidor — ítems, compras y tipos de recompensa. */

import { clampNonNegInt } from "./economy.js";

export const ECONOMY_SHOP_REWARD_TYPES = [
  "ROLE_ASSIGN",
  "CUSTOM_ROLE",
  "PRIVATE_CHANNEL",
  "MULTIPLIER_BOOST",
  "MANUAL_FULFILLMENT",
] as const;

export type EconomyShopRewardType = (typeof ECONOMY_SHOP_REWARD_TYPES)[number];

export const ECONOMY_SHOP_REWARD_LABELS: Record<EconomyShopRewardType, string> =
  {
    ROLE_ASSIGN: "Asignar rol existente",
    CUSTOM_ROLE: "Crear rol personalizable",
    PRIVATE_CHANNEL: "Canal de texto privado",
    MULTIPLIER_BOOST: "Multiplicador temporal",
    MANUAL_FULFILLMENT: "Canje manual (staff)",
  };

export type EconomyShopMultiplierModule = "xp" | "economy";

export interface EconomyShopRewardConfigRoleAssign {
  roleId: string;
}

export interface EconomyShopRewardConfigCustomRole {
  /** Coloca el rol justo encima de @everyone. */
  forceHierarchyBase: boolean;
}

export interface EconomyShopRewardConfigPrivateChannel {
  /** Categoría opcional; si vacío se usa/crea «Zonas Privadas». */
  categoryId: string | null;
}

export interface EconomyShopRewardConfigMultiplier {
  module: EconomyShopMultiplierModule;
  /** Factor p. ej. 2 = x2. */
  multiplier: number;
  durationMinutes: number;
}

export interface EconomyShopRewardConfigManual {
  logChannelId: string;
  pingRoleId: string;
}

export type EconomyShopRewardConfig =
  | EconomyShopRewardConfigRoleAssign
  | EconomyShopRewardConfigCustomRole
  | EconomyShopRewardConfigPrivateChannel
  | EconomyShopRewardConfigMultiplier
  | EconomyShopRewardConfigManual;

export interface EconomyShopItem {
  id: string;
  guildId: string;
  name: string;
  description: string;
  price: number;
  /** Emoji unicode, mención Discord o URL/ruta de imagen. */
  icon: string;
  /** `null` = stock infinito. */
  stock: number | null;
  rewardType: EconomyShopRewardType;
  rewardConfig: EconomyShopRewardConfig;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface EconomyShopItemsResponse {
  items: EconomyShopItem[];
}

export interface EconomyShopItemResponse {
  item: EconomyShopItem;
}

export type CreateEconomyShopItemRequest = {
  name: string;
  description?: string;
  price: number;
  icon?: string;
  stock?: number | null;
  rewardType: EconomyShopRewardType;
  rewardConfig: EconomyShopRewardConfig;
  enabled?: boolean;
  sortOrder?: number;
  guildId?: string;
};

export type UpdateEconomyShopItemRequest = Partial<CreateEconomyShopItemRequest>;

export type EconomyPurchaseStatus =
  | "fulfilled"
  | "pending"
  | "failed"
  | "refunded";

export interface EconomyPurchase {
  id: string;
  guildId: string;
  userId: string;
  itemId: string;
  itemName: string;
  pricePaid: number;
  status: EconomyPurchaseStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export function defaultShopRewardConfig(
  type: EconomyShopRewardType,
): EconomyShopRewardConfig {
  switch (type) {
    case "ROLE_ASSIGN":
      return { roleId: "" };
    case "CUSTOM_ROLE":
      return { forceHierarchyBase: true };
    case "PRIVATE_CHANNEL":
      return { categoryId: null };
    case "MULTIPLIER_BOOST":
      return { module: "xp", multiplier: 2, durationMinutes: 60 };
    case "MANUAL_FULFILLMENT":
      return { logChannelId: "", pingRoleId: "" };
  }
}

export function defaultEconomyShopItemDraft(
  guildId = "",
): Omit<EconomyShopItem, "createdAt" | "updatedAt"> {
  return {
    id: "",
    guildId,
    name: "",
    description: "",
    price: 100,
    icon: "🛒",
    stock: null,
    rewardType: "ROLE_ASSIGN",
    rewardConfig: defaultShopRewardConfig("ROLE_ASSIGN"),
    enabled: true,
    sortOrder: 0,
  };
}

export function isEconomyShopRewardType(
  value: unknown,
): value is EconomyShopRewardType {
  return (
    typeof value === "string" &&
    (ECONOMY_SHOP_REWARD_TYPES as readonly string[]).includes(value)
  );
}

export function clampShopPrice(value: number): number {
  return Math.min(1_000_000_000, clampNonNegInt(value, 0));
}

export function clampShopMultiplier(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(100, Math.round(value * 100) / 100);
}

export function clampShopDurationMinutes(value: number): number {
  return Math.min(525_600, Math.max(1, clampNonNegInt(value, 60)));
}
