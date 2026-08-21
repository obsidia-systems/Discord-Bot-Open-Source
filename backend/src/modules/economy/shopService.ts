import type {
  CreateEconomyShopItemRequest,
  EconomyShopItem,
  EconomyShopRewards,
  UpdateEconomyShopItemRequest,
} from "@adobos/shared";
import {
  clampNonNegInt,
  clampShopMultiplier,
  clampShopPrice,
  defaultShopRewards,
  rewardsFromActionSequence,
} from "@adobos/shared";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { economyShopItems, guildSettings } from "../../db/schema.js";
import { EconomyError } from "./service.js";

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? process.env.DISCORD_GUILD_ID ?? "").trim();
  if (!id) {
    throw new EconomyError(
      "Falta DISCORD_GUILD_ID (o guildId).",
      400,
      "MISSING_GUILD_ID",
    );
  }
  return id;
}

function ensureGuildRow(guildId: string): void {
  const existing = getDb()
    .select({ guildId: guildSettings.guildId })
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId))
    .get();
  if (!existing) {
    getDb()
      .insert(guildSettings)
      .values({
        guildId,
        prefix: "!",
        welcomeEnabled: false,
        updatedAt: new Date(),
      })
      .run();
  }
}

function newId(): string {
  return crypto.randomUUID();
}

function legacySingleToRewards(
  rewardType: string | null | undefined,
  rewardConfigRaw: string | null | undefined,
): EconomyShopRewards {
  const rewards = defaultShopRewards();
  if (!rewardType) return rewards;
  let cfg: Record<string, unknown> = {};
  try {
    cfg = rewardConfigRaw
      ? (JSON.parse(rewardConfigRaw) as Record<string, unknown>)
      : {};
  } catch {
    cfg = {};
  }

  switch (rewardType) {
    case "ROLE_ASSIGN":
      rewards.hasRole = true;
      rewards.roleConfig.roleId =
        typeof cfg.roleId === "string" ? cfg.roleId : "";
      break;
    case "CUSTOM_ROLE":
      rewards.hasRole = true;
      break;
    case "PRIVATE_CHANNEL":
      rewards.hasChannel = true;
      rewards.channelConfig.categoryId =
        typeof cfg.categoryId === "string" ? cfg.categoryId : null;
      break;
    case "MULTIPLIER_BOOST":
      rewards.hasBoost = true;
      rewards.boostConfig.module =
        cfg.module === "economy" ? "economy" : "xp";
      rewards.boostConfig.multiplier = clampShopMultiplier(
        Number(cfg.multiplier ?? 2),
      );
      break;
    case "MANUAL_FULFILLMENT":
      rewards.hasManual = true;
      rewards.manualConfig.logChannelId =
        typeof cfg.logChannelId === "string" ? cfg.logChannelId : "";
      rewards.manualConfig.pingRoleId =
        typeof cfg.pingRoleId === "string" ? cfg.pingRoleId : "";
      break;
  }
  return rewards;
}

export function sanitizeShopRewards(raw: unknown): EconomyShopRewards {
  const base = defaultShopRewards();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const row = raw as Record<string, unknown>;

  const roleCfg =
    row.roleConfig && typeof row.roleConfig === "object"
      ? (row.roleConfig as Record<string, unknown>)
      : {};
  const channelCfg =
    row.channelConfig && typeof row.channelConfig === "object"
      ? (row.channelConfig as Record<string, unknown>)
      : {};
  const boostCfg =
    row.boostConfig && typeof row.boostConfig === "object"
      ? (row.boostConfig as Record<string, unknown>)
      : {};
  const manualCfg =
    row.manualConfig && typeof row.manualConfig === "object"
      ? (row.manualConfig as Record<string, unknown>)
      : {};

  return {
    hasRole: Boolean(row.hasRole),
    roleConfig: {
      roleId: typeof roleCfg.roleId === "string" ? roleCfg.roleId.trim() : "",
      temporary: Boolean(roleCfg.temporary),
      durationValue: Math.max(
        1,
        clampNonNegInt(Number(roleCfg.durationValue), 24),
      ),
      durationUnit: roleCfg.durationUnit === "days" ? "days" : "hours",
    },
    hasChannel: Boolean(row.hasChannel),
    channelConfig: {
      nameTemplate:
        typeof channelCfg.nameTemplate === "string" &&
        channelCfg.nameTemplate.trim()
          ? channelCfg.nameTemplate.trim().slice(0, 100)
          : "privado-{username}",
      categoryId:
        typeof channelCfg.categoryId === "string" &&
        channelCfg.categoryId.trim()
          ? channelCfg.categoryId.trim()
          : null,
      temporary: Boolean(channelCfg.temporary),
      durationValue: Math.max(
        1,
        clampNonNegInt(Number(channelCfg.durationValue), 24),
      ),
      durationUnit: channelCfg.durationUnit === "days" ? "days" : "hours",
    },
    hasBoost: Boolean(row.hasBoost),
    boostConfig: {
      module: boostCfg.module === "economy" ? "economy" : "xp",
      multiplier: clampShopMultiplier(Number(boostCfg.multiplier ?? 2)),
      temporary: boostCfg.temporary !== false,
      durationValue: Math.max(
        1,
        clampNonNegInt(Number(boostCfg.durationValue), 24),
      ),
      durationUnit: boostCfg.durationUnit === "days" ? "days" : "hours",
    },
    hasManual: Boolean(row.hasManual),
    manualConfig: {
      staffInstructions:
        typeof manualCfg.staffInstructions === "string"
          ? manualCfg.staffInstructions.trim().slice(0, 1000)
          : "",
      logChannelId:
        typeof manualCfg.logChannelId === "string"
          ? manualCfg.logChannelId.trim()
          : "",
      pingRoleId:
        typeof manualCfg.pingRoleId === "string"
          ? manualCfg.pingRoleId.trim()
          : "",
    },
  };
}

function validateRewards(rewards: EconomyShopRewards): void {
  if (rewards.hasRole && !rewards.roleConfig.roleId) {
    throw new EconomyError(
      "Activa Asignación de Rol: selecciona un rol.",
      400,
      "INVALID_REWARDS",
    );
  }
  if (rewards.hasManual) {
    if (!rewards.manualConfig.logChannelId || !rewards.manualConfig.pingRoleId) {
      throw new EconomyError(
        "Entrega Manual: canal de logs y rol de staff son obligatorios.",
        400,
        "INVALID_REWARDS",
      );
    }
  }
  const any =
    rewards.hasRole ||
    rewards.hasChannel ||
    rewards.hasBoost ||
    rewards.hasManual;
  if (!any) {
    throw new EconomyError(
      "Activa al menos una recompensa.",
      400,
      "NO_REWARDS",
    );
  }
}

function parseRewards(
  row: typeof economyShopItems.$inferSelect,
): EconomyShopRewards {
  try {
    const parsed = JSON.parse(row.rewards || "{}") as unknown;
    const rewards = sanitizeShopRewards(parsed);
    if (
      rewards.hasRole ||
      rewards.hasChannel ||
      rewards.hasBoost ||
      rewards.hasManual
    ) {
      return rewards;
    }
  } catch {
    /* fallthrough */
  }

  try {
    const seq = JSON.parse(row.actionSequence || "[]") as unknown;
    if (Array.isArray(seq) && seq.length > 0) {
      return sanitizeShopRewards(rewardsFromActionSequence(seq));
    }
  } catch {
    /* fallthrough */
  }

  return legacySingleToRewards(row.rewardType, row.rewardConfig);
}

function rowToItem(row: typeof economyShopItems.$inferSelect): EconomyShopItem {
  return {
    id: row.id,
    guildId: row.guildId,
    name: row.name,
    description: row.description,
    price: row.price,
    icon: row.icon,
    stock: row.stock ?? null,
    rewards: parseRewards(row),
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export function listShopItems(
  guildId?: string,
  opts?: { enabledOnly?: boolean },
): EconomyShopItem[] {
  const id = resolveGuildId(guildId);
  const rows = getDb()
    .select()
    .from(economyShopItems)
    .where(
      opts?.enabledOnly
        ? and(
            eq(economyShopItems.guildId, id),
            eq(economyShopItems.enabled, true),
          )
        : eq(economyShopItems.guildId, id),
    )
    .orderBy(asc(economyShopItems.sortOrder), asc(economyShopItems.name))
    .all();
  return rows.map(rowToItem);
}

export function getShopItem(
  itemId: string,
  guildId?: string,
): EconomyShopItem | null {
  const id = resolveGuildId(guildId);
  const row = getDb()
    .select()
    .from(economyShopItems)
    .where(
      and(eq(economyShopItems.id, itemId), eq(economyShopItems.guildId, id)),
    )
    .get();
  return row ? rowToItem(row) : null;
}

/** Nombres activos únicos (case-insensitive) por guild. */
function assertUniqueActiveName(
  guildId: string,
  name: string,
  excludeItemId?: string,
): void {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return;

  const clash = listShopItems(guildId, { enabledOnly: true }).find(
    (item) =>
      item.id !== excludeItemId &&
      item.name.trim().toLowerCase() === normalized,
  );
  if (clash) {
    throw new EconomyError(
      "Ya existe un ítem activo con este nombre. Por favor, elige otro.",
      400,
      "DUPLICATE_NAME",
    );
  }
}

export function createShopItem(
  input: CreateEconomyShopItemRequest,
): EconomyShopItem {
  const guildId = resolveGuildId(input.guildId);
  ensureGuildRow(guildId);

  const name = (input.name ?? "").trim().slice(0, 100);
  if (!name) {
    throw new EconomyError("El nombre del ítem es obligatorio.", 400, "NO_NAME");
  }

  const rewards = sanitizeShopRewards(input.rewards);
  validateRewards(rewards);

  const enabled = input.enabled !== false;
  if (enabled) {
    assertUniqueActiveName(guildId, name);
  }

  const now = new Date();
  const id = newId();
  const stock =
    input.stock === null || input.stock === undefined
      ? null
      : clampNonNegInt(Number(input.stock));

  getDb()
    .insert(economyShopItems)
    .values({
      id,
      guildId,
      name,
      description: (input.description ?? "").trim().slice(0, 1000),
      price: clampShopPrice(Number(input.price)),
      icon: (input.icon ?? "🛒").trim().slice(0, 512) || "🛒",
      stock,
      rewards: JSON.stringify(rewards),
      actionSequence: "[]",
      rewardType: null,
      rewardConfig: "{}",
      enabled,
      sortOrder: clampNonNegInt(Number(input.sortOrder ?? 0)),
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const created = getShopItem(id, guildId);
  if (!created) {
    throw new EconomyError("No se pudo crear el ítem.", 500, "CREATE_FAILED");
  }
  return created;
}

export function updateShopItem(
  itemId: string,
  input: UpdateEconomyShopItemRequest,
): EconomyShopItem {
  const guildId = resolveGuildId(input.guildId);
  const current = getShopItem(itemId, guildId);
  if (!current) {
    throw new EconomyError("Ítem no encontrado.", 404, "NOT_FOUND");
  }

  const rewards =
    input.rewards !== undefined
      ? sanitizeShopRewards(input.rewards)
      : current.rewards;
  validateRewards(rewards);

  const name =
    typeof input.name === "string"
      ? input.name.trim().slice(0, 100)
      : current.name;
  if (!name) {
    throw new EconomyError("El nombre del ítem es obligatorio.", 400, "NO_NAME");
  }

  const enabled =
    typeof input.enabled === "boolean" ? input.enabled : current.enabled;
  if (enabled) {
    assertUniqueActiveName(guildId, name, itemId);
  }

  let stock = current.stock;
  if (input.stock !== undefined) {
    stock =
      input.stock === null ? null : clampNonNegInt(Number(input.stock));
  }

  const now = new Date();
  getDb()
    .update(economyShopItems)
    .set({
      name,
      description:
        typeof input.description === "string"
          ? input.description.trim().slice(0, 1000)
          : current.description,
      price:
        typeof input.price === "number"
          ? clampShopPrice(input.price)
          : current.price,
      icon:
        typeof input.icon === "string"
          ? input.icon.trim().slice(0, 512) || "🛒"
          : current.icon,
      stock,
      rewards: JSON.stringify(rewards),
      actionSequence: "[]",
      rewardType: null,
      rewardConfig: "{}",
      enabled,
      sortOrder:
        typeof input.sortOrder === "number"
          ? clampNonNegInt(input.sortOrder)
          : current.sortOrder,
      updatedAt: now,
    })
    .where(
      and(
        eq(economyShopItems.id, itemId),
        eq(economyShopItems.guildId, guildId),
      ),
    )
    .run();

  const updated = getShopItem(itemId, guildId);
  if (!updated) {
    throw new EconomyError("No se pudo actualizar el ítem.", 500, "UPDATE_FAILED");
  }
  return updated;
}

export function deleteShopItem(itemId: string, guildId?: string): void {
  const id = resolveGuildId(guildId);
  const current = getShopItem(itemId, id);
  if (!current) {
    throw new EconomyError("Ítem no encontrado.", 404, "NOT_FOUND");
  }
  getDb()
    .delete(economyShopItems)
    .where(
      and(eq(economyShopItems.id, itemId), eq(economyShopItems.guildId, id)),
    )
    .run();
}

export function decrementShopStock(itemId: string, guildId: string): void {
  const row = getDb()
    .select()
    .from(economyShopItems)
    .where(
      and(
        eq(economyShopItems.id, itemId),
        eq(economyShopItems.guildId, guildId),
      ),
    )
    .get();
  if (!row || row.stock === null) return;
  if (row.stock <= 0) {
    throw new EconomyError("Sin stock disponible.", 400, "OUT_OF_STOCK");
  }
  getDb()
    .update(economyShopItems)
    .set({ stock: row.stock - 1, updatedAt: new Date() })
    .where(eq(economyShopItems.id, itemId))
    .run();
}
