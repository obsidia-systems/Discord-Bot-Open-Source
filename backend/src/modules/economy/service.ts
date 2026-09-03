import type {
  EconomyConfig,
  UpdateEconomyConfigRequest,
} from "@adobos/shared";
import {
  clampStartBalance,
  clampTransferTax,
  clampEconomyBalance,
  defaultEconomyConfig,
  parseBankAmount,
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
      "Missing guildId.",
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
  const wallet = clampEconomyBalance(config.startBalance);
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
    .onConflictDoNothing({ target: [userEconomy.guildId, userEconomy.userId] });

  const row = await one(getDb()
    .select()
    .from(userEconomy)
    .where(
      and(eq(userEconomy.guildId, guildId), eq(userEconomy.userId, userId)),
    )
    .limit(1));
  if (!row) {
    throw new EconomyError(
      "Couldn't create the balance.",
      500,
      "ECONOMY_UPSERT_FAILED",
    );
  }
  return {
    wallet: row.wallet,
    bank: row.bank,
    dailyStreak: row.dailyStreak ?? 0,
    lastDailyAt: row.lastDailyAt ?? null,
    lastWeeklyAt: row.lastWeeklyAt ?? null,
    lastMonthlyAt: row.lastMonthlyAt ?? null,
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

/**
 * Parsea `cantidad` de slash STRING: "all"/"todo" → `"all"`,
 * número entero ≥ 1, o error.
 */
export function parseBankAmountInput(raw: string): number | "all" {
  const parsed = parseBankAmount(raw);
  if (parsed === null) {
    throw new EconomyError(
      raw.trim()
        ? "Invalid amount. Use an integer ≥ 1, or `all`/`todo`."
        : "Provide an amount (number or `all`/`todo`).",
      400,
      "INVALID_AMOUNT",
    );
  }
  return parsed;
}

export function formatRemaining(ms: number): string {
  const totalSec = Math.max(1, Math.ceil(ms / 1000));
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days} day${days === 1 ? "" : "s"}`);
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
