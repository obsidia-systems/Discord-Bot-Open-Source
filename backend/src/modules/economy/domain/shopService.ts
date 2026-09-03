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
import { getDb, one } from "#db/client.js";
import { economyShopItems, guildSettings } from "#db/schema.js";
import { EconomyError } from "./economy.js";

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new EconomyError("Missing guildId.", 400, "MISSING_GUILD_ID");
  }
  return id;
}

async function ensureGuildRow(guildId: string): Promise<void> {
  const existing = await one(
    getDb()
      .select({ guildId: guildSettings.guildId })
      .from(guildSettings)
      .where(eq(guildSettings.guildId, guildId))
      .limit(1),
  );
  if (!existing) {
    await getDb().insert(guildSettings).values({
      guildId,
      prefix: "!",
      welcomeEnabled: false,
      updatedAt: new Date(),
    });
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
      rewards.boostConfig.module = cfg.module === "economy" ? "economy" : "xp";
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
      "Enable Role Assignment: select a role.",
      400,
      "INVALID_REWARDS",
    );
  }
  if (rewards.hasManual) {
    if (
      !rewards.manualConfig.logChannelId ||
      !rewards.manualConfig.pingRoleId
    ) {
      throw new EconomyError(
        "Manual Delivery: log channel and staff role are required.",
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
    throw new EconomyError("Enable at least one reward.", 400, "NO_REWARDS");
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

export async function listShopItems(
  guildId?: string,
  opts?: { enabledOnly?: boolean },
): Promise<EconomyShopItem[]> {
  const id = resolveGuildId(guildId);
  const rows = await getDb()
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
    .orderBy(asc(economyShopItems.sortOrder), asc(economyShopItems.name));
  return rows.map(rowToItem);
}

export async function getShopItem(
  itemId: string,
  guildId?: string,
): Promise<EconomyShopItem | null> {
  const id = resolveGuildId(guildId);
  const row = await one(
    getDb()
      .select()
      .from(economyShopItems)
      .where(
        and(eq(economyShopItems.id, itemId), eq(economyShopItems.guildId, id)),
      )
      .limit(1),
  );
  return row ? rowToItem(row) : null;
}

/** Nombres activos únicos (case-insensitive) por guild. */
async function assertUniqueActiveName(
  guildId: string,
  name: string,
  excludeItemId?: string,
): Promise<void> {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return;

  const clash = (await listShopItems(guildId, { enabledOnly: true })).find(
    (item) =>
      item.id !== excludeItemId &&
      item.name.trim().toLowerCase() === normalized,
  );
  if (clash) {
    throw new EconomyError(
      "An active item with this name already exists. Please choose another.",
      400,
      "DUPLICATE_NAME",
    );
  }
}

export async function createShopItem(
  input: CreateEconomyShopItemRequest,
): Promise<EconomyShopItem> {
  const guildId = resolveGuildId(input.guildId);
  await ensureGuildRow(guildId);

  const name = (input.name ?? "").trim().slice(0, 100);
  if (!name) {
    throw new EconomyError("The item name is required.", 400, "NO_NAME");
  }

  const rewards = sanitizeShopRewards(input.rewards);
  validateRewards(rewards);

  const enabled = input.enabled !== false;
  if (enabled) {
    await assertUniqueActiveName(guildId, name);
  }

  const now = new Date();
  const id = newId();
  const stock =
    input.stock === null || input.stock === undefined
      ? null
      : clampNonNegInt(Number(input.stock));

  await getDb()
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
    });

  const created = await getShopItem(id, guildId);
  if (!created) {
    throw new EconomyError("Couldn't create the item.", 500, "CREATE_FAILED");
  }
  return created;
}

export async function updateShopItem(
  itemId: string,
  input: UpdateEconomyShopItemRequest,
): Promise<EconomyShopItem> {
  const guildId = resolveGuildId(input.guildId);
  const current = await getShopItem(itemId, guildId);
  if (!current) {
    throw new EconomyError("Item not found.", 404, "NOT_FOUND");
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
    throw new EconomyError("The item name is required.", 400, "NO_NAME");
  }

  const enabled =
    typeof input.enabled === "boolean" ? input.enabled : current.enabled;
  if (enabled) {
    await assertUniqueActiveName(guildId, name, itemId);
  }

  let stock = current.stock;
  if (input.stock !== undefined) {
    stock = input.stock === null ? null : clampNonNegInt(Number(input.stock));
  }

  const now = new Date();
  await getDb()
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
    );

  const updated = await getShopItem(itemId, guildId);
  if (!updated) {
    throw new EconomyError("Couldn't update the item.", 500, "UPDATE_FAILED");
  }
  return updated;
}

export async function deleteShopItem(
  itemId: string,
  guildId?: string,
): Promise<void> {
  const id = resolveGuildId(guildId);
  const current = await getShopItem(itemId, id);
  if (!current) {
    throw new EconomyError("Item not found.", 404, "NOT_FOUND");
  }
  await getDb()
    .delete(economyShopItems)
    .where(
      and(eq(economyShopItems.id, itemId), eq(economyShopItems.guildId, id)),
    );
}

export async function decrementShopStock(
  itemId: string,
  guildId: string,
): Promise<void> {
  const row = await one(
    getDb()
      .select()
      .from(economyShopItems)
      .where(
        and(
          eq(economyShopItems.id, itemId),
          eq(economyShopItems.guildId, guildId),
        ),
      )
      .limit(1),
  );
  if (!row || row.stock === null) return;
  if (row.stock <= 0) {
    throw new EconomyError("Sin stock disponible.", 400, "OUT_OF_STOCK");
  }
  await getDb()
    .update(economyShopItems)
    .set({ stock: row.stock - 1, updatedAt: new Date() })
    .where(eq(economyShopItems.id, itemId));
}
