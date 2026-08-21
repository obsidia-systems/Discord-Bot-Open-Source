/** Tienda del servidor — ítems con Smart Toggles de recompensas. */

import { clampNonNegInt } from "./economy.js";

export type EconomyShopBoostModule = "xp" | "economy";
export type EconomyShopDurationUnit = "hours" | "days";

export interface EconomyShopRoleRewardConfig {
  roleId: string;
  temporary: boolean;
  durationValue: number;
  durationUnit: EconomyShopDurationUnit;
}

export interface EconomyShopChannelRewardConfig {
  /** Soporta `{username}`, `{displayname}`, `{userid}`. */
  nameTemplate: string;
  /** Categoría donde se crea el canal (null = «Zonas Privadas» auto). */
  categoryId: string | null;
  temporary: boolean;
  durationValue: number;
  durationUnit: EconomyShopDurationUnit;
}

export interface EconomyShopBoostRewardConfig {
  module: EconomyShopBoostModule;
  multiplier: number;
  temporary: boolean;
  durationValue: number;
  durationUnit: EconomyShopDurationUnit;
}

export interface EconomyShopManualRewardConfig {
  staffInstructions: string;
  logChannelId: string;
  pingRoleId: string;
}

/** Estado de recompensas del ítem (Smart Toggles). */
export interface EconomyShopRewards {
  hasRole: boolean;
  roleConfig: EconomyShopRoleRewardConfig;
  hasChannel: boolean;
  channelConfig: EconomyShopChannelRewardConfig;
  hasBoost: boolean;
  boostConfig: EconomyShopBoostRewardConfig;
  hasManual: boolean;
  manualConfig: EconomyShopManualRewardConfig;
}

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
  rewards: EconomyShopRewards;
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
  rewards: EconomyShopRewards;
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

export function durationToMinutes(
  value: number,
  unit: EconomyShopDurationUnit,
): number {
  const v = Math.max(1, clampNonNegInt(value, 1));
  return unit === "days" ? v * 24 * 60 : v * 60;
}

export function defaultShopRewards(): EconomyShopRewards {
  return {
    hasRole: false,
    roleConfig: {
      roleId: "",
      temporary: false,
      durationValue: 24,
      durationUnit: "hours",
    },
    hasChannel: false,
    channelConfig: {
      nameTemplate: "privado-{username}",
      categoryId: null,
      temporary: false,
      durationValue: 24,
      durationUnit: "hours",
    },
    hasBoost: false,
    boostConfig: {
      module: "xp",
      multiplier: 2,
      temporary: true,
      durationValue: 24,
      durationUnit: "hours",
    },
    hasManual: false,
    manualConfig: {
      staffInstructions: "",
      logChannelId: "",
      pingRoleId: "",
    },
  };
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
    rewards: defaultShopRewards(),
    enabled: true,
    sortOrder: 0,
  };
}

export function clampShopPrice(value: number): number {
  return Math.min(1_000_000_000, clampNonNegInt(value, 0));
}

export function clampShopMultiplier(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(100, Math.round(value * 100) / 100);
}

/** Resumen de beneficios activos para preview /shop. */
export function summarizeShopRewards(rewards: EconomyShopRewards): string[] {
  const lines: string[] = [];
  if (rewards.hasRole) {
    lines.push(
      rewards.roleConfig.temporary ? "Rol temporal" : "Asignación de rol",
    );
  }
  if (rewards.hasChannel) {
    lines.push(
      rewards.channelConfig.temporary
        ? "Canal privado temporal"
        : "Canal privado",
    );
  }
  if (rewards.hasBoost) {
    const mod = rewards.boostConfig.module === "xp" ? "XP" : "Economía";
    const label = `Multiplicador x${rewards.boostConfig.multiplier} (${mod})`;
    lines.push(
      rewards.boostConfig.temporary ? `${label} · temporal` : label,
    );
  }
  if (rewards.hasManual) {
    lines.push("Entrega manual (staff)");
  }
  return lines;
}

export function applyShopNameTemplate(
  template: string,
  vars: { username: string; displayname: string; userid: string },
): string {
  return template
    .replaceAll("{username}", vars.username)
    .replaceAll("{displayname}", vars.displayname)
    .replaceAll("{userid}", vars.userid)
    .slice(0, 100);
}

/**
 * Migra un arreglo legacy `actionSequence` al objeto `rewards`.
 * @deprecated Solo para lectura de datos antiguos.
 */
export function rewardsFromActionSequence(raw: unknown): EconomyShopRewards {
  const rewards = defaultShopRewards();
  if (!Array.isArray(raw)) return rewards;

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    switch (row.type) {
      case "ROLE_ACTION": {
        rewards.hasRole = true;
        rewards.roleConfig = {
          roleId: typeof row.roleId === "string" ? row.roleId : "",
          temporary: Boolean(row.temporary),
          durationValue: Math.max(
            1,
            clampNonNegInt(Number(row.durationValue), 24),
          ),
          durationUnit: row.durationUnit === "days" ? "days" : "hours",
        };
        break;
      }
      case "CHANNEL_ACTION": {
        rewards.hasChannel = true;
        rewards.channelConfig = {
          nameTemplate:
            typeof row.nameTemplate === "string" && row.nameTemplate.trim()
              ? row.nameTemplate.trim()
              : "privado-{username}",
          categoryId:
            typeof row.parentCategoryId === "string"
              ? row.parentCategoryId
              : null,
          temporary: Boolean(row.temporary),
          durationValue: Math.max(
            1,
            clampNonNegInt(Number(row.durationValue), 24),
          ),
          durationUnit: row.durationUnit === "days" ? "days" : "hours",
        };
        break;
      }
      case "BOOST_ACTION": {
        rewards.hasBoost = true;
        rewards.boostConfig = {
          module: row.module === "economy" ? "economy" : "xp",
          multiplier: clampShopMultiplier(Number(row.multiplier ?? 2)),
          temporary: row.temporary !== false,
          durationValue: Math.max(
            1,
            clampNonNegInt(Number(row.durationValue), 24),
          ),
          durationUnit: row.durationUnit === "days" ? "days" : "hours",
        };
        break;
      }
      case "MANUAL_TICKET": {
        rewards.hasManual = true;
        rewards.manualConfig = {
          staffInstructions:
            typeof row.staffInstructions === "string"
              ? row.staffInstructions
              : "",
          logChannelId:
            typeof row.logChannelId === "string" ? row.logChannelId : "",
          pingRoleId: typeof row.pingRoleId === "string" ? row.pingRoleId : "",
        };
        break;
      }
    }
  }
  return rewards;
}
