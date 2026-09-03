import { describe, expect, it } from "vitest";
import {
  createShoe,
  dealerShouldHit,
  evaluateHand,
  isSplitPair,
  type PlayingCard,
  shoeNeedsReshuffle,
} from "./cards.js";

function card(
  rank: PlayingCard["rank"],
  suit: PlayingCard["suit"] = "spades",
): PlayingCard {
  return { rank, suit };
}

describe("evaluateHand", () => {
  it("natural is A+10 in two cards", () => {
    const bj = evaluateHand([card("A"), card("K")]);
    expect(bj.total).toBe(21);
    expect(bj.isBlackjack).toBe(true);
    expect(bj.soft).toBe(true);
  });

  it("A+5+5 is 21 but not blackjack", () => {
    const hand = evaluateHand([card("A"), card("5"), card("5")]);
    expect(hand.total).toBe(21);
    expect(hand.isBlackjack).toBe(false);
  });

  it("lowers the ace when it busts", () => {
    const hand = evaluateHand([card("A"), card("9"), card("K")]);
    expect(hand.total).toBe(20);
    expect(hand.isBust).toBe(false);
    expect(hand.soft).toBe(false);
  });
});

describe("dealerShouldHit", () => {
  it("S17: stands on soft 17", () => {
    expect(dealerShouldHit([card("A"), card("6")], true)).toBe(false);
  });

  it("H17: hits on soft 17", () => {
    expect(dealerShouldHit([card("A"), card("6")], false)).toBe(true);
  });

  it("hits below 17", () => {
    expect(dealerShouldHit([card("10"), card("6")], true)).toBe(true);
  });
});

describe("createShoe", () => {
  it("6 decks are 312 cards", () => {
    expect(createShoe(6)).toHaveLength(312);
  });
});

describe("isSplitPair", () => {
  it("accepts 10-10 and rejects 10-J", () => {
    expect(isSplitPair([card("10"), card("10")])).toBe(true);
    expect(isSplitPair([card("10"), card("J")])).toBe(false);
    expect(isSplitPair([card("A"), card("A")])).toBe(true);
  });
});

describe("shoeNeedsReshuffle", () => {
  it("cuts at 25%", () => {
    expect(shoeNeedsReshuffle(77, 6)).toBe(true);
    expect(shoeNeedsReshuffle(78, 6)).toBe(false);
  });
});
