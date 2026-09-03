import {
  type AdjustEconomyFundsRequest,
  type AdjustEconomyFundsResponse,
  clampEconomyBalance,
  computePayTax,
} from "@adobos/shared";
import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "#db/client.js";
import { getDb, one } from "#db/client.js";
import {
  economyBlackjackOpen,
  economyShopItems,
  type UserEconomyRow,
  userEconomy,
} from "#db/schema.js";
import { EconomyError, formatRemaining, getEconomyConfig } from "./service.js";

type EconomyTx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

export type LockedUserEconomy = {
  wallet: number;
  bank: number;
  dailyStreak: number;
  lastDailyAt: Date | null;
  lastWeeklyAt: Date | null;
  lastMonthlyAt: Date | null;
};

function asLocked(row: UserEconomyRow): LockedUserEconomy {
  return {
    wallet: row.wallet,
    bank: row.bank,
    dailyStreak: row.dailyStreak ?? 0,
    lastDailyAt: row.lastDailyAt ?? null,
    lastWeeklyAt: row.lastWeeklyAt ?? null,
    lastMonthlyAt: row.lastMonthlyAt ?? null,
  };
}

async function startBalanceOf(guildId: string): Promise<number> {
  const config = await getEconomyConfig(guildId);
  return clampEconomyBalance(config.startBalance);
}

export async function lockUserEconomy(
  tx: EconomyTx,
  guildId: string,
  userId: string,
  startBalance: number,
): Promise<LockedUserEconomy> {
  const now = new Date();
  await tx
    .insert(userEconomy)
    .values({
      guildId,
      userId,
      wallet: clampEconomyBalance(startBalance),
      bank: 0,
      dailyStreak: 0,
      lastDailyAt: null,
      lastWeeklyAt: null,
      lastMonthlyAt: null,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: [userEconomy.guildId, userEconomy.userId] });

  const existing = await one(
    tx
      .select()
      .from(userEconomy)
      .where(
        and(eq(userEconomy.guildId, guildId), eq(userEconomy.userId, userId)),
      )
      .limit(1)
      .for("update"),
  );
  if (!existing) {
    throw new EconomyError(
      "Couldn't create the balance.",
      500,
      "ECONOMY_UPSERT_FAILED",
    );
  }
  return asLocked(existing);
}

async function writeUserEconomy(
  tx: EconomyTx,
  guildId: string,
  userId: string,
  patch: Partial<LockedUserEconomy> & { wallet: number; bank: number },
): Promise<LockedUserEconomy> {
  const now = new Date();
  const wallet = clampEconomyBalance(patch.wallet);
  const bank = clampEconomyBalance(patch.bank);
  await tx
    .update(userEconomy)
    .set({
      wallet,
      bank,
      ...(patch.dailyStreak !== undefined
        ? { dailyStreak: patch.dailyStreak }
        : {}),
      ...(patch.lastDailyAt !== undefined
        ? { lastDailyAt: patch.lastDailyAt }
        : {}),
      ...(patch.lastWeeklyAt !== undefined
        ? { lastWeeklyAt: patch.lastWeeklyAt }
        : {}),
      ...(patch.lastMonthlyAt !== undefined
        ? { lastMonthlyAt: patch.lastMonthlyAt }
        : {}),
      updatedAt: now,
    })
    .where(
      and(eq(userEconomy.guildId, guildId), eq(userEconomy.userId, userId)),
    );
  return {
    wallet,
    bank,
    dailyStreak: patch.dailyStreak ?? 0,
    lastDailyAt: patch.lastDailyAt ?? null,
    lastWeeklyAt: patch.lastWeeklyAt ?? null,
    lastMonthlyAt: patch.lastMonthlyAt ?? null,
  };
}

/** Suma a la cartera (nunca negativo; techo MAX_ECONOMY_BALANCE). */
export async function creditWallet(
  guildId: string,
  userId: string,
  amount: number,
): Promise<{ wallet: number; bank: number }> {
  const qty = Math.max(0, Math.floor(amount));
  const startBalance = await startBalanceOf(guildId);
  return getDb().transaction(async (tx) => {
    const current = await lockUserEconomy(tx, guildId, userId, startBalance);
    const next = await writeUserEconomy(tx, guildId, userId, {
      ...current,
      wallet: current.wallet + qty,
      bank: current.bank,
    });
    return { wallet: next.wallet, bank: next.bank };
  });
}

/** Resta de la cartera; no baja de 0. */
export async function debitWallet(
  guildId: string,
  userId: string,
  amount: number,
): Promise<{ wallet: number; bank: number; taken: number }> {
  const qty = Math.max(0, Math.floor(amount));
  const startBalance = await startBalanceOf(guildId);
  return getDb().transaction(async (tx) => {
    const current = await lockUserEconomy(tx, guildId, userId, startBalance);
    const taken = Math.min(current.wallet, qty);
    const next = await writeUserEconomy(tx, guildId, userId, {
      ...current,
      wallet: current.wallet - taken,
      bank: current.bank,
    });
    return { wallet: next.wallet, bank: next.bank, taken };
  });
}

/** Descuenta exactamente `amount` de la cartera o lanza si no hay saldo. */
export async function debitWalletStrict(
  guildId: string,
  userId: string,
  amount: number,
): Promise<{ wallet: number; bank: number }> {
  const qty = Math.floor(amount);
  if (!Number.isFinite(qty) || qty < 1) {
    throw new EconomyError(
      "The amount must be an integer ≥ 1.",
      400,
      "INVALID_AMOUNT",
    );
  }
  const startBalance = await startBalanceOf(guildId);
  return getDb().transaction(async (tx) => {
    const current = await lockUserEconomy(tx, guildId, userId, startBalance);
    if (current.wallet < qty) {
      throw new EconomyError(
        `Not enough in your wallet (you have ${current.wallet.toLocaleString("es-MX")}).`,
        400,
        "INSUFFICIENT_FUNDS",
      );
    }
    const next = await writeUserEconomy(tx, guildId, userId, {
      ...current,
      wallet: current.wallet - qty,
      bank: current.bank,
    });
    return { wallet: next.wallet, bank: next.bank };
  });
}

export type BankTransferResult = {
  moved: number;
  wallet: number;
  bank: number;
  total: number;
};

/** Cartera → banco. */
export async function depositToBank(
  guildId: string,
  userId: string,
  amountOrAll: number | "all",
): Promise<BankTransferResult> {
  const startBalance = await startBalanceOf(guildId);
  return getDb().transaction(async (tx) => {
    const current = await lockUserEconomy(tx, guildId, userId, startBalance);
    const moved =
      amountOrAll === "all" ? current.wallet : Math.floor(amountOrAll);

    if (moved < 1) {
      throw new EconomyError(
        "You have no money in your wallet to deposit.",
        400,
        "EMPTY_WALLET",
      );
    }
    if (current.wallet < moved) {
      throw new EconomyError(
        `Not enough in your wallet (you have ${current.wallet}).`,
        400,
        "INSUFFICIENT_FUNDS",
      );
    }

    const next = await writeUserEconomy(tx, guildId, userId, {
      ...current,
      wallet: current.wallet - moved,
      bank: current.bank + moved,
    });
    return {
      moved,
      wallet: next.wallet,
      bank: next.bank,
      total: next.wallet + next.bank,
    };
  });
}

/** Banco → cartera. */
export async function withdrawFromBank(
  guildId: string,
  userId: string,
  amountOrAll: number | "all",
): Promise<BankTransferResult> {
  const startBalance = await startBalanceOf(guildId);
  return getDb().transaction(async (tx) => {
    const current = await lockUserEconomy(tx, guildId, userId, startBalance);
    const moved =
      amountOrAll === "all" ? current.bank : Math.floor(amountOrAll);

    if (moved < 1) {
      throw new EconomyError(
        "You have no money in the bank to withdraw.",
        400,
        "EMPTY_BANK",
      );
    }
    if (current.bank < moved) {
      throw new EconomyError(
        `Not enough in the bank (you have ${current.bank}).`,
        400,
        "INSUFFICIENT_FUNDS",
      );
    }

    const next = await writeUserEconomy(tx, guildId, userId, {
      ...current,
      wallet: current.wallet + moved,
      bank: current.bank - moved,
    });
    return {
      moved,
      wallet: next.wallet,
      bank: next.bank,
      total: next.wallet + next.bank,
    };
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
      "The amount must be an integer ≥ 1.",
      400,
      "INVALID_AMOUNT",
    );
  }
  if (fromUserId === toUserId) {
    throw new EconomyError("You can't pay yourself.", 400, "SELF_PAY");
  }

  const { sent, tax, received } = computePayTax(qty, taxPercent);
  const startBalance = await startBalanceOf(guildId);
  const [firstId, secondId] =
    fromUserId < toUserId ? [fromUserId, toUserId] : [toUserId, fromUserId];

  return getDb().transaction(async (tx) => {
    const first = await lockUserEconomy(tx, guildId, firstId, startBalance);
    const second = await lockUserEconomy(tx, guildId, secondId, startBalance);
    const from = fromUserId === firstId ? first : second;
    const to = toUserId === firstId ? first : second;

    if (from.wallet < sent) {
      throw new EconomyError(
        `Not enough in your wallet (you have ${from.wallet}).`,
        400,
        "INSUFFICIENT_FUNDS",
      );
    }

    const fromNext = await writeUserEconomy(tx, guildId, fromUserId, {
      ...from,
      wallet: from.wallet - sent,
      bank: from.bank,
    });
    const toNext = await writeUserEconomy(tx, guildId, toUserId, {
      ...to,
      wallet: to.wallet + received,
      bank: to.bank,
    });

    return {
      sent,
      tax,
      received,
      fromWallet: fromNext.wallet,
      toWallet: toNext.wallet,
    };
  });
}

/**
 * Robo atómico: solo carteras. Orden de lock = userId para evitar deadlock.
 */
export async function robWallet(input: {
  guildId: string;
  robberId: string;
  victimId: string;
  success: boolean;
  stealAmount: number;
  fineAmount: number;
}): Promise<{
  stolen: number;
  fine: number;
  robberWallet: number;
  victimWallet: number;
}> {
  if (input.robberId === input.victimId) {
    throw new EconomyError("You can't rob yourself.", 400, "SELF_ROB");
  }

  const startBalance = await startBalanceOf(input.guildId);
  const [firstId, secondId] =
    input.robberId < input.victimId
      ? [input.robberId, input.victimId]
      : [input.victimId, input.robberId];

  return getDb().transaction(async (tx) => {
    const first = await lockUserEconomy(
      tx,
      input.guildId,
      firstId,
      startBalance,
    );
    const second = await lockUserEconomy(
      tx,
      input.guildId,
      secondId,
      startBalance,
    );
    const robber = input.robberId === firstId ? first : second;
    const victim = input.victimId === firstId ? first : second;

    if (input.success) {
      const stolen = Math.min(
        victim.wallet,
        Math.max(0, Math.floor(input.stealAmount)),
      );
      if (stolen < 1) {
        throw new EconomyError(
          "That wallet doesn't have enough money.",
          400,
          "EMPTY_TARGET",
        );
      }
      const victimNext = await writeUserEconomy(
        tx,
        input.guildId,
        input.victimId,
        {
          ...victim,
          wallet: victim.wallet - stolen,
        },
      );
      const robberNext = await writeUserEconomy(
        tx,
        input.guildId,
        input.robberId,
        {
          ...robber,
          wallet: robber.wallet + stolen,
        },
      );
      return {
        stolen,
        fine: 0,
        robberWallet: robberNext.wallet,
        victimWallet: victimNext.wallet,
      };
    }

    const fine = Math.min(
      robber.wallet,
      Math.max(0, Math.floor(input.fineAmount)),
    );
    const robberNext = await writeUserEconomy(
      tx,
      input.guildId,
      input.robberId,
      {
        ...robber,
        wallet: robber.wallet - fine,
      },
    );
    return {
      stolen: 0,
      fine,
      robberWallet: robberNext.wallet,
      victimWallet: victim.wallet,
    };
  });
}

export async function adjustEconomyFunds(
  input: AdjustEconomyFundsRequest,
): Promise<AdjustEconomyFundsResponse> {
  const guildId = (input.guildId ?? "").trim();
  if (!guildId) {
    throw new EconomyError("Missing guildId.", 400, "MISSING_GUILD_ID");
  }

  const userId = (input.userId ?? "").trim();
  if (!/^\d{17,20}$/.test(userId)) {
    throw new EconomyError("Invalid userId.", 400, "INVALID_USER_ID");
  }

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new EconomyError(
      "The amount must be a number ≥ 0.",
      400,
      "INVALID_AMOUNT",
    );
  }
  const qty = Math.floor(amount);

  if (input.target !== "wallet" && input.target !== "bank") {
    throw new EconomyError("Invalid target.", 400, "INVALID_TARGET");
  }
  if (
    input.action !== "add" &&
    input.action !== "remove" &&
    input.action !== "set"
  ) {
    throw new EconomyError("Invalid action.", 400, "INVALID_ACTION");
  }

  const startBalance = await startBalanceOf(guildId);
  return getDb().transaction(async (tx) => {
    const current = await lockUserEconomy(tx, guildId, userId, startBalance);
    let wallet = current.wallet;
    let bank = current.bank;

    const apply = (value: number): number => {
      if (input.action === "set") return qty;
      if (input.action === "add") return value + qty;
      return Math.max(0, value - qty);
    };

    if (input.target === "wallet") wallet = apply(wallet);
    else bank = apply(bank);

    const next = await writeUserEconomy(tx, guildId, userId, {
      ...current,
      wallet,
      bank,
    });
    return {
      ok: true as const,
      userId,
      wallet: next.wallet,
      bank: next.bank,
      total: next.wallet + next.bank,
    };
  });
}

function debitWalletThenBank(
  wallet: number,
  bank: number,
  price: number,
): { wallet: number; bank: number } {
  let remaining = price;
  const fromWallet = Math.min(wallet, remaining);
  const nextWallet = wallet - fromWallet;
  remaining -= fromWallet;
  const nextBank = remaining > 0 ? bank - remaining : bank;
  return { wallet: nextWallet, bank: nextBank };
}

/** Cobra el precio (cartera, luego banco) y baja stock en la misma tx. */
export async function debitShopPurchase(
  guildId: string,
  userId: string,
  itemId: string,
  price: number,
): Promise<{ wallet: number; bank: number }> {
  const qty = Math.max(0, Math.floor(price));
  const startBalance = await startBalanceOf(guildId);
  return getDb().transaction(async (tx) => {
    const item = await one(
      tx
        .select()
        .from(economyShopItems)
        .where(
          and(
            eq(economyShopItems.id, itemId),
            eq(economyShopItems.guildId, guildId),
          ),
        )
        .limit(1)
        .for("update"),
    );
    if (!item) {
      throw new EconomyError("Item not found.", 404, "NOT_FOUND");
    }
    if (item.stock !== null && item.stock <= 0) {
      throw new EconomyError("Sin stock disponible.", 400, "OUT_OF_STOCK");
    }

    const current = await lockUserEconomy(tx, guildId, userId, startBalance);
    const total = current.wallet + current.bank;
    if (total < qty) {
      throw new EconomyError(
        `Not enough balance. You need ${qty} (you have ${total}).`,
        400,
        "INSUFFICIENT_FUNDS",
      );
    }

    const nextBal = debitWalletThenBank(current.wallet, current.bank, qty);
    const next = await writeUserEconomy(tx, guildId, userId, {
      ...current,
      wallet: nextBal.wallet,
      bank: nextBal.bank,
    });

    if (item.stock !== null) {
      await tx
        .update(economyShopItems)
        .set({ stock: item.stock - 1, updatedAt: new Date() })
        .where(eq(economyShopItems.id, itemId));
    }

    return { wallet: next.wallet, bank: next.bank };
  });
}

export async function refundShopPurchase(
  guildId: string,
  userId: string,
  itemId: string,
  amount: number,
  restock: boolean,
): Promise<void> {
  const qty = Math.max(0, Math.floor(amount));
  const startBalance = await startBalanceOf(guildId);
  await getDb().transaction(async (tx) => {
    if (restock) {
      const item = await one(
        tx
          .select()
          .from(economyShopItems)
          .where(eq(economyShopItems.id, itemId))
          .limit(1)
          .for("update"),
      );
      if (item?.stock !== null && item?.stock !== undefined) {
        await tx
          .update(economyShopItems)
          .set({ stock: item.stock + 1, updatedAt: new Date() })
          .where(eq(economyShopItems.id, itemId));
      }
    }

    const current = await lockUserEconomy(tx, guildId, userId, startBalance);
    await writeUserEconomy(tx, guildId, userId, {
      ...current,
      wallet: current.wallet + qty,
      bank: current.bank,
    });
  });
}

/** Cobra la apuesta y registra el stake abierto (reembolso si el proceso muere). */
export async function openBlackjackStake(
  guildId: string,
  userId: string,
  bet: number,
): Promise<{ wallet: number; bank: number }> {
  const qty = Math.floor(bet);
  if (!Number.isFinite(qty) || qty < 1) {
    throw new EconomyError(
      "The amount must be an integer ≥ 1.",
      400,
      "INVALID_AMOUNT",
    );
  }
  const startBalance = await startBalanceOf(guildId);
  return getDb().transaction(async (tx) => {
    const current = await lockUserEconomy(tx, guildId, userId, startBalance);
    const already = await one(
      tx
        .select()
        .from(economyBlackjackOpen)
        .where(
          and(
            eq(economyBlackjackOpen.guildId, guildId),
            eq(economyBlackjackOpen.userId, userId),
          ),
        )
        .limit(1),
    );
    if (already) {
      throw new EconomyError(
        "You already have a blackjack hand in progress.",
        400,
        "BJ_IN_PROGRESS",
      );
    }
    if (current.wallet < qty) {
      throw new EconomyError(
        `Not enough in your wallet (you have ${current.wallet.toLocaleString("es-MX")}).`,
        400,
        "INSUFFICIENT_FUNDS",
      );
    }
    const next = await writeUserEconomy(tx, guildId, userId, {
      ...current,
      wallet: current.wallet - qty,
      bank: current.bank,
    });
    await tx.insert(economyBlackjackOpen).values({
      guildId,
      userId,
      bet: qty,
    });
    return { wallet: next.wallet, bank: next.bank };
  });
}

export async function raiseBlackjackStake(
  guildId: string,
  userId: string,
  extra: number,
): Promise<{ wallet: number; bank: number; bet: number }> {
  const qty = Math.floor(extra);
  if (!Number.isFinite(qty) || qty < 1) {
    throw new EconomyError(
      "The amount must be an integer ≥ 1.",
      400,
      "INVALID_AMOUNT",
    );
  }
  const startBalance = await startBalanceOf(guildId);
  return getDb().transaction(async (tx) => {
    const current = await lockUserEconomy(tx, guildId, userId, startBalance);
    const open = await one(
      tx
        .select()
        .from(economyBlackjackOpen)
        .where(
          and(
            eq(economyBlackjackOpen.guildId, guildId),
            eq(economyBlackjackOpen.userId, userId),
          ),
        )
        .limit(1)
        .for("update"),
    );
    if (!open) {
      throw new EconomyError(
        "This hand already ended or expired.",
        400,
        "BJ_NO_SESSION",
      );
    }
    if (current.wallet < qty) {
      throw new EconomyError(
        `Not enough in your wallet (you have ${current.wallet.toLocaleString("es-MX")}).`,
        400,
        "INSUFFICIENT_FUNDS",
      );
    }
    const next = await writeUserEconomy(tx, guildId, userId, {
      ...current,
      wallet: current.wallet - qty,
      bank: current.bank,
    });
    const bet = open.bet + qty;
    await tx
      .update(economyBlackjackOpen)
      .set({ bet })
      .where(
        and(
          eq(economyBlackjackOpen.guildId, guildId),
          eq(economyBlackjackOpen.userId, userId),
        ),
      );
    return { wallet: next.wallet, bank: next.bank, bet };
  });
}

/** Acredita el pago (0 = pérdida) y cierra el stake abierto. */
export async function closeBlackjackStake(
  guildId: string,
  userId: string,
  credit: number,
): Promise<{ wallet: number; bank: number }> {
  const qty = Math.max(0, Math.floor(credit));
  const startBalance = await startBalanceOf(guildId);
  return getDb().transaction(async (tx) => {
    const current = await lockUserEconomy(tx, guildId, userId, startBalance);
    await one(
      tx
        .select()
        .from(economyBlackjackOpen)
        .where(
          and(
            eq(economyBlackjackOpen.guildId, guildId),
            eq(economyBlackjackOpen.userId, userId),
          ),
        )
        .limit(1)
        .for("update"),
    );
    const next = await writeUserEconomy(tx, guildId, userId, {
      ...current,
      wallet: current.wallet + qty,
      bank: current.bank,
    });
    await tx
      .delete(economyBlackjackOpen)
      .where(
        and(
          eq(economyBlackjackOpen.guildId, guildId),
          eq(economyBlackjackOpen.userId, userId),
        ),
      );
    return { wallet: next.wallet, bank: next.bank };
  });
}

export async function refundBlackjackStakeIfOpen(
  guildId: string,
  userId: string,
): Promise<boolean> {
  const startBalance = await startBalanceOf(guildId);
  return getDb().transaction(async (tx) => {
    const current = await lockUserEconomy(tx, guildId, userId, startBalance);
    const open = await one(
      tx
        .select()
        .from(economyBlackjackOpen)
        .where(
          and(
            eq(economyBlackjackOpen.guildId, guildId),
            eq(economyBlackjackOpen.userId, userId),
          ),
        )
        .limit(1)
        .for("update"),
    );
    if (!open) return false;
    await writeUserEconomy(tx, guildId, userId, {
      ...current,
      wallet: current.wallet + open.bet,
      bank: current.bank,
    });
    await tx
      .delete(economyBlackjackOpen)
      .where(
        and(
          eq(economyBlackjackOpen.guildId, guildId),
          eq(economyBlackjackOpen.userId, userId),
        ),
      );
    return true;
  });
}

/** Reembolsa manos de blackjack huérfanas (deploy / crash). */
export async function refundAbandonedBlackjackStakes(): Promise<number> {
  const rows = await getDb().select().from(economyBlackjackOpen);
  let n = 0;
  for (const row of rows) {
    const ok = await refundBlackjackStakeIfOpen(row.guildId, row.userId);
    if (ok) n += 1;
  }
  return n;
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
  const startBalance = await startBalanceOf(guildId);
  return getDb().transaction(async (tx) => {
    const current = await lockUserEconomy(tx, guildId, userId, startBalance);
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
        `Come back in ${formatRemaining(cooldownMs - (now - last))}.`,
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
        bonusPercent = streak * streakBonusPercent;
        bonus = Math.floor((base * bonusPercent) / 100);
      }
    }

    const amount = base + bonus;
    const claimedAt = new Date(now);
    const next = await writeUserEconomy(tx, guildId, userId, {
      ...current,
      wallet: current.wallet + amount,
      bank: current.bank,
      ...(type === "daily"
        ? { dailyStreak: streak, lastDailyAt: claimedAt }
        : type === "weekly"
          ? { lastWeeklyAt: claimedAt }
          : { lastMonthlyAt: claimedAt }),
    });

    return {
      type,
      amount,
      streak: type === "daily" ? streak : 0,
      base,
      bonus,
      bonusPercent,
      wallet: next.wallet,
      bank: next.bank,
    };
  });
}

/** @deprecated Usar `claimFixedIncome(..., "daily", ...)`. */
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
