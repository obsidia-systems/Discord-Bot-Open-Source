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
        ? // Unicode, `<:name:id>` o ruta `/uploads/...` (imagen de moneda).
          input.currencySymbol.trim().slice(0, 512)
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
): {
  wallet: number;
  bank: number;
  dailyStreak: number;
  lastDailyAt: Date | null;
} {
  const existing = getDb()
    .select()
    .from(userEconomy)
    .where(
      and(eq(userEconomy.guildId, guildId), eq(userEconomy.userId, userId)),
    )
    .get();
  if (existing) {
    return {
      wallet: existing.wallet,
      bank: existing.bank,
      dailyStreak: existing.dailyStreak ?? 0,
      lastDailyAt: existing.lastDailyAt ?? null,
    };
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
      dailyStreak: 0,
      lastDailyAt: null,
      updatedAt: now,
    })
    .run();
  return { wallet, bank: 0, dailyStreak: 0, lastDailyAt: null };
}

export function getUserEconomyBalance(
  guildId: string,
  userId: string,
): { wallet: number; bank: number; total: number } {
  const row = getOrCreateUserEconomy(guildId, userId);
  return {
    wallet: row.wallet,
    bank: row.bank,
    total: row.wallet + row.bank,
  };
}

/** Suma a la cartera (nunca negativo). */
export function creditWallet(
  guildId: string,
  userId: string,
  amount: number,
): { wallet: number; bank: number } {
  const qty = Math.max(0, Math.floor(amount));
  const current = getOrCreateUserEconomy(guildId, userId);
  const wallet = current.wallet + qty;
  const bank = current.bank;
  const now = new Date();
  getDb()
    .insert(userEconomy)
    .values({
      guildId,
      userId,
      wallet,
      bank,
      dailyStreak: current.dailyStreak,
      lastDailyAt: current.lastDailyAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userEconomy.guildId, userEconomy.userId],
      set: { wallet, bank, updatedAt: now },
    })
    .run();
  return { wallet, bank };
}

/** Resta de la cartera; no baja de 0. */
export function debitWallet(
  guildId: string,
  userId: string,
  amount: number,
): { wallet: number; bank: number; taken: number } {
  const qty = Math.max(0, Math.floor(amount));
  const current = getOrCreateUserEconomy(guildId, userId);
  const taken = Math.min(current.wallet, qty);
  const wallet = current.wallet - taken;
  const bank = current.bank;
  const now = new Date();
  getDb()
    .update(userEconomy)
    .set({ wallet, bank, updatedAt: now })
    .where(
      and(eq(userEconomy.guildId, guildId), eq(userEconomy.userId, userId)),
    )
    .run();
  return { wallet, bank, taken };
}

export function transferWalletPay(
  guildId: string,
  fromUserId: string,
  toUserId: string,
  amount: number,
  taxPercent: number,
): {
  sent: number;
  tax: number;
  received: number;
  fromWallet: number;
  toWallet: number;
} {
  const qty = Math.floor(amount);
  if (!Number.isFinite(qty) || qty < 1) {
    throw new EconomyError(
      "La cantidad debe ser un entero ≥ 1.",
      400,
      "INVALID_AMOUNT",
    );
  }
  if (fromUserId === toUserId) {
    throw new EconomyError(
      "No puedes pagarte a ti mismo.",
      400,
      "SELF_PAY",
    );
  }

  const from = getOrCreateUserEconomy(guildId, fromUserId);
  if (from.wallet < qty) {
    throw new EconomyError(
      `Saldo insuficiente en cartera (tienes ${from.wallet}).`,
      400,
      "INSUFFICIENT_FUNDS",
    );
  }

  const tax = Math.min(
    qty,
    Math.floor((qty * Math.min(100, Math.max(0, taxPercent))) / 100),
  );
  const received = qty - tax;

  getOrCreateUserEconomy(guildId, toUserId);
  const now = new Date();
  const fromWallet = from.wallet - qty;

  getDb()
    .update(userEconomy)
    .set({ wallet: fromWallet, updatedAt: now })
    .where(
      and(
        eq(userEconomy.guildId, guildId),
        eq(userEconomy.userId, fromUserId),
      ),
    )
    .run();

  const to = getOrCreateUserEconomy(guildId, toUserId);
  const toWallet = to.wallet + received;
  getDb()
    .update(userEconomy)
    .set({ wallet: toWallet, updatedAt: now })
    .where(
      and(eq(userEconomy.guildId, guildId), eq(userEconomy.userId, toUserId)),
    )
    .run();

  return {
    sent: qty,
    tax,
    received,
    fromWallet,
    toWallet,
  };
}

export type ClaimDailyResult = {
  amount: number;
  streak: number;
  base: number;
  bonus: number;
  wallet: number;
  bank: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function claimDailyReward(
  guildId: string,
  userId: string,
  dailyPay: number,
  streakEnabled: boolean,
  streakBonusPercent: number,
): ClaimDailyResult {
  const current = getOrCreateUserEconomy(guildId, userId);
  const now = Date.now();
  const last = current.lastDailyAt?.getTime() ?? null;

  if (last !== null && now - last < DAY_MS) {
    const remaining = DAY_MS - (now - last);
    throw new EconomyError(
      `Vuelve en ${formatRemaining(remaining)}.`,
      400,
      "DAILY_COOLDOWN",
    );
  }

  let streak = 1;
  if (last !== null && streakEnabled && now - last < 2 * DAY_MS) {
    streak = current.dailyStreak + 1;
  }

  const base = Math.max(0, Math.floor(dailyPay));
  const bonus =
    streakEnabled && streak > 1
      ? Math.floor((base * streakBonusPercent * (streak - 1)) / 100)
      : 0;
  const amount = base + bonus;
  const wallet = current.wallet + amount;
  const bank = current.bank;
  const claimedAt = new Date(now);

  getDb()
    .update(userEconomy)
    .set({
      wallet,
      bank,
      dailyStreak: streak,
      lastDailyAt: claimedAt,
      updatedAt: claimedAt,
    })
    .where(
      and(eq(userEconomy.guildId, guildId), eq(userEconomy.userId, userId)),
    )
    .run();

  return { amount, streak, base, bonus, wallet, bank };
}

export function formatRemaining(ms: number): string {
  const totalSec = Math.max(1, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
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
