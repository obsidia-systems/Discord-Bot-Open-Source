import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type Client,
  EmbedBuilder,
} from "discord.js";
import { logger } from "#core/log.js";
import { consumeInteractionEphemeral } from "#modules/system-commands/ephemeral.js";
import {
  createShoe,
  dealerShouldHit,
  drawCard,
  evaluateHand,
  formatHand,
  isSplitPair,
  type PlayingCard,
  shoeNeedsReshuffle,
  shuffleDeck,
} from "../casino/cards.js";
import { blackjackCredit } from "../casino/payouts.js";
import {
  closeBlackjackStake,
  openBlackjackStake,
  raiseBlackjackStake,
  refundBlackjackStakeIfOpen,
} from "../funds.js";
import { EconomyError, getUserEconomyBalance } from "../service.js";
import {
  assertEconomyAndCasino,
  clearMessageComponents,
  currencyOf,
  INFO,
  LOSE,
  PUSH,
  parseOwnerCustomId,
  playAgainRow,
  replyCasinoError,
  TABLE_IDLE_MS,
  tableKey,
  WIN,
} from "./casinoCommon.js";
import { EPHEMERAL, visibility } from "./visibility.js";

export const BJ_BUTTON_PREFIX = "bj_";

const BJ_HIT = "bj_hit";
const BJ_STAND = "bj_stand";
const BJ_DOUBLE = "bj_double";
const BJ_SPLIT = "bj_split";
const BJ_AGAIN = "bj_again";

const BJ_HAND_TIMEOUT_MS = 60_000;

interface BjHand {
  cards: PlayingCard[];
  bet: number;
}

interface BlackjackSession {
  client: Client;
  guildId: string;
  userId: string;
  channelId: string;
  messageId: string;
  bet: number;
  /** Apuesta de mesa (slash / play again); `bet` sube al doblar. */
  ante: number;
  deck: PlayingCard[];
  deckCount: number;
  dealer: PlayingCard[];
  hands: BjHand[];
  current: number;
  currency: string;
  naturalMultiplier: number;
  standOnSoft17: boolean;
  allowDoubleDown: boolean;
  allowSplit: boolean;
  splitUsed: boolean;
  phase: "play" | "idle";
  busy: boolean;
  timeout: ReturnType<typeof setTimeout>;
  naturalWallet?: number;
  naturalTitle?: string;
  naturalColor?: number;
  naturalFooter?: string;
}

const sessions = new Map<string, BlackjackSession>();

function clearSession(key: string): void {
  const session = sessions.get(key);
  if (!session) return;
  clearTimeout(session.timeout);
  sessions.delete(key);
}

function armTimeout(
  session: BlackjackSession,
  ms: number,
  fn: () => void,
): void {
  clearTimeout(session.timeout);
  session.timeout = setTimeout(fn, ms);
}

function ensureShoe(session: BlackjackSession): void {
  if (shoeNeedsReshuffle(session.deck.length, session.deckCount)) {
    session.deck = shuffleDeck(createShoe(session.deckCount));
  }
}

function currentHand(session: BlackjackSession): BjHand {
  return session.hands[session.current]!;
}

function canSplit(session: BlackjackSession, wallet: number): boolean {
  if (!session.allowSplit || session.splitUsed || session.hands.length !== 1) {
    return false;
  }
  const hand = session.hands[0]!;
  return isSplitPair(hand.cards) && wallet >= hand.bet;
}

function canDouble(session: BlackjackSession, wallet: number): boolean {
  const hand = currentHand(session);
  return (
    session.allowDoubleDown &&
    !session.splitUsed &&
    session.hands.length === 1 &&
    hand.cards.length === 2 &&
    wallet >= hand.bet
  );
}

function blackjackButtons(
  session: BlackjackSession,
  wallet: number,
): ActionRowBuilder<ButtonBuilder>[] {
  const userId = session.userId;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BJ_HIT}:${userId}`)
      .setLabel("Hit")
      .setEmoji("🃏")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${BJ_STAND}:${userId}`)
      .setLabel("Stand")
      .setEmoji("🛑")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${BJ_DOUBLE}:${userId}`)
      .setLabel("Double")
      .setEmoji("💰")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canDouble(session, wallet)),
  );
  if (session.allowSplit) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${BJ_SPLIT}:${userId}`)
        .setLabel("Split")
        .setEmoji("✂️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!canSplit(session, wallet)),
    );
  }
  return [row];
}

function idleComponents(userId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [playAgainRow(`${BJ_AGAIN}:${userId}`, "New hand")];
}

type BjOutcome = "win" | "lose" | "push" | "blackjack";

function blackjackTitle(
  outcome: BjOutcome,
  playerBust: boolean,
  dealerBust: boolean,
): string {
  if (outcome === "blackjack") return "🃏 Blackjack — Natural!";
  if (outcome === "push") return "🃏 Blackjack — Push";
  if (outcome === "lose") {
    return playerBust ? "🃏 Blackjack — Bust" : "🃏 Blackjack — You lost";
  }
  return dealerBust
    ? "🃏 Blackjack — The dealer busted"
    : "🃏 Blackjack — You won!";
}

function buildBlackjackEmbed(input: {
  title: string;
  color: number;
  hands: BjHand[];
  current: number;
  dealer: PlayingCard[];
  hideDealerHole: boolean;
  currency: string;
  wallet: number;
  footer?: string;
  highlightCurrent?: boolean;
}): EmbedBuilder {
  const dealerEval = evaluateHand(input.dealer);
  const dealerTotal = input.hideDealerHole
    ? evaluateHand([input.dealer[0]!]).total
    : dealerEval.total;

  const fields = input.hands.map((hand, index) => {
    const ev = evaluateHand(hand.cards);
    const marker =
      input.highlightCurrent &&
      input.hands.length > 1 &&
      index === input.current
        ? " ◀"
        : "";
    const label =
      input.hands.length > 1
        ? `Hand ${index + 1} · ${ev.total}${marker}`
        : `You · ${ev.total}`;
    return {
      name: label,
      value: `${formatHand(hand.cards)}\nBet: **${hand.bet.toLocaleString("es-MX")}** ${input.currency}`,
      inline: false,
    };
  });

  return new EmbedBuilder()
    .setColor(input.color)
    .setTitle(input.title)
    .addFields(
      ...fields,
      {
        name: input.hideDealerHole
          ? `Dealer · ${dealerTotal}+`
          : `Dealer · ${dealerEval.total}`,
        value: formatHand(input.dealer, input.hideDealerHole),
        inline: false,
      },
      {
        name: "Wallet",
        value: `**${input.wallet.toLocaleString("es-MX")}** ${input.currency}`,
        inline: true,
      },
    )
    .setFooter(
      input.footer
        ? { text: input.footer }
        : { text: "You have 60s for this hand" },
    );
}

function playDealer(
  deck: PlayingCard[],
  dealerHand: PlayingCard[],
  standOnSoft17: boolean,
): PlayingCard[] {
  const hand = [...dealerHand];
  while (dealerShouldHit(hand, standOnSoft17)) {
    hand.push(drawCard(deck));
  }
  return hand;
}

function anyHandAlive(hands: BjHand[]): boolean {
  return hands.some((h) => !evaluateHand(h.cards).isBust);
}

async function settleSession(session: BlackjackSession): Promise<{
  title: string;
  color: number;
  wallet: number;
  footer: string;
}> {
  const dealer = evaluateHand(session.dealer);
  let credit = 0;
  const labels: string[] = [];

  for (const hand of session.hands) {
    const player = evaluateHand(hand.cards);
    const settled = blackjackCredit({
      player,
      dealer,
      bet: hand.bet,
      naturalMultiplier: session.naturalMultiplier,
      wasNaturalWin: false,
    });
    credit += settled.credit;
    labels.push(
      session.hands.length > 1
        ? `${settled.outcome} ${settled.credit.toLocaleString("es-MX")}`
        : settled.outcome,
    );
  }

  const { wallet } = await closeBlackjackStake(
    session.guildId,
    session.userId,
    credit,
  );

  if (session.hands.length === 1) {
    const player = evaluateHand(session.hands[0]!.cards);
    const settled = blackjackCredit({
      player,
      dealer,
      bet: session.hands[0]!.bet,
      naturalMultiplier: session.naturalMultiplier,
      wasNaturalWin: false,
    });
    const dealerBust = dealer.isBust && !player.isBust;
    return {
      title: blackjackTitle(settled.outcome, player.isBust, dealerBust),
      color:
        settled.outcome === "lose"
          ? LOSE
          : settled.outcome === "push"
            ? PUSH
            : WIN,
      wallet,
      footer:
        settled.outcome === "lose"
          ? `−${session.hands[0]!.bet.toLocaleString("es-MX")} ${session.currency}`
          : settled.outcome === "push"
            ? `Reembolso ${credit.toLocaleString("es-MX")} ${session.currency}`
            : `+${credit.toLocaleString("es-MX")} ${session.currency}`,
    };
  }

  const net =
    credit >= session.hands.reduce((s, h) => s + h.bet, 0) ? WIN : LOSE;
  return {
    title: "🃏 Blackjack — Split hands",
    color: credit === 0 ? LOSE : net,
    wallet,
    footer: labels.join(" · "),
  };
}

async function revealAndIdle(
  session: BlackjackSession,
  via: ButtonInteraction | null,
): Promise<void> {
  if (anyHandAlive(session.hands)) {
    session.dealer = playDealer(
      session.deck,
      session.dealer,
      session.standOnSoft17,
    );
  }
  const settled = await settleSession(session);
  session.phase = "idle";
  const payload = {
    embeds: [
      buildBlackjackEmbed({
        title: settled.title,
        color: settled.color,
        hands: session.hands,
        current: session.current,
        dealer: session.dealer,
        hideDealerHole: false,
        currency: session.currency,
        wallet: settled.wallet,
        footer: settled.footer,
        highlightCurrent: false,
      }),
    ],
    components: idleComponents(session.userId),
  };
  armIdle(session);

  if (via && !via.replied && !via.deferred) {
    await via.update(payload);
    return;
  }
  try {
    const channel = await session.client.channels.fetch(session.channelId);
    if (channel?.isTextBased() && "messages" in channel) {
      const msg = await channel.messages.fetch(session.messageId);
      await msg.edit(payload);
    }
  } catch {
    /* mensaje ya no disponible */
  }
}

function armIdle(session: BlackjackSession): void {
  const key = tableKey(session.guildId, session.userId);
  armTimeout(session, TABLE_IDLE_MS, () => {
    void (async () => {
      const current = sessions.get(key);
      if (!current || current.phase !== "idle") return;
      await clearMessageComponents(current);
      clearSession(key);
    })();
  });
}

function armHandTimeout(session: BlackjackSession): void {
  const key = tableKey(session.guildId, session.userId);
  armTimeout(session, BJ_HAND_TIMEOUT_MS, () => {
    void (async () => {
      const current = sessions.get(key);
      if (!current || current.phase !== "play") return;
      if (current.busy) {
        armHandTimeout(current);
        return;
      }
      try {
        current.busy = true;
        await revealAndIdle(current, null);
      } catch (error) {
        logger.error({ err: error }, "blackjack timeout:");
        clearSession(key);
      } finally {
        current.busy = false;
      }
    })();
  });
}

async function dealInto(
  session: BlackjackSession,
): Promise<"natural" | "play"> {
  ensureShoe(session);
  session.hands = [
    {
      cards: [drawCard(session.deck), drawCard(session.deck)],
      bet: session.bet,
    },
  ];
  session.dealer = [drawCard(session.deck), drawCard(session.deck)];
  session.current = 0;
  session.splitUsed = false;

  const playerEval = evaluateHand(session.hands[0]!.cards);
  const dealerEval = evaluateHand(session.dealer);
  if (playerEval.isBlackjack || dealerEval.isBlackjack) {
    let credit = 0;
    let title = "";
    let color = LOSE;
    let footer = "";
    if (playerEval.isBlackjack && dealerEval.isBlackjack) {
      credit = session.bet;
      title = "🃏 Blackjack — Push";
      color = PUSH;
      footer = `Refund ${session.bet.toLocaleString("es-MX")} ${session.currency}`;
    } else if (playerEval.isBlackjack) {
      credit = Math.floor(session.bet * session.naturalMultiplier);
      title = "🃏 Blackjack — Natural!";
      color = WIN;
      footer = `+${credit.toLocaleString("es-MX")} ${session.currency}`;
    } else {
      credit = 0;
      title = "🃏 Blackjack — The dealer has a natural";
      color = LOSE;
      footer = `−${session.bet.toLocaleString("es-MX")} ${session.currency}`;
    }
    const { wallet } = await closeBlackjackStake(
      session.guildId,
      session.userId,
      credit,
    );
    session.phase = "idle";
    session.naturalWallet = wallet;
    session.naturalTitle = title;
    session.naturalColor = color;
    session.naturalFooter = footer;
    return "natural";
  }
  session.phase = "play";
  return "play";
}

async function startHand(session: BlackjackSession): Promise<{
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}> {
  await refundBlackjackStakeIfOpen(session.guildId, session.userId);
  session.bet = session.ante;
  await openBlackjackStake(session.guildId, session.userId, session.ante);
  const kind = await dealInto(session);
  const wallet = (await getUserEconomyBalance(session.guildId, session.userId))
    .wallet;
  if (kind === "natural") {
    armIdle(session);
    return {
      embeds: [
        buildBlackjackEmbed({
          title: session.naturalTitle ?? "🃏 Blackjack",
          color: session.naturalColor ?? INFO,
          hands: session.hands,
          current: 0,
          dealer: session.dealer,
          hideDealerHole: false,
          currency: session.currency,
          wallet: session.naturalWallet ?? wallet,
          footer: session.naturalFooter,
        }),
      ],
      components: idleComponents(session.userId),
    };
  }
  armHandTimeout(session);
  return {
    embeds: [
      buildBlackjackEmbed({
        title: "🃏 Blackjack",
        color: INFO,
        hands: session.hands,
        current: session.current,
        dealer: session.dealer,
        hideDealerHole: true,
        currency: session.currency,
        wallet,
        highlightCurrent: true,
      }),
    ],
    components: blackjackButtons(session, wallet),
  };
}

async function advanceOrReveal(
  session: BlackjackSession,
  via: ButtonInteraction,
): Promise<void> {
  if (session.current + 1 < session.hands.length) {
    session.current += 1;
    const next = currentHand(session);
    const nextEv = evaluateHand(next.cards);
    if (nextEv.total === 21) {
      await revealAndIdle(session, via);
      return;
    }
    const wallet = (
      await getUserEconomyBalance(session.guildId, session.userId)
    ).wallet;
    await via.update({
      embeds: [
        buildBlackjackEmbed({
          title: "🃏 Blackjack — Hand 2",
          color: INFO,
          hands: session.hands,
          current: session.current,
          dealer: session.dealer,
          hideDealerHole: true,
          currency: session.currency,
          wallet,
          highlightCurrent: true,
        }),
      ],
      components: blackjackButtons(session, wallet),
    });
    armHandTimeout(session);
    return;
  }
  await revealAndIdle(session, via);
}

/**
 * /blackjack apuesta
 */
export async function handleBlackjackCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "This command only works in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const key = tableKey(guildId, userId);
  const bet = interaction.options.getInteger("bet", true);
  const ephemeral = consumeInteractionEphemeral(interaction.id, true);

  const existing = sessions.get(key);
  if (existing && existing.phase === "play") {
    await interaction.reply({
      content: "❌ You already have a blackjack hand in progress.",
      ...EPHEMERAL,
    });
    return;
  }
  if (existing) {
    clearSession(key);
  }

  let currency = "monedas";
  let naturalMultiplier = 2.5;
  let standOnSoft17 = true;
  let allowDoubleDown = true;
  let allowSplit = true;
  let deckCount = 6;

  try {
    const { economy, casino } = await assertEconomyAndCasino(guildId, bet);
    currency = currencyOf(economy);
    naturalMultiplier = casino.blackjack.blackjackMultiplier;
    standOnSoft17 = casino.blackjack.standOnSoft17;
    allowDoubleDown = casino.blackjack.allowDoubleDown;
    allowSplit = casino.blackjack.allowSplit;
    deckCount = casino.blackjack.deckCount;
  } catch (error) {
    await replyCasinoError(interaction, error);
    return;
  }

  const session: BlackjackSession = {
    client: interaction.client,
    guildId,
    userId,
    channelId: interaction.channelId,
    messageId: "",
    bet,
    ante: bet,
    deck: shuffleDeck(createShoe(deckCount)),
    deckCount,
    dealer: [],
    hands: [],
    current: 0,
    currency,
    naturalMultiplier,
    standOnSoft17,
    allowDoubleDown,
    allowSplit,
    splitUsed: false,
    phase: "play",
    busy: false,
    timeout: setTimeout(() => undefined, 0),
  };

  try {
    const payload = await startHand(session);
    await interaction.reply({
      ...payload,
      ...visibility(ephemeral),
    });
    const reply = await interaction.fetchReply();
    session.messageId = reply.id;
    sessions.set(key, session);
  } catch (error) {
    clearTimeout(session.timeout);
    await replyCasinoError(interaction, error);
  }
}

export async function handleBlackjackButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "This button only works in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const { action, ownerId } = parseOwnerCustomId(interaction.customId);
  if (!ownerId || interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "❌ This hand isn't yours.",
      ...EPHEMERAL,
    });
    return;
  }

  const key = tableKey(interaction.guildId, ownerId);
  const session = sessions.get(key);
  if (!session) {
    await interaction.reply({
      content: "❌ This table already ended or expired.",
      ...EPHEMERAL,
    });
    return;
  }
  if (session.busy) {
    await interaction.reply({
      content: "❌ Hold on, the hand is being resolved.",
      ...EPHEMERAL,
    });
    return;
  }

  if (action === BJ_AGAIN) {
    if (session.phase !== "idle") {
      await interaction.reply({
        content: "❌ Finish the current hand first.",
        ...EPHEMERAL,
      });
      return;
    }
    session.busy = true;
    try {
      const payload = await startHand(session);
      await interaction.update(payload);
    } catch (error) {
      const msg =
        error instanceof EconomyError
          ? error.message
          : "Couldn't start another hand.";
      await interaction.reply({ content: `❌ ${msg}`, ...EPHEMERAL });
    } finally {
      session.busy = false;
    }
    return;
  }

  if (session.phase !== "play") {
    await interaction.reply({
      content: "❌ This hand already ended. Press «New hand».",
      ...EPHEMERAL,
    });
    return;
  }

  session.busy = true;
  try {
    if (action === BJ_HIT) {
      const hand = currentHand(session);
      hand.cards = [...hand.cards, drawCard(session.deck)];
      const evalP = evaluateHand(hand.cards);
      if (evalP.isBust || evalP.total === 21) {
        await advanceOrReveal(session, interaction);
        return;
      }
      const wallet = (
        await getUserEconomyBalance(session.guildId, session.userId)
      ).wallet;
      await interaction.update({
        embeds: [
          buildBlackjackEmbed({
            title: "🃏 Blackjack",
            color: INFO,
            hands: session.hands,
            current: session.current,
            dealer: session.dealer,
            hideDealerHole: true,
            currency: session.currency,
            wallet,
            highlightCurrent: true,
          }),
        ],
        components: blackjackButtons(session, wallet),
      });
      armHandTimeout(session);
      return;
    }

    if (action === BJ_STAND) {
      await advanceOrReveal(session, interaction);
      return;
    }

    if (action === BJ_DOUBLE) {
      const wallet = (
        await getUserEconomyBalance(session.guildId, session.userId)
      ).wallet;
      if (!canDouble(session, wallet)) {
        await interaction.reply({
          content: "❌ You can't double right now.",
          ...EPHEMERAL,
        });
        return;
      }
      try {
        const raised = await raiseBlackjackStake(
          session.guildId,
          session.userId,
          session.ante,
        );
        session.bet = raised.bet;
        currentHand(session).bet = raised.bet;
      } catch (error) {
        const msg =
          error instanceof EconomyError
            ? error.message
            : "Not enough balance to double.";
        await interaction.reply({ content: `❌ ${msg}`, ...EPHEMERAL });
        return;
      }
      const hand = currentHand(session);
      hand.cards = [...hand.cards, drawCard(session.deck)];
      await revealAndIdle(session, interaction);
      return;
    }

    if (action === BJ_SPLIT) {
      const wallet = (
        await getUserEconomyBalance(session.guildId, session.userId)
      ).wallet;
      if (!canSplit(session, wallet)) {
        await interaction.reply({
          content: "❌ You can't split right now.",
          ...EPHEMERAL,
        });
        return;
      }
      try {
        await raiseBlackjackStake(
          session.guildId,
          session.userId,
          session.ante,
        );
      } catch (error) {
        const msg =
          error instanceof EconomyError
            ? error.message
            : "Not enough balance to split.";
        await interaction.reply({ content: `❌ ${msg}`, ...EPHEMERAL });
        return;
      }
      const original = session.hands[0]!.cards;
      session.hands = [
        { cards: [original[0]!, drawCard(session.deck)], bet: session.ante },
        { cards: [original[1]!, drawCard(session.deck)], bet: session.ante },
      ];
      session.splitUsed = true;
      session.current = 0;
      if (original[0]!.rank === "A") {
        await revealAndIdle(session, interaction);
        return;
      }
      const nextWallet = (
        await getUserEconomyBalance(session.guildId, session.userId)
      ).wallet;
      await interaction.update({
        embeds: [
          buildBlackjackEmbed({
            title: "🃏 Blackjack — Split",
            color: INFO,
            hands: session.hands,
            current: session.current,
            dealer: session.dealer,
            hideDealerHole: true,
            currency: session.currency,
            wallet: nextWallet,
            highlightCurrent: true,
          }),
        ],
        components: blackjackButtons(session, nextWallet),
      });
      armHandTimeout(session);
      return;
    }

    await interaction.reply({
      content: "❌ Unknown blackjack action.",
      ...EPHEMERAL,
    });
  } catch (error) {
    logger.error({ err: error }, "blackjack button:");
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({
          content: "An error occurred during the hand.",
          ...EPHEMERAL,
        })
        .catch(() => undefined);
    }
  } finally {
    session.busy = false;
  }
}
