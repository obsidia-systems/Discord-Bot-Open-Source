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
import { getDb, one } from "../../db/client.js";
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
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new EconomyError(
      "Falta guildId.",
      400,
      "MISSING_GUILD_ID",
    );
  }
  return id;
}

async function ensureGuildRow(guildId: string): Promise<void> {
  const existing = await one(getDb()
    .select({ guildId: guildSettings.guildId })
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId))
    .limit(1));
  if (!existing) {
    await getDb()
      .insert(guildSettings)
      .values({
        guildId,
        prefix: "!",
        welcomeEnabled: false,
        updatedAt: new Date(),
      })
      ;
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

export async function getEconomyConfig(guildId?: string): Promise<EconomyConfig> {
  const id = resolveGuildId(guildId);
  const row = await one(getDb()
    .select()
    .from(economyConfig)
    .where(eq(economyConfig.guildId, id))
    .limit(1));
  return await rowToConfig(id, row);
}

export async function updateEconomyConfig(
  input: UpdateEconomyConfigRequest,
): Promise<EconomyConfig> {
  const id = resolveGuildId(input.guildId);
  await ensureGuildRow(id);
  const current = await getEconomyConfig(id);

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
  await getDb()
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
    ;

  return next;
}

export async function listEconomyLeaderboardRows(
  guildId: string,
  limit = 100,
): Promise<Array<{
  rank: number;
  userId: string;
  wallet: number;
  bank: number;
  total: number;
}>> {
  const id = resolveGuildId(guildId);
  const rows = await getDb()
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
    ;

  return rows.map((row, i) => ({
    rank: i + 1,
    userId: row.userId,
    wallet: row.wallet,
    bank: row.bank,
    total: Number(row.total) || row.wallet + row.bank,
  }));
}

export async function getEconomyLeaderboardTotal(guildId?: string): Promise<number> {
  const id = resolveGuildId(guildId);
  const row = await one(getDb()
    .select({ count: sql<number>`count(*)` })
    .from(userEconomy)
    .where(eq(userEconomy.guildId, id))
    .limit(1));
  return Number(row?.count ?? 0);
}

async function getOrCreateUserEconomy(
  guildId: string,
  userId: string,
): Promise<{
  wallet: number;
  bank: number;
  dailyStreak: number;
  lastDailyAt: Date | null;
  lastWeeklyAt: Date | null;
  lastMonthlyAt: Date | null;
}> {
  const existing = await one(getDb()
    .select()
    .from(userEconomy)
    .where(
      and(eq(userEconomy.guildId, guildId), eq(userEconomy.userId, userId)),
    )
    .limit(1));
  if (existing) {
    return {
      wallet: existing.wallet,
      bank: existing.bank,
      dailyStreak: existing.dailyStreak ?? 0,
      lastDailyAt: existing.lastDailyAt ?? null,
      lastWeeklyAt: existing.lastWeeklyAt ?? null,
      lastMonthlyAt: existing.lastMonthlyAt ?? null,
    };
  }

  const config = await getEconomyConfig(guildId);
  const wallet = config.startBalance;
  const now = new Date();
  await getDb()
    .insert(userEconomy)
    .values({
      guildId,
      userId,
      wallet,
      bank: 0,
      dailyStreak: 0,
      lastDailyAt: null,
      lastWeeklyAt: null,
      lastMonthlyAt: null,
      updatedAt: now,
    })
    ;
  return {
    wallet,
    bank: 0,
    dailyStreak: 0,
    lastDailyAt: null,
    lastWeeklyAt: null,
    lastMonthlyAt: null,
  };
}

export async function getUserEconomyBalance(
  guildId: string,
  userId: string,
): Promise<{ wallet: number; bank: number; total: number }> {
  const row = await getOrCreateUserEconomy(guildId, userId);
  return {
    wallet: row.wallet,
    bank: row.bank,
    total: row.wallet + row.bank,
  };
}

export type BankTransferResult = {
  moved: number;
  wallet: number;
  bank: number;
  total: number;
};

/**
 * Parsea `cantidad` de slash STRING: "all"/"todo" → null (todo),
 * número entero ≥ 1, o error.
 */
export function parseBankAmountInput(raw: string): number | "all" {
  const value = raw.trim().toLowerCase();
  if (!value) {
    throw new EconomyError(
      "Indica una cantidad (número o `all`/`todo`).",
      400,
      "INVALID_AMOUNT",
    );
  }
  if (value === "all" || value === "todo" || value === "max") {
    return "all";
  }
  const cleaned = value.replace(/[,\s_]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    throw new EconomyError(
      "Cantidad inválida. Usa un entero ≥ 1, o `all`/`todo`.",
      400,
      "INVALID_AMOUNT",
    );
  }
  return Math.floor(n);
}

/** Cartera → banco (síncrono: validar + actualizar). */
export async function depositToBank(
  guildId: string,
  userId: string,
  amountOrAll: number | "all",
): Promise<BankTransferResult> {
  const current = await getOrCreateUserEconomy(guildId, userId);
  const moved =
    amountOrAll === "all" ? current.wallet : Math.floor(amountOrAll);

  if (moved < 1) {
    throw new EconomyError(
      "No tienes dinero en la cartera para depositar.",
      400,
      "EMPTY_WALLET",
    );
  }
  if (current.wallet < moved) {
    throw new EconomyError(
      `Saldo insuficiente en cartera (tienes ${current.wallet}).`,
      400,
      "INSUFFICIENT_FUNDS",
    );
  }

  const wallet = current.wallet - moved;
  const bank = current.bank + moved;
  const now = new Date();

  await getDb()
    .update(userEconomy)
    .set({ wallet, bank, updatedAt: now })
    .where(
      and(eq(userEconomy.guildId, guildId), eq(userEconomy.userId, userId)),
    )
    ;

  return { moved, wallet, bank, total: wallet + bank };
}

/** Banco → cartera (síncrono: validar + actualizar). */
export async function withdrawFromBank(
  guildId: string,
  userId: string,
  amountOrAll: number | "all",
): Promise<BankTransferResult> {
  const current = await getOrCreateUserEconomy(guildId, userId);
  const moved = amountOrAll === "all" ? current.bank : Math.floor(amountOrAll);

  if (moved < 1) {
    throw new EconomyError(
      "No tienes dinero en el banco para retirar.",
      400,
      "EMPTY_BANK",
    );
  }
  if (current.bank < moved) {
    throw new EconomyError(
      `Saldo insuficiente en el banco (tienes ${current.bank}).`,
      400,
      "INSUFFICIENT_FUNDS",
    );
  }

  const wallet = current.wallet + moved;
  const bank = current.bank - moved;
  const now = new Date();

  await getDb()
    .update(userEconomy)
    .set({ wallet, bank, updatedAt: now })
    .where(
      and(eq(userEconomy.guildId, guildId), eq(userEconomy.userId, userId)),
    )
    ;

  return { moved, wallet, bank, total: wallet + bank };
}

/** Suma a la cartera (nunca negativo). */
export async function creditWallet(
  guildId: string,
  userId: string,
  amount: number,
): Promise<{ wallet: number; bank: number }> {
  const qty = Math.max(0, Math.floor(amount));
  const current = await getOrCreateUserEconomy(guildId, userId);
  const wallet = current.wallet + qty;
  const bank = current.bank;
  const now = new Date();
  await getDb()
    .insert(userEconomy)
    .values({
      guildId,
      userId,
      wallet,
      bank,
      dailyStreak: current.dailyStreak,
      lastDailyAt: current.lastDailyAt,
      lastWeeklyAt: current.lastWeeklyAt,
      lastMonthlyAt: current.lastMonthlyAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userEconomy.guildId, userEconomy.userId],
      set: { wallet, bank, updatedAt: now },
    })
    ;
  return { wallet, bank };
}

/** Resta de la cartera; no baja de 0. */
export async function debitWallet(
  guildId: string,
  userId: string,
  amount: number,
): Promise<{ wallet: number; bank: number; taken: number }> {
  const qty = Math.max(0, Math.floor(amount));
  const current = await getOrCreateUserEconomy(guildId, userId);
  const taken = Math.min(current.wallet, qty);
  const wallet = current.wallet - taken;
  const bank = current.bank;
  const now = new Date();
  await getDb()
    .update(userEconomy)
    .set({ wallet, bank, updatedAt: now })
    .where(
      and(eq(userEconomy.guildId, guildId), eq(userEconomy.userId, userId)),
    )
    ;
  return { wallet, bank, taken };
}

/**
 * Descuenta exactamente `amount` de la cartera o lanza si no hay saldo.
 * Transacción SQLite para evitar condiciones de carrera simples.
 */
export async function debitWalletStrict(
  guildId: string,
  userId: string,
  amount: number,
): Promise<{ wallet: number; bank: number }> {
  const qty = Math.floor(amount);
  if (!Number.isFinite(qty) || qty < 1) {
    throw new EconomyError(
      "La cantidad debe ser un entero ≥ 1.",
      400,
      "INVALID_AMOUNT",
    );
  }

  return getDb().transaction(async (tx) => {
    const existing = await one(
      tx
        .select()
        .from(userEconomy)
        .where(
          and(eq(userEconomy.guildId, guildId), eq(userEconomy.userId, userId)),
        )
        .limit(1),
    );
    let current = existing
      ? { wallet: existing.wallet, bank: existing.bank }
      : null;
    if (!current) {
      const config = await getEconomyConfig(guildId);
      const nowInsert = new Date();
      await tx.insert(userEconomy).values({
        guildId,
        userId,
        wallet: config.startBalance,
        bank: 0,
        dailyStreak: 0,
        lastDailyAt: null,
        lastWeeklyAt: null,
        lastMonthlyAt: null,
        updatedAt: nowInsert,
      });
      current = { wallet: config.startBalance, bank: 0 };
    }
    if (current.wallet < qty) {
      throw new EconomyError(
        `Saldo insuficiente en cartera (tienes ${current.wallet.toLocaleString("es-MX")}).`,
        400,
        "INSUFFICIENT_FUNDS",
      );
    }
    const wallet = current.wallet - qty;
    const bank = current.bank;
    const now = new Date();
    await tx
      .update(userEconomy)
      .set({ wallet, bank, updatedAt: now })
      .where(
        and(eq(userEconomy.guildId, guildId), eq(userEconomy.userId, userId)),
      );
    return { wallet, bank };
  });
}

export async function transferWalletPay(
  guildId: string,
  fromUserId: string,
  toUserId: string,
  amount: number,
  taxPercent: number,
): Promise<{
  sent: number;
  tax: number;
  received: number;
  fromWallet: number;
  toWallet: number;
}> {
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

  const from = await getOrCreateUserEconomy(guildId, fromUserId);
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

  await getOrCreateUserEconomy(guildId, toUserId);
  const now = new Date();
  const fromWallet = from.wallet - qty;

  await getDb()
    .update(userEconomy)
    .set({ wallet: fromWallet, updatedAt: now })
    .where(
      and(
        eq(userEconomy.guildId, guildId),
        eq(userEconomy.userId, fromUserId),
      ),
    )
    ;

  const to = await getOrCreateUserEconomy(guildId, toUserId);
  const toWallet = to.wallet + received;
  await getDb()
    .update(userEconomy)
    .set({ wallet: toWallet, updatedAt: now })
    .where(
      and(eq(userEconomy.guildId, guildId), eq(userEconomy.userId, toUserId)),
    )
    ;

  return {
    sent: qty,
    tax,
    received,
    fromWallet,
    toWallet,
  };
}

export type FixedIncomeType = "daily" | "weekly" | "monthly";

export type ClaimFixedIncomeResult = {
  type: FixedIncomeType;
  amount: number;
  streak: number;
  base: number;
  bonus: number;
  bonusPercent: number;
  wallet: number;
  bank: number;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const FIXED_INCOME_COOLDOWN_MS: Record<FixedIncomeType, number> = {
  daily: 24 * HOUR_MS,
  weekly: 7 * 24 * HOUR_MS,
  monthly: 30 * 24 * HOUR_MS,
};

/**
 * Reclama /daily, /weekly o /monthly (DRY).
 * Solo `daily` aplica sistema de rachas.
 */
export async function claimFixedIncome(
  guildId: string,
  userId: string,
  type: FixedIncomeType,
  basePay: number,
  streakEnabled: boolean,
  streakBonusPercent: number,
): Promise<ClaimFixedIncomeResult> {
  const current = await getOrCreateUserEconomy(guildId, userId);
  const now = Date.now();
  const cooldownMs = FIXED_INCOME_COOLDOWN_MS[type];

  const lastAt =
    type === "daily"
      ? current.lastDailyAt
      : type === "weekly"
        ? current.lastWeeklyAt
        : current.lastMonthlyAt;
  const last = lastAt?.getTime() ?? null;

  if (last !== null && now - last < cooldownMs) {
    throw new EconomyError(
      `Vuelve en ${formatRemaining(cooldownMs - (now - last))}.`,
      400,
      `${type.toUpperCase()}_COOLDOWN`,
    );
  }

  let streak = current.dailyStreak;
  let bonusPercent = 0;
  let bonus = 0;
  const base = Math.max(0, Math.floor(basePay));

  if (type === "daily") {
    streak = 1;
    if (last !== null && streakEnabled && now - last < 2 * DAY_MS) {
      streak = current.dailyStreak + 1;
    }
    if (streakEnabled && streak > 0) {
      // Alineado con el panel: racha xN → +(N * bonus%) .
      bonusPercent = streak * streakBonusPercent;
      bonus = Math.floor((base * bonusPercent) / 100);
    }
  }

  const amount = base + bonus;
  const wallet = current.wallet + amount;
  const bank = current.bank;
  const claimedAt = new Date(now);

  await getDb()
    .update(userEconomy)
    .set({
      wallet,
      bank,
      ...(type === "daily"
        ? { dailyStreak: streak, lastDailyAt: claimedAt }
        : type === "weekly"
          ? { lastWeeklyAt: claimedAt }
          : { lastMonthlyAt: claimedAt }),
      updatedAt: claimedAt,
    })
    .where(
      and(eq(userEconomy.guildId, guildId), eq(userEconomy.userId, userId)),
    )
    ;

  return {
    type,
    amount,
    streak: type === "daily" ? streak : 0,
    base,
    bonus,
    bonusPercent,
    wallet,
    bank,
  };
}

/** @deprecated Usar `await claimFixedIncome(..., "daily", ...)`. */
export async function claimDailyReward(
  guildId: string,
  userId: string,
  dailyPay: number,
  streakEnabled: boolean,
  streakBonusPercent: number,
): Promise<ClaimFixedIncomeResult> {
  return await claimFixedIncome(
    guildId,
    userId,
    "daily",
    dailyPay,
    streakEnabled,
    streakBonusPercent,
  );
}

export function formatRemaining(ms: number): string {
  const totalSec = Math.max(1, Math.ceil(ms / 1000));
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days} día${days === 1 ? "" : "s"}`);
    if (hours > 0) parts.push(`${hours} hora${hours === 1 ? "" : "s"}`);
    return parts.join(" y ");
  }
  if (hours > 0) {
    parts.push(`${hours} hora${hours === 1 ? "" : "s"}`);
    if (minutes > 0) parts.push(`${minutes} min`);
    return parts.join(" y ");
  }
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export async function adjustEconomyFunds(
  input: AdjustEconomyFundsRequest,
): Promise<AdjustEconomyFundsResponse> {
  const id = resolveGuildId(input.guildId);
  await ensureGuildRow(id);

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

  const current = await getOrCreateUserEconomy(id, userId);
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
  await getDb()
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
    ;

  return {
    ok: true,
    userId,
    wallet,
    bank,
    total: wallet + bank,
  };
}
