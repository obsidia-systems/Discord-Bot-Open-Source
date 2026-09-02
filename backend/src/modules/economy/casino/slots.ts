import { pickWeighted } from "./rng.js";

/** Tres rodillos, pago izquierda→derecha. Stake ya cobrado. */

export interface SlotSymbol {
  id: string;
  emoji: string;
  weight: number;
  /** Crédito = floor(bet × triple) si coinciden los 3. */
  triple: number;
}

export const SLOT_SYMBOLS: readonly SlotSymbol[] = [
  { id: "cherry", emoji: "🍒", weight: 36, triple: 3 },
  { id: "lemon", emoji: "🍋", weight: 28, triple: 4 },
  { id: "orange", emoji: "🍊", weight: 20, triple: 5 },
  { id: "grape", emoji: "🍇", weight: 14, triple: 8 },
  { id: "bell", emoji: "🔔", weight: 10, triple: 12 },
  { id: "star", emoji: "⭐", weight: 6, triple: 20 },
  { id: "seven", emoji: "7️⃣", weight: 4, triple: 40 },
  { id: "diamond", emoji: "💎", weight: 2, triple: 80 },
] as const;

/** Par: 2 de 3 iguales (crédito = floor(bet × 1.7) ≈ RTP 94%). */
export const SLOT_PAIR_MULTIPLIER = 1.7;

export interface SlotSpinResult {
  reels: [SlotSymbol, SlotSymbol, SlotSymbol];
  /** Multiplicador de crédito (0 = pérdida). */
  multiplier: number;
}

function pickSymbol(): SlotSymbol {
  const index = pickWeighted(SLOT_SYMBOLS.map((s) => s.weight));
  return SLOT_SYMBOLS[index]!;
}

export function spinSlots(): SlotSpinResult {
  const a = pickSymbol();
  const b = pickSymbol();
  const c = pickSymbol();
  let multiplier = 0;
  if (a.id === b.id && b.id === c.id) {
    multiplier = a.triple;
  } else if (a.id === b.id || b.id === c.id || a.id === c.id) {
    multiplier = SLOT_PAIR_MULTIPLIER;
  }
  return { reels: [a, b, c], multiplier };
}

export function slotsCredit(bet: number, multiplier: number): number {
  if (multiplier <= 0) return 0;
  return Math.floor(bet * multiplier);
}

/**
 * Retorno teórico (crédito / apuesta). Tres rodillos independientes.
 * Casa ≈ 1 − este valor (~5.6% con la tabla actual).
 */
export function slotsExpectedReturn(): number {
  const total = SLOT_SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
  let ev = 0;
  for (const s of SLOT_SYMBOLS) {
    const p = s.weight / total;
    ev += p ** 3 * s.triple;
    ev += 3 * p * p * (1 - p) * SLOT_PAIR_MULTIPLIER;
  }
  return ev;
}
