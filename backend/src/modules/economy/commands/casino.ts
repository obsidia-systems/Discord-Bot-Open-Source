import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  applyEconomyMessageTemplate,
  type EconomyCasinoConfig,
} from "@adobos/shared";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import {
  assertCooldownAvailable,
  setCooldownMs,
} from "../cooldowns.js";
import { assertCasinoBetAllowed } from "../casinoService.js";
import {
  createShoe,
  dealerShouldHit,
  drawCard,
  evaluateHand,
  formatHand,
  shuffleDeck,
  type PlayingCard,
} from "../casino/cards.js";
import {
  pushRouletteHistory,
  rouletteColor,
  rouletteColorEmoji,
  spinEuropeanRoulette,
} from "../casino/roulette.js";
import {
  EconomyError,
  creditWallet,
  debitWalletStrict,
  getEconomyConfig,
  getUserEconomyBalance,
} from "../service.js";

const WIN = 0x57f287;
const LOSE = 0xed4245;
const PUSH = 0xfaa61a;
const INFO = 0x5865f2;

/** Prefijo registrado en el module registry (`resolvePrefixedHandler` exige `_`). */
export const BJ_BUTTON_PREFIX = "bj_";

const BJ_HIT = "bj_hit";
const BJ_STAND = "bj_stand";
const BJ_DOUBLE = "bj_double";

const BJ_TIMEOUT_MS = 60_000;

interface BlackjackSession {
  guildId: string;
  userId: string;
  channelId: string;
  messageId: string;
  bet: number;
  deck: PlayingCard[];
  player: PlayingCard[];
  dealer: PlayingCard[];
  currency: string;
  naturalMultiplier: number;
  standOnSoft17: boolean;
  allowDoubleDown: boolean;
  finished: boolean;
  timeout: ReturnType<typeof setTimeout>;
}

const sessions = new Map<string, BlackjackSession>();

function bjKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function clearSession(key: string): void {
  const session = sessions.get(key);
  if (!session) return;
  clearTimeout(session.timeout);
  sessions.delete(key);
}

async function replyError(
  interaction: ChatInputCommandInteraction,
  error: unknown,
): Promise<void> {
  const message =
    error instanceof EconomyError
      ? error.message
      : error instanceof Error
        ? error.message
        : "No se pudo completar la jugada.";
  const content = `❌ ${message}`;
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content, ephemeral: true });
  } else {
    await interaction.reply({ content, ephemeral: true });
  }
}

async function assertEconomyAndCasino(
  guildId: string,
  bet: number,
): Promise<{ economy: Awaited<ReturnType<typeof getEconomyConfig>>; casino: EconomyCasinoConfig }> {
  const economy = await getEconomyConfig(guildId);
  if (!economy.isActive) {
    throw new EconomyError(
      "⛔ La economía está desactivada en este servidor.",
      400,
      "ECONOMY_INACTIVE",
    );
  }
  const casino = await assertCasinoBetAllowed(guildId, bet);
  return { economy, casino };
}

function currencyOf(economy: Awaited<ReturnType<typeof getEconomyConfig>>): string {
  return economy.currencyName || "monedas";
}

/**
 * /coinflip apuesta lado
 */
export async function handleCoinflipCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "Este comando solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const bet = interaction.options.getInteger("apuesta", true);
  const sideRaw = (interaction.options.getString("lado", true) ?? "")
    .trim()
    .toLowerCase();
  const side = sideRaw === "cara" || sideRaw === "cruz" ? sideRaw : null;
  const ephemeral = consumeInteractionEphemeral(interaction.id, false);

  if (!side) {
    await interaction.reply({
      content: "❌ Elige `cara` o `cruz`.",
      ephemeral: true,
    });
    return;
  }

  try {
    const { economy, casino } = await assertEconomyAndCasino(guildId, bet);
    await assertCooldownAvailable(guildId, userId, "coinflip");
    await debitWalletStrict(guildId, userId, bet);

    const result: "cara" | "cruz" = Math.random() < 0.5 ? "cara" : "cruz";
    const won = result === side;
    const currency = currencyOf(economy);
    const sideLabel = result === "cara" ? "Cara" : "Cruz";

    let payout = 0;
    let wallet = (await getUserEconomyBalance(guildId, userId)).wallet;
    if (won) {
      payout = Math.floor(bet * casino.coinflip.multiplier);
      wallet = (await creditWallet(guildId, userId, payout)).wallet;
    }

    await setCooldownMs(
      guildId,
      userId,
      "coinflip",
      casino.coinflip.cooldownSeconds * 1000,
    );

    const description = won
      ? applyEconomyMessageTemplate(casino.coinflip.winMessage, {
          side: sideLabel,
          payout: payout.toLocaleString("es-MX"),
          currency,
        })
      : `La moneda cayó en **${sideLabel}**. Perdiste **${bet.toLocaleString("es-MX")}** ${currency}.`;

    const embed = new EmbedBuilder()
      .setColor(won ? WIN : LOSE)
      .setTitle(won ? "🪙 Coinflip — ¡Ganaste!" : "🪙 Coinflip — Perdiste")
      .setDescription(description)
      .addFields(
        {
          name: "Tu elección",
          value: side === "cara" ? "Cara" : "Cruz",
          inline: true,
        },
        { name: "Resultado", value: sideLabel, inline: true },
        {
          name: "Cartera",
          value: `**${wallet.toLocaleString("es-MX")}** ${currency}`,
          inline: true,
        },
      )
      .setFooter({
        text: won
          ? `x${casino.coinflip.multiplier} · +${payout.toLocaleString("es-MX")}`
          : `−${bet.toLocaleString("es-MX")}`,
      });

    await interaction.reply({ embeds: [embed], ephemeral });
  } catch (error) {
    await replyError(interaction, error);
  }
}

type RouletteBetType = "rojo" | "negro" | "verde" | "numero";

/**
 * /roulette apuesta tipo [valor_numero]
 * Sin botones interactivos: resolución inmediata en el slash.
 */
export async function handleRouletteCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "Este comando solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const bet = interaction.options.getInteger("apuesta", true);
  const tipo = (interaction.options.getString("tipo", true) ?? "")
    .trim()
    .toLowerCase() as RouletteBetType;
  const valorNumero = interaction.options.getInteger("valor_numero");
  const ephemeral = consumeInteractionEphemeral(interaction.id, false);

  if (!["rojo", "negro", "verde", "numero"].includes(tipo)) {
    await interaction.reply({
      content: "❌ Tipo de apuesta inválido.",
      ephemeral: true,
    });
    return;
  }

  if (tipo === "numero") {
    if (
      valorNumero === null ||
      !Number.isInteger(valorNumero) ||
      valorNumero < 0 ||
      valorNumero > 36
    ) {
      await interaction.reply({
        content:
          "❌ Indica `valor_numero` entre 0 y 36 para apostar a un número.",
        ephemeral: true,
      });
      return;
    }
  }

  try {
    const { economy, casino } = await assertEconomyAndCasino(guildId, bet);
    await debitWalletStrict(guildId, userId, bet);

    const spun = spinEuropeanRoulette();
    const color = rouletteColor(spun);
    const history = pushRouletteHistory(guildId, spun);
    const currency = currencyOf(economy);

    let won = false;
    let multiplier = 0;
    if (tipo === "numero") {
      won = spun === valorNumero;
      multiplier = casino.roulette.numberMultiplier;
    } else if (tipo === "verde") {
      won = color === "verde";
      multiplier = casino.roulette.greenMultiplier;
    } else {
      won = color === tipo;
      multiplier = casino.roulette.colorMultiplier;
    }

    let payout = 0;
    let wallet = (await getUserEconomyBalance(guildId, userId)).wallet;
    if (won) {
      payout = Math.floor(bet * multiplier);
      wallet = (await creditWallet(guildId, userId, payout)).wallet;
    }

    const betLabel =
      tipo === "numero"
        ? `Número **${valorNumero}**`
        : tipo.charAt(0).toUpperCase() + tipo.slice(1);

    const embed = new EmbedBuilder()
      .setColor(won ? WIN : LOSE)
      .setTitle(won ? "🎡 Ruleta — ¡Ganaste!" : "🎡 Ruleta — Perdiste")
      .setDescription(
        [
          `La bola cayó en **${spun}** ${rouletteColorEmoji(color)} (**${color}**).`,
          won
            ? `Ganaste **${payout.toLocaleString("es-MX")}** ${currency} (x${multiplier}).`
            : `Perdiste **${bet.toLocaleString("es-MX")}** ${currency}.`,
        ].join("\n"),
      )
      .addFields(
        { name: "Tu apuesta", value: betLabel, inline: true },
        {
          name: "Cartera",
          value: `**${wallet.toLocaleString("es-MX")}** ${currency}`,
          inline: true,
        },
      );

    if (casino.roulette.showNumberHistory && history.length > 0) {
      const chips = history
        .map((n) => `${rouletteColorEmoji(rouletteColor(n))}${n}`)
        .join(" · ");
      embed.addFields({ name: "Últimos números", value: chips });
    }

    await interaction.reply({ embeds: [embed], ephemeral });
  } catch (error) {
    await replyError(interaction, error);
  }
}

function blackjackButtons(
  userId: string,
  opts: { allowDouble: boolean; canAffordDouble: boolean },
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BJ_HIT}:${userId}`)
      .setLabel("Pedir")
      .setEmoji("🃏")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${BJ_STAND}:${userId}`)
      .setLabel("Plantarse")
      .setEmoji("🛑")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${BJ_DOUBLE}:${userId}`)
      .setLabel("Doblar")
      .setEmoji("💰")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!opts.allowDouble || !opts.canAffordDouble),
  );
}

function disabledBlackjackButtons(
  userId: string,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BJ_HIT}:${userId}`)
      .setLabel("Pedir")
      .setEmoji("🃏")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${BJ_STAND}:${userId}`)
      .setLabel("Plantarse")
      .setEmoji("🛑")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${BJ_DOUBLE}:${userId}`)
      .setLabel("Doblar")
      .setEmoji("💰")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
  );
}

function buildBlackjackEmbed(input: {
  title: string;
  color: number;
  player: PlayingCard[];
  dealer: PlayingCard[];
  hideDealerHole: boolean;
  bet: number;
  currency: string;
  wallet: number;
  footer?: string;
}): EmbedBuilder {
  const playerEval = evaluateHand(input.player);
  const dealerEval = evaluateHand(input.dealer);
  const dealerTotal = input.hideDealerHole
    ? evaluateHand([input.dealer[0]!]).total
    : dealerEval.total;

  return new EmbedBuilder()
    .setColor(input.color)
    .setTitle(input.title)
    .addFields(
      {
        name: `Tú · ${playerEval.total}`,
        value: formatHand(input.player),
        inline: false,
      },
      {
        name: input.hideDealerHole
          ? `Crupier · ${dealerTotal}+`
          : `Crupier · ${dealerEval.total}`,
        value: formatHand(input.dealer, input.hideDealerHole),
        inline: false,
      },
      {
        name: "Apuesta",
        value: `**${input.bet.toLocaleString("es-MX")}** ${input.currency}`,
        inline: true,
      },
      {
        name: "Cartera",
        value: `**${input.wallet.toLocaleString("es-MX")}** ${input.currency}`,
        inline: true,
      },
    )
    .setFooter(
      input.footer ? { text: input.footer } : { text: "Tienes 60s para jugar" },
    );
}

type BjOutcome = "win" | "lose" | "push" | "blackjack";

async function settleBlackjack(input: {
  guildId: string;
  userId: string;
  bet: number;
  player: PlayingCard[];
  dealer: PlayingCard[];
  naturalMultiplier: number;
  wasNaturalWin: boolean;
}): Promise<{
  outcome: BjOutcome;
  payout: number;
  wallet: number;
  title: string;
  color: number;
}> {
  const player = evaluateHand(input.player);
  const dealer = evaluateHand(input.dealer);

  if (input.wasNaturalWin) {
    const payout = Math.floor(input.bet * input.naturalMultiplier);
    const wallet = (await creditWallet(input.guildId, input.userId, payout)).wallet;
    return {
      outcome: "blackjack",
      payout,
      wallet,
      title: "🃏 Blackjack — ¡Natural!",
      color: WIN,
    };
  }

  if (player.isBust) {
    return {
      outcome: "lose",
      payout: 0,
      wallet: (await getUserEconomyBalance(input.guildId, input.userId)).wallet,
      title: "🃏 Blackjack — Bust",
      color: LOSE,
    };
  }

  if (dealer.isBust) {
    const payout = input.bet * 2;
    const wallet = (await creditWallet(input.guildId, input.userId, payout)).wallet;
    return {
      outcome: "win",
      payout,
      wallet,
      title: "🃏 Blackjack — El crupier se pasó",
      color: WIN,
    };
  }

  if (player.total > dealer.total) {
    const payout = input.bet * 2;
    const wallet = (await creditWallet(input.guildId, input.userId, payout)).wallet;
    return {
      outcome: "win",
      payout,
      wallet,
      title: "🃏 Blackjack — ¡Ganaste!",
      color: WIN,
    };
  }

  if (player.total < dealer.total) {
    return {
      outcome: "lose",
      payout: 0,
      wallet: (await getUserEconomyBalance(input.guildId, input.userId)).wallet,
      title: "🃏 Blackjack — Perdiste",
      color: LOSE,
    };
  }

  const wallet = (await creditWallet(input.guildId, input.userId, input.bet)).wallet;
  return {
    outcome: "push",
    payout: input.bet,
    wallet,
    title: "🃏 Blackjack — Empate (Push)",
    color: PUSH,
  };
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

async function settlementPayload(session: BlackjackSession): Promise<{
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}> {
  const settled = await settleBlackjack({
    guildId: session.guildId,
    userId: session.userId,
    bet: session.bet,
    player: session.player,
    dealer: session.dealer,
    naturalMultiplier: session.naturalMultiplier,
    wasNaturalWin: false,
  });
  const embed = buildBlackjackEmbed({
    title: settled.title,
    color: settled.color,
    player: session.player,
    dealer: session.dealer,
    hideDealerHole: false,
    bet: session.bet,
    currency: session.currency,
    wallet: settled.wallet,
    footer:
      settled.outcome === "lose"
        ? `−${session.bet.toLocaleString("es-MX")} ${session.currency}`
        : settled.outcome === "push"
          ? `Reembolso ${settled.payout.toLocaleString("es-MX")} ${session.currency}`
          : `+${settled.payout.toLocaleString("es-MX")} ${session.currency}`,
  });
  return {
    embeds: [embed],
    components: [disabledBlackjackButtons(session.userId)],
  };
}

function runDealerTurn(session: BlackjackSession): void {
  session.dealer = playDealer(
    session.deck,
    session.dealer,
    session.standOnSoft17,
  );
}

async function finishSession(
  session: BlackjackSession,
  via: ButtonInteraction | null,
): Promise<void> {
  if (session.finished) return;
  session.finished = true;
  const key = bjKey(session.guildId, session.userId);
  const payload = await settlementPayload(session);
  clearSession(key);

  if (via && !via.replied && !via.deferred) {
    await via.update(payload);
    return;
  }

  try {
    const channel = via?.channel ?? null;
    if (channel && "messages" in channel) {
      const msg = await channel.messages.fetch(session.messageId);
      await msg.edit(payload);
      return;
    }
  } catch {
    /* canal/mensaje ya no disponible */
  }
}

async function scheduleTimeout(session: BlackjackSession): Promise<ReturnType<typeof setTimeout>> {
  return setTimeout(async () => {
    void (async () => {
      const key = bjKey(session.guildId, session.userId);
      const current = sessions.get(key);
      if (!current || current.finished) return;
      try {
        runDealerTurn(current);
        await finishSession(current, null);
      } catch (error) {
        console.error("[adobos] blackjack timeout:", error);
        clearSession(key);
      }
    })();
  }, BJ_TIMEOUT_MS);
}

/**
 * /blackjack apuesta
 */
export async function handleBlackjackCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "Este comando solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const key = bjKey(guildId, userId);
  const betInitial = interaction.options.getInteger("apuesta", true);
  const ephemeral = consumeInteractionEphemeral(interaction.id, false);

  if (sessions.has(key)) {
    await interaction.reply({
      content: "❌ Ya tienes una mano de blackjack en curso.",
      ephemeral: true,
    });
    return;
  }

  let bet = betInitial;
  let deck: PlayingCard[] = [];
  let player: PlayingCard[] = [];
  let dealer: PlayingCard[] = [];
  let currency = "monedas";
  let naturalMultiplier = 2.5;
  let standOnSoft17 = true;
  let allowDoubleDown = true;

  try {
    const { economy, casino } = await assertEconomyAndCasino(guildId, bet);
    currency = currencyOf(economy);
    naturalMultiplier = casino.blackjack.blackjackMultiplier;
    standOnSoft17 = casino.blackjack.standOnSoft17;
    allowDoubleDown = casino.blackjack.allowDoubleDown;

    await debitWalletStrict(guildId, userId, bet);
    deck = shuffleDeck(createShoe(casino.blackjack.deckCount));
    player = [drawCard(deck), drawCard(deck)];
    dealer = [drawCard(deck), drawCard(deck)];
  } catch (error) {
    await replyError(interaction, error);
    return;
  }

  const playerEval = evaluateHand(player);
  const dealerEval = evaluateHand(dealer);

  if (playerEval.isBlackjack || dealerEval.isBlackjack) {
    if (playerEval.isBlackjack && dealerEval.isBlackjack) {
      const wallet = (await creditWallet(guildId, userId, bet)).wallet;
      await interaction.reply({
        embeds: [
          buildBlackjackEmbed({
            title: "🃏 Blackjack — Empate (Push)",
            color: PUSH,
            player,
            dealer,
            hideDealerHole: false,
            bet,
            currency,
            wallet,
            footer: `Reembolso ${bet.toLocaleString("es-MX")} ${currency}`,
          }),
        ],
        ephemeral,
      });
      return;
    }
    if (playerEval.isBlackjack) {
      const payout = Math.floor(bet * naturalMultiplier);
      const wallet = (await creditWallet(guildId, userId, payout)).wallet;
      await interaction.reply({
        embeds: [
          buildBlackjackEmbed({
            title: "🃏 Blackjack — ¡Natural!",
            color: WIN,
            player,
            dealer,
            hideDealerHole: false,
            bet,
            currency,
            wallet,
            footer: `+${payout.toLocaleString("es-MX")} ${currency}`,
          }),
        ],
        ephemeral,
      });
      return;
    }
    const wallet = (await getUserEconomyBalance(guildId, userId)).wallet;
    await interaction.reply({
      embeds: [
        buildBlackjackEmbed({
          title: "🃏 Blackjack — El crupier tiene natural",
          color: LOSE,
          player,
          dealer,
          hideDealerHole: false,
          bet,
          currency,
          wallet,
          footer: `−${bet.toLocaleString("es-MX")} ${currency}`,
        }),
      ],
      ephemeral,
    });
    return;
  }

  const canAffordDouble =
    allowDoubleDown && (await getUserEconomyBalance(guildId, userId)).wallet >= bet;

  await interaction.reply({
    embeds: [
      buildBlackjackEmbed({
        title: "🃏 Blackjack",
        color: INFO,
        player,
        dealer,
        hideDealerHole: true,
        bet,
        currency,
        wallet: (await getUserEconomyBalance(guildId, userId)).wallet,
      }),
    ],
    components: [
      blackjackButtons(userId, {
        allowDouble: allowDoubleDown && player.length === 2,
        canAffordDouble,
      }),
    ],
    ephemeral,
  });

  const reply = await interaction.fetchReply();
  const session: BlackjackSession = {
    guildId,
    userId,
    channelId: interaction.channelId,
    messageId: reply.id,
    bet,
    deck,
    player,
    dealer,
    currency,
    naturalMultiplier,
    standOnSoft17,
    allowDoubleDown,
    finished: false,
    timeout: null as unknown as ReturnType<typeof setTimeout>,
  };
  session.timeout = await scheduleTimeout(session);
  sessions.set(key, session);
}

/**
 * Botones Pedir / Plantarse / Doblar (router de módulos).
 * customId: `bj_hit:userId` | `bj_stand:userId` | `bj_double:userId`
 */
export async function handleBlackjackButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "Este botón solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const parts = interaction.customId.split(":");
  const action = parts[0];
  const ownerId = parts[1];

  if (!ownerId || interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "❌ Esta mano no es tuya.",
      ephemeral: true,
    });
    return;
  }

  const key = bjKey(interaction.guildId, ownerId);
  const session = sessions.get(key);
  if (!session || session.finished) {
    await interaction.reply({
      content: "❌ Esta mano ya terminó o expiró.",
      ephemeral: true,
    });
    return;
  }

  try {
    if (action === BJ_HIT) {
      session.player = [...session.player, drawCard(session.deck)];
      const evalP = evaluateHand(session.player);
      if (evalP.isBust) {
        await finishSession(session, interaction);
        return;
      }
      if (evalP.total === 21) {
        runDealerTurn(session);
        await finishSession(session, interaction);
        return;
      }
      await interaction.update({
        embeds: [
          buildBlackjackEmbed({
            title: "🃏 Blackjack",
            color: INFO,
            player: session.player,
            dealer: session.dealer,
            hideDealerHole: true,
            bet: session.bet,
            currency: session.currency,
            wallet: (await getUserEconomyBalance(session.guildId, session.userId))
              .wallet,
          }),
        ],
        components: [
          blackjackButtons(session.userId, {
            allowDouble: false,
            canAffordDouble: false,
          }),
        ],
      });
      return;
    }

    if (action === BJ_STAND) {
      runDealerTurn(session);
      await finishSession(session, interaction);
      return;
    }

    if (action === BJ_DOUBLE) {
      if (!session.allowDoubleDown || session.player.length !== 2) {
        await interaction.reply({
          content: "❌ No puedes doblar ahora.",
          ephemeral: true,
        });
        return;
      }
      try {
        await debitWalletStrict(session.guildId, session.userId, session.bet);
      } catch (error) {
        const msg =
          error instanceof EconomyError
            ? error.message
            : "Saldo insuficiente para doblar.";
        await interaction.reply({ content: `❌ ${msg}`, ephemeral: true });
        return;
      }
      session.bet *= 2;
      session.player = [...session.player, drawCard(session.deck)];
      if (!evaluateHand(session.player).isBust) {
        runDealerTurn(session);
      }
      await finishSession(session, interaction);
      return;
    }

    await interaction.reply({
      content: "❌ Acción de blackjack desconocida.",
      ephemeral: true,
    });
  } catch (error) {
    console.error("[adobos] blackjack button:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({
          content: "Ocurrió un error en la mano.",
          ephemeral: true,
        })
        .catch(() => undefined);
    }
  }
}
