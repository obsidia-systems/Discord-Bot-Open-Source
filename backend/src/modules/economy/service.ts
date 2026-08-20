import type {
  AdjustEconomyFundsRequest,
  AdjustEconomyFundsResponse,
  EconomyConfig,
  UpdateEconomyConfigRequest,
} from "@adobos/shared";
import {
  clampStartBalance,
  clampTransferTax,
  defaultEconomyConfig,
} from "@adobos/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import {
  economyConfig,
  guildSettings,
  userEconomy,
} from "../../db/schema.js";

export class EconomyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "EconomyError";
  }
}

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

function rowToConfig(
  guildId: string,
  row: typeof economyConfig.$inferSelect | undefined,
): EconomyConfig {
  if (!row) return defaultEconomyConfig(guildId);
  return {
    guildId: row.guildId,
    isActive: row.isActive,
    currencyName: row.currencyName,
    currencySymbol: row.currencySymbol,
    startBalance: row.startBalance,
    transferTax: row.transferTax,
  };
}

export function getEconomyConfig(guildId?: string): EconomyConfig {
  const id = resolveGuildId(guildId);
  const row = getDb()
    .select()
    .from(economyConfig)
    .where(eq(economyConfig.guildId, id))
    .get();
  return rowToConfig(id, row);
}

export function updateEconomyConfig(
  input: UpdateEconomyConfigRequest,
): EconomyConfig {
  const id = resolveGuildId(input.guildId);
  ensureGuildRow(id);
  const current = getEconomyConfig(id);

  const next: EconomyConfig = {
    guildId: id,
    isActive:
      typeof input.isActive === "boolean" ? input.isActive : current.isActive,
    currencyName:
      typeof input.currencyName === "string" && input.currencyName.trim()
        ? input.currencyName.trim().slice(0, 64)
        : current.currencyName,
    currencySymbol:
      typeof input.currencySymbol === "string" && input.currencySymbol.trim()
        ? input.currencySymbol.trim().slice(0, 64)
        : current.currencySymbol,
    startBalance:
      typeof input.startBalance === "number"
        ? clampStartBalance(input.startBalance)
        : current.startBalance,
    transferTax:
      typeof input.transferTax === "number"
        ? clampTransferTax(input.transferTax)
        : current.transferTax,
  };

  const now = new Date();
  getDb()
    .insert(economyConfig)
    .values({
      guildId: id,
      isActive: next.isActive,
      currencyName: next.currencyName,
      currencySymbol: next.currencySymbol,
      startBalance: next.startBalance,
      transferTax: next.transferTax,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: economyConfig.guildId,
      set: {
        isActive: next.isActive,
        currencyName: next.currencyName,
        currencySymbol: next.currencySymbol,
        startBalance: next.startBalance,
        transferTax: next.transferTax,
        updatedAt: now,
      },
    })
    .run();

  return next;
}

export function listEconomyLeaderboardRows(
  guildId: string,
  limit = 100,
): Array<{
  rank: number;
  userId: string;
  wallet: number;
  bank: number;
  total: number;
}> {
  const id = resolveGuildId(guildId);
  const rows = getDb()
    .select({
      userId: userEconomy.userId,
      wallet: userEconomy.wallet,
      bank: userEconomy.bank,
      total: sql<number>`(${userEconomy.wallet} + ${userEconomy.bank})`.as(
        "total",
      ),
    })
    .from(userEconomy)
    .where(eq(userEconomy.guildId, id))
    .orderBy(desc(sql`(${userEconomy.wallet} + ${userEconomy.bank})`))
    .limit(Math.min(Math.max(limit, 1), 100))
    .all();

  return rows.map((row, i) => ({
    rank: i + 1,
    userId: row.userId,
    wallet: row.wallet,
    bank: row.bank,
    total: Number(row.total) || row.wallet + row.bank,
  }));
}

export function getEconomyLeaderboardTotal(guildId?: string): number {
  const id = resolveGuildId(guildId);
  const row = getDb()
    .select({ count: sql<number>`count(*)` })
    .from(userEconomy)
    .where(eq(userEconomy.guildId, id))
    .get();
  return Number(row?.count ?? 0);
}

function getOrCreateUserEconomy(
  guildId: string,
  userId: string,
): { wallet: number; bank: number } {
  const existing = getDb()
    .select()
    .from(userEconomy)
    .where(
      and(eq(userEconomy.guildId, guildId), eq(userEconomy.userId, userId)),
    )
    .get();
  if (existing) {
    return { wallet: existing.wallet, bank: existing.bank };
  }

  const config = getEconomyConfig(guildId);
  const wallet = config.startBalance;
  const now = new Date();
  getDb()
    .insert(userEconomy)
    .values({
      guildId,
      userId,
      wallet,
      bank: 0,
      updatedAt: now,
    })
    .run();
  return { wallet, bank: 0 };
}

export function adjustEconomyFunds(
  input: AdjustEconomyFundsRequest,
): AdjustEconomyFundsResponse {
  const id = resolveGuildId(input.guildId);
  ensureGuildRow(id);

  const userId = (input.userId ?? "").trim();
  if (!/^\d{17,20}$/.test(userId)) {
    throw new EconomyError("userId inválido.", 400, "INVALID_USER_ID");
  }

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new EconomyError(
      "La cantidad debe ser un número ≥ 0.",
      400,
      "INVALID_AMOUNT",
    );
  }
  const qty = Math.floor(amount);

  if (input.target !== "wallet" && input.target !== "bank") {
    throw new EconomyError("target inválido.", 400, "INVALID_TARGET");
  }
  if (
    input.action !== "add" &&
    input.action !== "remove" &&
    input.action !== "set"
  ) {
    throw new EconomyError("action inválida.", 400, "INVALID_ACTION");
  }

  const current = getOrCreateUserEconomy(id, userId);
  let wallet = current.wallet;
  let bank = current.bank;

  const apply = (value: number): number => {
    if (input.action === "set") return qty;
    if (input.action === "add") return value + qty;
    return Math.max(0, value - qty);
  };

  if (input.target === "wallet") wallet = apply(wallet);
  else bank = apply(bank);

  const now = new Date();
  getDb()
    .insert(userEconomy)
    .values({
      guildId: id,
      userId,
      wallet,
      bank,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userEconomy.guildId, userEconomy.userId],
      set: { wallet, bank, updatedAt: now },
    })
    .run();

  return {
    ok: true,
    userId,
    wallet,
    bank,
    total: wallet + bank,
  };
}
