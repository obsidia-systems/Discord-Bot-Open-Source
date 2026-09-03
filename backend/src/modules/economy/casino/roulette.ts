import { randomBelow } from "./rng.js";

/** Ruleta europea (0–36) y colores estándar. */

export type RouletteColor = "green" | "red" | "black";

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export function spinEuropeanRoulette(): number {
  return randomBelow(37);
}

export function rouletteColor(number: number): RouletteColor {
  if (number === 0) return "green";
  return RED_NUMBERS.has(number) ? "red" : "black";
}

export function rouletteColorEmoji(color: RouletteColor): string {
  if (color === "green") return "🟢";
  if (color === "red") return "🔴";
  return "⚫";
}

/** Historial en memoria de los últimos 5 números por guild. */
const historyByGuild = new Map<string, number[]>();

export function pushRouletteHistory(guildId: string, number: number): number[] {
  const prev = historyByGuild.get(guildId) ?? [];
  const next = [number, ...prev].slice(0, 5);
  historyByGuild.set(guildId, next);
  return next;
}

export function getRouletteHistory(guildId: string): number[] {
  return historyByGuild.get(guildId) ?? [];
}
