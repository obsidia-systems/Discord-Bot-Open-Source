import type {
  EconomyCasinoBlackjackConfig,
  EconomyCasinoCoinflipConfig,
  EconomyCasinoConfig,
  EconomyCasinoRouletteConfig,
  UpdateEconomyCasinoRequest,
} from "@adobos/shared";
import {
  clampCasinoBet,
  clampCasinoDeckCount,
  clampCasinoMultiplier,
  clampCasinoSeconds,
  defaultCasinoBlackjack,
  defaultCasinoCoinflip,
  defaultCasinoRoulette,
  defaultEconomyCasinoConfig,
} from "@adobos/shared";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { economyCasino, guildSettings } from "../../db/schema.js";
import { EconomyError } from "./service.js";

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

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function sanitizeCoinflip(raw: unknown): EconomyCasinoCoinflipConfig {
  const base = defaultCasinoCoinflip();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const row = raw as Record<string, unknown>;
  return {
    multiplier: clampCasinoMultiplier(Number(row.multiplier), base.multiplier),
    winMessage:
      typeof row.winMessage === "string" && row.winMessage.trim()
        ? row.winMessage.trim().slice(0, 500)
        : base.winMessage,
    allowDoubleOrNothing:
      typeof row.allowDoubleOrNothing === "boolean"
        ? row.allowDoubleOrNothing
        : base.allowDoubleOrNothing,
    cooldownSeconds: clampCasinoSeconds(
      Number(row.cooldownSeconds),
      base.cooldownSeconds,
    ),
  };
}

function sanitizeRoulette(raw: unknown): EconomyCasinoRouletteConfig {
  const base = defaultCasinoRoulette();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const row = raw as Record<string, unknown>;
  return {
    colorMultiplier: clampCasinoMultiplier(
      Number(row.colorMultiplier),
      base.colorMultiplier,
    ),
    greenMultiplier: clampCasinoMultiplier(
      Number(row.greenMultiplier),
      base.greenMultiplier,
    ),
    numberMultiplier: clampCasinoMultiplier(
      Number(row.numberMultiplier),
      base.numberMultiplier,
    ),
    bettingTimeSeconds: clampCasinoSeconds(
      Number(row.bettingTimeSeconds),
      base.bettingTimeSeconds,
    ),
    showNumberHistory:
      typeof row.showNumberHistory === "boolean"
        ? row.showNumberHistory
        : base.showNumberHistory,
  };
}

function sanitizeBlackjack(raw: unknown): EconomyCasinoBlackjackConfig {
  const base = defaultCasinoBlackjack();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const row = raw as Record<string, unknown>;
  return {
    allowDoubleDown:
      typeof row.allowDoubleDown === "boolean"
        ? row.allowDoubleDown
        : base.allowDoubleDown,
    blackjackMultiplier: clampCasinoMultiplier(
      Number(row.blackjackMultiplier),
      base.blackjackMultiplier,
    ),
    deckCount: clampCasinoDeckCount(row.deckCount, base.deckCount),
    standOnSoft17:
      typeof row.standOnSoft17 === "boolean"
        ? row.standOnSoft17
        : base.standOnSoft17,
  };
}

function rowToConfig(
  guildId: string,
  row: typeof economyCasino.$inferSelect | undefined,
): EconomyCasinoConfig {
  if (!row) return defaultEconomyCasinoConfig(guildId);
  return {
    guildId: row.guildId,
    isActive: row.isActive,
    minBet: row.minBet,
    maxBet: row.maxBet,
    coinflip: sanitizeCoinflip(parseJsonObject(row.coinflip)),
    roulette: sanitizeRoulette(parseJsonObject(row.roulette)),
    blackjack: sanitizeBlackjack(parseJsonObject(row.blackjack)),
  };
}

export function getEconomyCasinoConfig(guildId?: string): EconomyCasinoConfig {
  const id = resolveGuildId(guildId);
  const row = getDb()
    .select()
    .from(economyCasino)
    .where(eq(economyCasino.guildId, id))
    .get();
  return rowToConfig(id, row);
}

export function updateEconomyCasinoConfig(
  input: UpdateEconomyCasinoRequest,
): EconomyCasinoConfig {
  const id = resolveGuildId(input.guildId);
  ensureGuildRow(id);
  const current = getEconomyCasinoConfig(id);

  let minBet =
    typeof input.minBet === "number"
      ? clampCasinoBet(input.minBet, current.minBet)
      : current.minBet;
  let maxBet =
    typeof input.maxBet === "number"
      ? clampCasinoBet(input.maxBet, current.maxBet)
      : current.maxBet;
  if (maxBet < minBet) {
    const tmp = minBet;
    minBet = maxBet;
    maxBet = tmp;
  }

  const next: EconomyCasinoConfig = {
    guildId: id,
    isActive:
      typeof input.isActive === "boolean" ? input.isActive : current.isActive,
    minBet,
    maxBet,
    coinflip: sanitizeCoinflip({
      ...current.coinflip,
      ...(input.coinflip ?? {}),
    }),
    roulette: sanitizeRoulette({
      ...current.roulette,
      ...(input.roulette ?? {}),
    }),
    blackjack: sanitizeBlackjack({
      ...current.blackjack,
      ...(input.blackjack ?? {}),
    }),
  };

  const now = new Date();
  getDb()
    .insert(economyCasino)
    .values({
      guildId: id,
      isActive: next.isActive,
      minBet: next.minBet,
      maxBet: next.maxBet,
      coinflip: JSON.stringify(next.coinflip),
      roulette: JSON.stringify(next.roulette),
      blackjack: JSON.stringify(next.blackjack),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: economyCasino.guildId,
      set: {
        isActive: next.isActive,
        minBet: next.minBet,
        maxBet: next.maxBet,
        coinflip: JSON.stringify(next.coinflip),
        roulette: JSON.stringify(next.roulette),
        blackjack: JSON.stringify(next.blackjack),
        updatedAt: now,
      },
    })
    .run();

  return next;
}

/** Valida apuesta contra límites del casino (para slash stubs / juegos). */
export function assertCasinoBetAllowed(
  guildId: string,
  amount: number,
): EconomyCasinoConfig {
  const config = getEconomyCasinoConfig(guildId);
  if (!config.isActive) {
    throw new EconomyError(
      "⛔ El casino está desactivado en este servidor.",
      400,
      "CASINO_INACTIVE",
    );
  }
  const bet = Math.floor(amount);
  if (!Number.isFinite(bet) || bet < 1) {
    throw new EconomyError(
      "La apuesta debe ser un entero ≥ 1.",
      400,
      "INVALID_BET",
    );
  }
  if (bet < config.minBet || bet > config.maxBet) {
    throw new EconomyError(
      `La apuesta debe estar entre ${config.minBet.toLocaleString("es-MX")} y ${config.maxBet.toLocaleString("es-MX")}.`,
      400,
      "BET_OUT_OF_RANGE",
    );
  }
  return config;
}
