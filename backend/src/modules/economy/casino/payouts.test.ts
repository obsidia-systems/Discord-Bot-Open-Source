import { describe, expect, it } from "vitest";
import { evaluateHand, type PlayingCard } from "./cards.js";
import { blackjackCredit, coinflipPayout, resolveRouletteBet } from "./payouts.js";

function card(rank: PlayingCard["rank"]): PlayingCard {
  return { rank, suit: "hearts" };
}

describe("coinflipPayout", () => {
  it("2x con stake cobrado es even money", () => {
    expect(coinflipPayout(100, 2, true)).toBe(200);
    expect(coinflipPayout(100, 2, false)).toBe(0);
  });
});

describe("resolveRouletteBet", () => {
  it("verde y número 0 coinciden en el mismo bolsillo", () => {
    expect(resolveRouletteBet({ tipo: "verde", valorNumero: null, spun: 0 }).won).toBe(
      true,
    );
    expect(resolveRouletteBet({ tipo: "numero", valorNumero: 0, spun: 0 }).won).toBe(
      true,
    );
    expect(resolveRouletteBet({ tipo: "rojo", valorNumero: null, spun: 0 }).won).toBe(
      false,
    );
  });

  it("rojo 1 gana color y pierde pleno 2", () => {
    expect(resolveRouletteBet({ tipo: "rojo", valorNumero: null, spun: 1 }).won).toBe(
      true,
    );
    expect(resolveRouletteBet({ tipo: "numero", valorNumero: 2, spun: 1 }).won).toBe(
      false,
    );
  });
});

describe("blackjackCredit", () => {
  const natural = evaluateHand([card("A"), card("K")]);
  const twenty = evaluateHand([card("10"), card("10")]);
  const eighteen = evaluateHand([card("10"), card("8")]);
  const bust = evaluateHand([card("K"), card("Q"), card("5")]);

  it("natural 3:2 con multiplier 2.5", () => {
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

  it("win even money y push devuelven stake", () => {
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

  it("bust del jugador no paga", () => {
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
