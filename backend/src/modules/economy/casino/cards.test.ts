import { describe, expect, it } from "vitest";
import {
  createShoe,
  dealerShouldHit,
  evaluateHand,
  isSplitPair,
  shoeNeedsReshuffle,
  type PlayingCard,
} from "./cards.js";

function card(rank: PlayingCard["rank"], suit: PlayingCard["suit"] = "spades"): PlayingCard {
  return { rank, suit };
}

describe("evaluateHand", () => {
  it("natural es A+10 en dos cartas", () => {
    const bj = evaluateHand([card("A"), card("K")]);
    expect(bj.total).toBe(21);
    expect(bj.isBlackjack).toBe(true);
    expect(bj.soft).toBe(true);
  });

  it("A+5+5 es 21 pero no blackjack", () => {
    const hand = evaluateHand([card("A"), card("5"), card("5")]);
    expect(hand.total).toBe(21);
    expect(hand.isBlackjack).toBe(false);
  });

  it("baja el as cuando se pasa", () => {
    const hand = evaluateHand([card("A"), card("9"), card("K")]);
    expect(hand.total).toBe(20);
    expect(hand.isBust).toBe(false);
    expect(hand.soft).toBe(false);
  });
});

describe("dealerShouldHit", () => {
  it("S17: se planta en 17 suave", () => {
    expect(dealerShouldHit([card("A"), card("6")], true)).toBe(false);
  });

  it("H17: pide en 17 suave", () => {
    expect(dealerShouldHit([card("A"), card("6")], false)).toBe(true);
  });

  it("pide por debajo de 17", () => {
    expect(dealerShouldHit([card("10"), card("6")], true)).toBe(true);
  });
});

describe("createShoe", () => {
  it("6 barajas son 312 cartas", () => {
    expect(createShoe(6)).toHaveLength(312);
  });
});

describe("isSplitPair", () => {
  it("acepta 10-10 y rechaza 10-J", () => {
    expect(isSplitPair([card("10"), card("10")])).toBe(true);
    expect(isSplitPair([card("10"), card("J")])).toBe(false);
    expect(isSplitPair([card("A"), card("A")])).toBe(true);
  });
});

describe("shoeNeedsReshuffle", () => {
  it("corta al 25%", () => {
    expect(shoeNeedsReshuffle(77, 6)).toBe(true);
    expect(shoeNeedsReshuffle(78, 6)).toBe(false);
  });
});
