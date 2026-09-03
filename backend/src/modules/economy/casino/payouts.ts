import type { HandEvaluation } from "./cards.js";
import { rouletteColor, type RouletteColor } from "./roulette.js";

export type CoinflipSide = "heads" | "tails";

export function coinflipPayout(
  bet: number,
  multiplier: number,
  won: boolean,
): number {
  if (!won) return 0;
  return Math.floor(bet * multiplier);
}

export type RouletteBetType = "red" | "black" | "green" | "number";

export function resolveRouletteBet(input: {
  type: RouletteBetType;
  numberValue: number | null | undefined;
  spun: number;
}): { won: boolean; color: RouletteColor } {
  const color = rouletteColor(input.spun);
  if (input.type === "number") {
    return { won: input.spun === input.numberValue, color };
  }
  if (input.type === "green") {
    return { won: color === "green", color };
  }
  return { won: color === input.type, color };
}

export type BlackjackOutcome = "win" | "lose" | "push" | "blackjack";

/**
 * Importe a acreditar con el stake ya cobrado:
 * natural → floor(bet × multiplier); win → 2×; push → stake; lose → 0.
 */
export function blackjackCredit(input: {
  player: HandEvaluation;
  dealer: HandEvaluation;
  bet: number;
  naturalMultiplier: number;
  wasNaturalWin: boolean;
}): { outcome: BlackjackOutcome; credit: number } {
  const bet = Math.max(0, Math.floor(input.bet));
  if (input.wasNaturalWin) {
    return {
      outcome: "blackjack",
      credit: Math.floor(bet * input.naturalMultiplier),
    };
  }
  if (input.player.isBust) {
    return { outcome: "lose", credit: 0 };
  }
  if (input.dealer.isBust || input.player.total > input.dealer.total) {
    return { outcome: "win", credit: bet * 2 };
  }
  if (input.player.total < input.dealer.total) {
    return { outcome: "lose", credit: 0 };
  }
  return { outcome: "push", credit: bet };
}
