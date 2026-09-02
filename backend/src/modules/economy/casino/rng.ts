import { randomInt } from "node:crypto";

/** Cara o cruz uniforme (CSPRNG). */
export function flipCoin(): "cara" | "cruz" {
  return randomInt(2) === 0 ? "cara" : "cruz";
}

/** Entero uniforme en [0, maxExclusive). */
export function randomBelow(maxExclusive: number): number {
  const n = Math.floor(maxExclusive);
  if (n < 1) throw new Error("randomBelow: maxExclusive debe ser ≥ 1");
  return randomInt(n);
}

/** Entero uniforme en [min, max] inclusive. */
export function randomInclusive(min: number, max: number): number {
  const a = Math.floor(min);
  const b = Math.floor(max);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return lo + randomBelow(hi - lo + 1);
}

/** Índice ponderado (pesos > 0). */
export function pickWeighted(weights: readonly number[]): number {
  const total = weights.reduce((sum, w) => sum + Math.max(0, Math.floor(w)), 0);
  if (total < 1) throw new Error("pickWeighted: suma de pesos debe ser ≥ 1");
  let roll = randomBelow(total);
  for (let i = 0; i < weights.length; i++) {
    roll -= Math.max(0, Math.floor(weights[i]!));
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

export function pickRandom<T>(items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error("pickRandom: lista vacía");
  }
  return items[randomBelow(items.length)]!;
}
