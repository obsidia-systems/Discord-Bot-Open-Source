import { describe, expect, it } from "vitest";
import {
  defaultCasinoBlackjack,
  defaultCasinoRoulette,
  defaultCasinoSlots,
  defaultEconomyCasinoConfig,
} from "./economy-casino.js";

describe("casino defaults", () => {
  it("verde paga como pleno (36x) y ruleta tiene cooldown", () => {
    const roulette = defaultCasinoRoulette();
    expect(roulette.greenMultiplier).toBe(36);
    expect(roulette.numberMultiplier).toBe(36);
    expect(roulette.cooldownSeconds).toBe(5);
  });

  it("el config por defecto incluye cooldown de ruleta", () => {
    expect(defaultEconomyCasinoConfig("g").roulette.cooldownSeconds).toBe(5);
  });

  it("blackjack permite split y slots tiene cooldown", () => {
    expect(defaultCasinoBlackjack().allowSplit).toBe(true);
    expect(defaultCasinoSlots().cooldownSeconds).toBe(5);
    expect(defaultEconomyCasinoConfig("g").slots.cooldownSeconds).toBe(5);
  });
});
