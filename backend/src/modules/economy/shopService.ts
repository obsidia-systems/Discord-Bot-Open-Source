import type {
  CreateEconomyShopItemRequest,
  EconomyShopItem,
  EconomyShopRewardConfig,
  EconomyShopRewardType,
  UpdateEconomyShopItemRequest,
} from "@adobos/shared";
import {
  clampNonNegInt,
  clampShopDurationMinutes,
  clampShopMultiplier,
  clampShopPrice,
  defaultShopRewardConfig,
  isEconomyShopRewardType,
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

function parseConfig(raw: string): EconomyShopRewardConfig {
  try {
    return JSON.parse(raw) as EconomyShopRewardConfig;
  } catch {
    return defaultShopRewardConfig("ROLE_ASSIGN");
  }
}

function rowToItem(
  row: typeof economyShopItems.$inferSelect,
): EconomyShopItem {
  return {
    id: row.id,
    guildId: row.guildId,
    name: row.name,
    description: row.description,
    price: row.price,
    icon: row.icon,
    stock: row.stock ?? null,
    rewardType: row.rewardType as EconomyShopRewardType,
    rewardConfig: parseConfig(row.rewardConfig),
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function sanitizeRewardConfig(
  type: EconomyShopRewardType,
  raw: unknown,
): EconomyShopRewardConfig {
  const base = defaultShopRewardConfig(type);
  if (!raw || typeof raw !== "object") return base;
  const cfg = raw as Record<string, unknown>;

  switch (type) {
    case "ROLE_ASSIGN":
      return {
        roleId: typeof cfg.roleId === "string" ? cfg.roleId.trim() : "",
      };
    case "CUSTOM_ROLE":
      return {
        forceHierarchyBase:
          typeof cfg.forceHierarchyBase === "boolean"
            ? cfg.forceHierarchyBase
            : true,
      };
    case "PRIVATE_CHANNEL":
      return {
        categoryId:
          typeof cfg.categoryId === "string" && cfg.categoryId.trim()
            ? cfg.categoryId.trim()
            : null,
      };
    case "MULTIPLIER_BOOST":
      return {
        module: cfg.module === "economy" ? "economy" : "xp",
        multiplier: clampShopMultiplier(Number(cfg.multiplier)),
        durationMinutes: clampShopDurationMinutes(Number(cfg.durationMinutes)),
      };
    case "MANUAL_FULFILLMENT":
      return {
        logChannelId:
          typeof cfg.logChannelId === "string" ? cfg.logChannelId.trim() : "",
        pingRoleId:
          typeof cfg.pingRoleId === "string" ? cfg.pingRoleId.trim() : "",
      };
  }
}

function validateRewardConfig(
  type: EconomyShopRewardType,
  config: EconomyShopRewardConfig,
): void {
  if (type === "ROLE_ASSIGN") {
    const c = config as { roleId?: string };
    if (!c.roleId) {
      throw new EconomyError(
        "Selecciona un rol para ROLE_ASSIGN.",
        400,
        "INVALID_REWARD_CONFIG",
      );
    }
  }
  if (type === "MANUAL_FULFILLMENT") {
    const c = config as { logChannelId?: string; pingRoleId?: string };
    if (!c.logChannelId || !c.pingRoleId) {
      throw new EconomyError(
        "Canje manual requiere canal de logs y rol a etiquetar.",
        400,
        "INVALID_REWARD_CONFIG",
      );
    }
  }
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

export function createShopItem(
  input: CreateEconomyShopItemRequest,
): EconomyShopItem {
  const guildId = resolveGuildId(input.guildId);
  ensureGuildRow(guildId);

  if (!isEconomyShopRewardType(input.rewardType)) {
    throw new EconomyError("Tipo de recompensa inválido.", 400, "INVALID_TYPE");
  }
  const name = (input.name ?? "").trim().slice(0, 100);
  if (!name) {
    throw new EconomyError("El nombre del ítem es obligatorio.", 400, "NO_NAME");
  }

  const rewardConfig = sanitizeRewardConfig(
    input.rewardType,
    input.rewardConfig,
  );
  validateRewardConfig(input.rewardType, rewardConfig);

  const now = new Date();
  const id = crypto.randomUUID();
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
      rewardType: input.rewardType,
      rewardConfig: JSON.stringify(rewardConfig),
      enabled: input.enabled !== false,
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

  const rewardType = isEconomyShopRewardType(input.rewardType)
    ? input.rewardType
    : current.rewardType;
  const rewardConfig = sanitizeRewardConfig(
    rewardType,
    input.rewardConfig ?? current.rewardConfig,
  );
  validateRewardConfig(rewardType, rewardConfig);

  const name =
    typeof input.name === "string"
      ? input.name.trim().slice(0, 100)
      : current.name;
  if (!name) {
    throw new EconomyError("El nombre del ítem es obligatorio.", 400, "NO_NAME");
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
      rewardType,
      rewardConfig: JSON.stringify(rewardConfig),
      enabled:
        typeof input.enabled === "boolean" ? input.enabled : current.enabled,
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

/** Decrementa stock si no es infinito. */
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
