import { describe, expect, it } from "vitest";
import {
  defaultCasinoBlackjack,
  defaultCasinoRoulette,
  defaultCasinoSlots,
  defaultEconomyCasinoConfig,
} from "./economy-casino.js";

describe("casino defaults", () => {
  it("green pays like a straight (36x) and roulette has a cooldown", () => {
    const roulette = defaultCasinoRoulette();
    expect(roulette.greenMultiplier).toBe(36);
    expect(roulette.numberMultiplier).toBe(36);
    expect(roulette.cooldownSeconds).toBe(5);
  });

  it("the default config includes a roulette cooldown", () => {
    expect(defaultEconomyCasinoConfig("g").roulette.cooldownSeconds).toBe(5);
  });

  it("blackjack allows split and slots has a cooldown", () => {
    expect(defaultCasinoBlackjack().allowSplit).toBe(true);
    expect(defaultCasinoSlots().cooldownSeconds).toBe(5);
    expect(defaultEconomyCasinoConfig("g").slots.cooldownSeconds).toBe(5);
  });
});
