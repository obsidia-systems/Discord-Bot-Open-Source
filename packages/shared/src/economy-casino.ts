/** Configuración del Casino (coinflip, ruleta, blackjack). */

export interface EconomyCasinoCoinflipConfig {
  /** Multiplicador de ganancia (ej. 2.0 = 2x). */
  multiplier: number;
  /** Placeholders: `{payout}`, `{side}`, `{currency}`. */
  winMessage: string;
}

export interface EconomyCasinoRouletteConfig {
  colorMultiplier: number;
  greenMultiplier: number;
  numberMultiplier: number;
}

export interface EconomyCasinoBlackjackConfig {
  allowDoubleDown: boolean;
  /** Pago al sacar blackjack natural (ej. 2.5). */
  blackjackMultiplier: number;
}

export interface EconomyCasinoConfig {
  guildId: string;
  isActive: boolean;
  minBet: number;
  maxBet: number;
  coinflip: EconomyCasinoCoinflipConfig;
  roulette: EconomyCasinoRouletteConfig;
  blackjack: EconomyCasinoBlackjackConfig;
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
  guildId: string;
}>;

export function defaultCasinoCoinflip(): EconomyCasinoCoinflipConfig {
  return {
    multiplier: 2,
    winMessage: "¡La moneda cayó en {side} y ganaste {payout} {currency}!",
  };
}

export function defaultCasinoRoulette(): EconomyCasinoRouletteConfig {
  return {
    colorMultiplier: 2,
    greenMultiplier: 14,
    numberMultiplier: 36,
  };
}

export function defaultCasinoBlackjack(): EconomyCasinoBlackjackConfig {
  return {
    allowDoubleDown: true,
    blackjackMultiplier: 2.5,
  };
}

export function defaultEconomyCasinoConfig(
  guildId = "",
): EconomyCasinoConfig {
  return {
    guildId,
    isActive: false,
    minBet: 10,
    maxBet: 10_000,
    coinflip: defaultCasinoCoinflip(),
    roulette: defaultCasinoRoulette(),
    blackjack: defaultCasinoBlackjack(),
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
