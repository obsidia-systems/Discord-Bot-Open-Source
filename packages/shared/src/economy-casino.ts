/** Configuración del Casino (coinflip, ruleta, blackjack). */

export interface EconomyCasinoCoinflipConfig {
  /** Multiplicador de ganancia (ej. 2.0 = 2x). */
  multiplier: number;
  /** Placeholders: `{payout}`, `{side}`, `{currency}`. */
  winMessage: string;
  /** @deprecated No hay segundo tiro en runtime; se conserva en JSON. */
  allowDoubleOrNothing: boolean;
  /** Segundos entre tiros por usuario. */
  cooldownSeconds: number;
}

export interface EconomyCasinoRouletteConfig {
  colorMultiplier: number;
  greenMultiplier: number;
  numberMultiplier: number;
  /** @deprecated No hay mesa en vivo; se conserva en JSON. */
  bettingTimeSeconds: number;
  /** Segundos entre `/roulette` por usuario. */
  cooldownSeconds: number;
  /** Muestra los últimos 5 números en el embed. */
  showNumberHistory: boolean;
}

/** Cantidad de barajas en el zapato de blackjack. */
export type EconomyCasinoDeckCount = 1 | 2 | 4 | 6 | 8;

export const CASINO_DECK_COUNTS: readonly EconomyCasinoDeckCount[] = [
  1, 2, 4, 6, 8,
] as const;

export interface EconomyCasinoBlackjackConfig {
  allowDoubleDown: boolean;
  /** Par de la misma figura + saldo para la segunda apuesta. */
  allowSplit: boolean;
  /** Pago al sacar blackjack natural (ej. 2.5). */
  blackjackMultiplier: number;
  deckCount: EconomyCasinoDeckCount;
  /** El crupier se planta en 17 suave (soft 17). */
  standOnSoft17: boolean;
}

export interface EconomyCasinoSlotsConfig {
  /** Segundos entre `/slots` por usuario. */
  cooldownSeconds: number;
}

export interface EconomyCasinoConfig {
  guildId: string;
  isActive: boolean;
  minBet: number;
  maxBet: number;
  coinflip: EconomyCasinoCoinflipConfig;
  roulette: EconomyCasinoRouletteConfig;
  blackjack: EconomyCasinoBlackjackConfig;
  slots: EconomyCasinoSlotsConfig;
}

export interface EconomyCasinoConfigResponse {
  config: EconomyCasinoConfig;
}

export type UpdateEconomyCasinoRequest = Partial<{
  isActive: boolean;
  minBet: number;
  maxBet: number;
  coinflip: Partial<EconomyCasinoCoinflipConfig>;
  roulette: Partial<EconomyCasinoRouletteConfig>;
  blackjack: Partial<EconomyCasinoBlackjackConfig>;
  slots: Partial<EconomyCasinoSlotsConfig>;
  guildId: string;
}>;

export function defaultCasinoCoinflip(): EconomyCasinoCoinflipConfig {
  return {
    multiplier: 2,
    winMessage: "¡La moneda cayó en {side} y ganaste {payout} {currency}!",
    allowDoubleOrNothing: false,
    cooldownSeconds: 5,
  };
}

export function defaultCasinoRoulette(): EconomyCasinoRouletteConfig {
  return {
    colorMultiplier: 2,
    /** Mismo bolsillo que el pleno (0): 35:1 con stake cobrado = 36x. */
    greenMultiplier: 36,
    numberMultiplier: 36,
    bettingTimeSeconds: 30,
    cooldownSeconds: 5,
    showNumberHistory: true,
  };
}

export function defaultCasinoBlackjack(): EconomyCasinoBlackjackConfig {
  return {
    allowDoubleDown: true,
    allowSplit: true,
    blackjackMultiplier: 2.5,
    deckCount: 6,
    standOnSoft17: true,
  };
}

export function defaultCasinoSlots(): EconomyCasinoSlotsConfig {
  return {
    cooldownSeconds: 5,
  };
}

export function defaultEconomyCasinoConfig(guildId = ""): EconomyCasinoConfig {
  return {
    guildId,
    isActive: false,
    minBet: 10,
    maxBet: 10_000,
    coinflip: defaultCasinoCoinflip(),
    roulette: defaultCasinoRoulette(),
    blackjack: defaultCasinoBlackjack(),
    slots: defaultCasinoSlots(),
  };
}

export function clampCasinoBet(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

export function clampCasinoMultiplier(value: number, fallback = 1): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(1000, Math.round(value * 100) / 100);
}

/** Segundos de cooldown / ventana de apuestas (0–3600). */
export function clampCasinoSeconds(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(3600, Math.floor(value)));
}

export function clampCasinoDeckCount(
  value: unknown,
  fallback: EconomyCasinoDeckCount = 6,
): EconomyCasinoDeckCount {
  const n = typeof value === "number" ? value : Number(value);
  return (CASINO_DECK_COUNTS as readonly number[]).includes(n)
    ? (n as EconomyCasinoDeckCount)
    : fallback;
}
