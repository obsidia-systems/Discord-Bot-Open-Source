import { BoundedTtlMap } from "../cache/boundedTtlMap.js";

const EXPENSIVE_COMMANDS = new Set([
  "pokeinfo",
  "location",
  "leaderboard",
  "rank",
  "teambuilder",
  "weakness",
  "breeding",
  "counters",
  "sandwich",
]);

const generalHits = new BoundedTtlMap<string, number[]>(8_000, 60_000);
const expensiveHits = new BoundedTtlMap<string, number[]>(8_000, 60_000);

const GENERAL_WINDOW_MS = 10_000;
const GENERAL_MAX = 8;
const EXPENSIVE_WINDOW_MS = 30_000;
const EXPENSIVE_MAX = 3;

function takeSlot(
  map: BoundedTtlMap<string, number[]>,
  key: string,
  windowMs: number,
  max: number,
): boolean {
  const now = Date.now();
  const prev = (map.get(key) ?? []).filter((t) => now - t < windowMs);
  if (prev.length >= max) {
    map.set(key, prev);
    return false;
  }
  prev.push(now);
  map.set(key, prev);
  return true;
}

/** Rate limit por usuario (comandos caros más estrictos). */
export function allowChatCommand(userId: string, commandName: string): boolean {
  if (!takeSlot(generalHits, userId, GENERAL_WINDOW_MS, GENERAL_MAX)) {
    return false;
  }
  if (EXPENSIVE_COMMANDS.has(commandName)) {
    return takeSlot(expensiveHits, userId, EXPENSIVE_WINDOW_MS, EXPENSIVE_MAX);
  }
  return true;
}
