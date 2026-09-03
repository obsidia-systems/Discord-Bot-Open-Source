import { describe, expect, it } from "vitest";
import { evaluateHand, type PlayingCard } from "./cards.js";
import { blackjackCredit, coinflipPayout, resolveRouletteBet } from "./payouts.js";

function card(rank: PlayingCard["rank"]): PlayingCard {
  return { rank, suit: "hearts" };
}

describe("coinflipPayout", () => {
  it("2x with charged stake is even money", () => {
    expect(coinflipPayout(100, 2, true)).toBe(200);
    expect(coinflipPayout(100, 2, false)).toBe(0);
  });
});

describe("resolveRouletteBet", () => {
  it("green and number 0 land in the same pocket", () => {
    expect(resolveRouletteBet({ type: "green", numberValue: null, spun: 0 }).won).toBe(
      true,
    );
    expect(resolveRouletteBet({ type: "number", numberValue: 0, spun: 0 }).won).toBe(
      true,
    );
    expect(resolveRouletteBet({ type: "red", numberValue: null, spun: 0 }).won).toBe(
      false,
    );
  });

  it("red 1 wins color and loses straight 2", () => {
    expect(resolveRouletteBet({ type: "red", numberValue: null, spun: 1 }).won).toBe(
      true,
    );
    expect(resolveRouletteBet({ type: "number", numberValue: 2, spun: 1 }).won).toBe(
      false,
    );
  });
});

describe("blackjackCredit", () => {
  const natural = evaluateHand([card("A"), card("K")]);
  const twenty = evaluateHand([card("10"), card("10")]);
  const eighteen = evaluateHand([card("10"), card("8")]);
  const bust = evaluateHand([card("K"), card("Q"), card("5")]);

  it("natural 3:2 with multiplier 2.5", () => {
    expect(
      blackjackCredit({
        player: natural,
        dealer: twenty,
        bet: 100,
        naturalMultiplier: 2.5,
        wasNaturalWin: true,
      }),
    ).toEqual({ outcome: "blackjack", credit: 250 });
  });

  it("win even money and push return stake", () => {
    expect(
      blackjackCredit({
        player: twenty,
        dealer: eighteen,
        bet: 100,
        naturalMultiplier: 2.5,
        wasNaturalWin: false,
      }),
    ).toEqual({ outcome: "win", credit: 200 });
    expect(
      blackjackCredit({
        player: twenty,
        dealer: twenty,
        bet: 100,
        naturalMultiplier: 2.5,
        wasNaturalWin: false,
      }),
    ).toEqual({ outcome: "push", credit: 100 });
  });

  it("player bust pays nothing", () => {
    expect(
      blackjackCredit({
        player: bust,
        dealer: eighteen,
        bet: 50,
        naturalMultiplier: 2.5,
        wasNaturalWin: false,
      }),
    ).toEqual({ outcome: "lose", credit: 0 });
  });
});
