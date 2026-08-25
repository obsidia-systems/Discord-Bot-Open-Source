/**
 * Mapeo de App Emojis de Discord para cartas del blackjack.
 *
 * Sustituye los placeholders `ID` por los snowflakes reales cuando
 * registres los emojis de aplicación (Discord Application Emojis).
 *
 * Uso previsto en embeds:
 *   `${CARD_EMOJIS.AS_SPADES} ${CARD_EMOJIS.TEN_HEARTS}`
 */

export type CardEmojiKey =
  | "AS_SPADES"
  | "AS_HEARTS"
  | "AS_DIAMONDS"
  | "AS_CLUBS"
  | "TWO_SPADES"
  | "TWO_HEARTS"
  | "TWO_DIAMONDS"
  | "TWO_CLUBS"
  | "THREE_SPADES"
  | "THREE_HEARTS"
  | "THREE_DIAMONDS"
  | "THREE_CLUBS"
  | "FOUR_SPADES"
  | "FOUR_HEARTS"
  | "FOUR_DIAMONDS"
  | "FOUR_CLUBS"
  | "FIVE_SPADES"
  | "FIVE_HEARTS"
  | "FIVE_DIAMONDS"
  | "FIVE_CLUBS"
  | "SIX_SPADES"
  | "SIX_HEARTS"
  | "SIX_DIAMONDS"
  | "SIX_CLUBS"
  | "SEVEN_SPADES"
  | "SEVEN_HEARTS"
  | "SEVEN_DIAMONDS"
  | "SEVEN_CLUBS"
  | "EIGHT_SPADES"
  | "EIGHT_HEARTS"
  | "EIGHT_DIAMONDS"
  | "EIGHT_CLUBS"
  | "NINE_SPADES"
  | "NINE_HEARTS"
  | "NINE_DIAMONDS"
  | "NINE_CLUBS"
  | "TEN_SPADES"
  | "TEN_HEARTS"
  | "TEN_DIAMONDS"
  | "TEN_CLUBS"
  | "JACK_SPADES"
  | "JACK_HEARTS"
  | "JACK_DIAMONDS"
  | "JACK_CLUBS"
  | "QUEEN_SPADES"
  | "QUEEN_HEARTS"
  | "QUEEN_DIAMONDS"
  | "QUEEN_CLUBS"
  | "KING_SPADES"
  | "KING_HEARTS"
  | "KING_DIAMONDS"
  | "KING_CLUBS"
  | "CARD_BACK";

/**
 * Placeholders listos para rellenar.
 * Formato Discord: `<:nombre:snowflake>` o `<a:nombre:snowflake>` (animado).
 */
export const CARD_EMOJIS: Record<CardEmojiKey, string> = {
  AS_SPADES: "<:as_spades:ID>",
  AS_HEARTS: "<:as_hearts:ID>",
  AS_DIAMONDS: "<:as_diamonds:ID>",
  AS_CLUBS: "<:as_clubs:ID>",
  TWO_SPADES: "<:two_spades:ID>",
  TWO_HEARTS: "<:two_hearts:ID>",
  TWO_DIAMONDS: "<:two_diamonds:ID>",
  TWO_CLUBS: "<:two_clubs:ID>",
  THREE_SPADES: "<:three_spades:ID>",
  THREE_HEARTS: "<:three_hearts:ID>",
  THREE_DIAMONDS: "<:three_diamonds:ID>",
  THREE_CLUBS: "<:three_clubs:ID>",
  FOUR_SPADES: "<:four_spades:ID>",
  FOUR_HEARTS: "<:four_hearts:ID>",
  FOUR_DIAMONDS: "<:four_diamonds:ID>",
  FOUR_CLUBS: "<:four_clubs:ID>",
  FIVE_SPADES: "<:five_spades:ID>",
  FIVE_HEARTS: "<:five_hearts:ID>",
  FIVE_DIAMONDS: "<:five_diamonds:ID>",
  FIVE_CLUBS: "<:five_clubs:ID>",
  SIX_SPADES: "<:six_spades:ID>",
  SIX_HEARTS: "<:six_hearts:ID>",
  SIX_DIAMONDS: "<:six_diamonds:ID>",
  SIX_CLUBS: "<:six_clubs:ID>",
  SEVEN_SPADES: "<:seven_spades:ID>",
  SEVEN_HEARTS: "<:seven_hearts:ID>",
  SEVEN_DIAMONDS: "<:seven_diamonds:ID>",
  SEVEN_CLUBS: "<:seven_clubs:ID>",
  EIGHT_SPADES: "<:eight_spades:ID>",
  EIGHT_HEARTS: "<:eight_hearts:ID>",
  EIGHT_DIAMONDS: "<:eight_diamonds:ID>",
  EIGHT_CLUBS: "<:eight_clubs:ID>",
  NINE_SPADES: "<:nine_spades:ID>",
  NINE_HEARTS: "<:nine_hearts:ID>",
  NINE_DIAMONDS: "<:nine_diamonds:ID>",
  NINE_CLUBS: "<:nine_clubs:ID>",
  TEN_SPADES: "<:ten_spades:ID>",
  TEN_HEARTS: "<:ten_hearts:ID>",
  TEN_DIAMONDS: "<:ten_diamonds:ID>",
  TEN_CLUBS: "<:ten_clubs:ID>",
  JACK_SPADES: "<:jack_spades:ID>",
  JACK_HEARTS: "<:jack_hearts:ID>",
  JACK_DIAMONDS: "<:jack_diamonds:ID>",
  JACK_CLUBS: "<:jack_clubs:ID>",
  QUEEN_SPADES: "<:queen_spades:ID>",
  QUEEN_HEARTS: "<:queen_hearts:ID>",
  QUEEN_DIAMONDS: "<:queen_diamonds:ID>",
  QUEEN_CLUBS: "<:queen_clubs:ID>",
  KING_SPADES: "<:king_spades:ID>",
  KING_HEARTS: "<:king_hearts:ID>",
  KING_DIAMONDS: "<:king_diamonds:ID>",
  KING_CLUBS: "<:king_clubs:ID>",
  CARD_BACK: "<:card_back:ID>",
};
