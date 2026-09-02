import { randomBelow } from "./rng.js";

/** Cartas y evaluación de manos para blackjack. */

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export interface PlayingCard {
  rank: Rank;
  suit: Suit;
}

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS: Rank[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

const SUIT_EMOJI: Record<Suit, string> = {
  spades: "♠️",
  hearts: "♥️",
  diamonds: "♦️",
  clubs: "♣️",
};

export function createShoe(deckCount: number): PlayingCard[] {
  const decks = Math.max(1, Math.min(8, Math.floor(deckCount) || 1));
  const shoe: PlayingCard[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        shoe.push({ rank, suit });
      }
    }
  }
  return shoe;
}

/** Fisher–Yates in-place shuffle (CSPRNG, sin sesgo). */
export function shuffleDeck(deck: PlayingCard[]): PlayingCard[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    const tmp = deck[i]!;
    deck[i] = deck[j]!;
    deck[j] = tmp;
  }
  return deck;
}

export function drawCard(deck: PlayingCard[]): PlayingCard {
  const card = deck.pop();
  if (!card) {
    throw new Error("El mazo se quedó sin cartas.");
  }
  return card;
}

export function cardValue(rank: Rank): number {
  if (rank === "A") return 11;
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  return Number(rank);
}

export interface HandEvaluation {
  total: number;
  soft: boolean;
  isBlackjack: boolean;
  isBust: boolean;
}

export function evaluateHand(cards: PlayingCard[]): HandEvaluation {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardValue(card.rank);
    if (card.rank === "A") aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  const soft = aces > 0 && total <= 21;
  return {
    total,
    soft,
    isBlackjack: cards.length === 2 && total === 21,
    isBust: total > 21,
  };
}

/** El crupier debe pedir otra carta. */
export function dealerShouldHit(
  cards: PlayingCard[],
  standOnSoft17: boolean,
): boolean {
  const { total, soft } = evaluateHand(cards);
  if (total < 17) return true;
  if (total === 17 && soft && !standOnSoft17) return true;
  return false;
}

export function formatCard(card: PlayingCard): string {
  return `${card.rank}${SUIT_EMOJI[card.suit]}`;
}

export function formatHand(cards: PlayingCard[], hideHole = false): string {
  if (cards.length === 0) return "—";
  if (hideHole && cards.length >= 2) {
    return `${formatCard(cards[0]!)} 🂠`;
  }
  return cards.map(formatCard).join(" ");
}

/** Par inicial: dos cartas de la misma figura (no 10+J). */
export function isSplitPair(cards: PlayingCard[]): boolean {
  return cards.length === 2 && cards[0]!.rank === cards[1]!.rank;
}

/** Corte del zapato: queda menos del 25% de las cartas. */
export function shoeNeedsReshuffle(
  remaining: number,
  deckCount: number,
): boolean {
  const full = 52 * Math.max(1, Math.floor(deckCount) || 1);
  return remaining < Math.ceil(full * 0.25);
}
