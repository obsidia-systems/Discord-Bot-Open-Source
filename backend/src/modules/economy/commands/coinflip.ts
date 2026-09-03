import { applyEconomyMessageTemplate } from "@adobos/shared";
import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type Client,
  EmbedBuilder,
} from "discord.js";
import { consumeInteractionEphemeral } from "#modules/system-commands/ephemeral.js";
import { coinflipPayout } from "../casino/payouts.js";
import { flipCoin } from "../casino/rng.js";
import { assertCooldownAvailable, setCooldownMs } from "../cooldowns.js";
import { creditWallet, debitWalletStrict } from "../funds.js";
import { EconomyError, getUserEconomyBalance } from "../service.js";
import {
  assertEconomyAndCasino,
  clearMessageComponents,
  currencyOf,
  LOSE,
  parseOwnerCustomId,
  playAgainRow,
  replyCasinoError,
  TABLE_IDLE_MS,
  tableKey,
  WIN,
} from "./casinoCommon.js";
import { EPHEMERAL, visibility } from "./visibility.js";

export const CF_BUTTON_PREFIX = "cf_";

const CF_HEADS = "cf_heads";
const CF_TAILS = "cf_tails";
const CF_AGAIN = "cf_again";

interface CoinflipPending {
  client: Client;
  guildId: string;
  userId: string;
  channelId: string;
  messageId: string;
  bet: number;
  timeout: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, CoinflipPending>();

function sideButtons(userId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CF_HEADS}:${userId}`)
      .setLabel("Heads")
      .setEmoji("🪙")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${CF_TAILS}:${userId}`)
      .setLabel("Tails")
      .setEmoji("🪙")
      .setStyle(ButtonStyle.Secondary),
  );
}

function clearPending(key: string): void {
  const row = pending.get(key);
  if (!row) return;
  clearTimeout(row.timeout);
  pending.delete(key);
}

function armIdle(row: CoinflipPending): void {
  const key = tableKey(row.guildId, row.userId);
  clearTimeout(row.timeout);
  row.timeout = setTimeout(() => {
    void (async () => {
      const current = pending.get(key);
      if (!current) return;
      await clearMessageComponents(current);
      clearPending(key);
    })();
  }, TABLE_IDLE_MS);
}

async function resolveFlip(input: {
  guildId: string;
  userId: string;
  bet: number;
  side: "heads" | "tails";
}): Promise<{
  embed: EmbedBuilder;
}> {
  const { economy, casino } = await assertEconomyAndCasino(
    input.guildId,
    input.bet,
  );
  await assertCooldownAvailable(input.guildId, input.userId, "coinflip");
  await debitWalletStrict(input.guildId, input.userId, input.bet);

  const result = flipCoin();
  const won = result === input.side;
  const currency = currencyOf(economy);
  const sideLabel = result === "heads" ? "Heads" : "Tails";

  let payout = 0;
  let wallet = (await getUserEconomyBalance(input.guildId, input.userId))
    .wallet;
  if (won) {
    payout = coinflipPayout(input.bet, casino.coinflip.multiplier, true);
    wallet = (await creditWallet(input.guildId, input.userId, payout)).wallet;
  }

  await setCooldownMs(
    input.guildId,
    input.userId,
    "coinflip",
    casino.coinflip.cooldownSeconds * 1000,
  );

  const description = won
    ? applyEconomyMessageTemplate(casino.coinflip.winMessage, {
        side: sideLabel,
        payout: payout.toLocaleString("es-MX"),
        currency,
      })
    : `The coin landed on **${sideLabel}**. You lost **${input.bet.toLocaleString("es-MX")}** ${currency}.`;

  const embed = new EmbedBuilder()
    .setColor(won ? WIN : LOSE)
    .setTitle(won ? "🪙 Coinflip — You won!" : "🪙 Coinflip — You lost")
    .setDescription(description)
    .addFields(
      {
        name: "Your pick",
        value: input.side === "heads" ? "Heads" : "Tails",
        inline: true,
      },
      { name: "Result", value: sideLabel, inline: true },
      {
        name: "Wallet",
        value: `**${wallet.toLocaleString("es-MX")}** ${currency}`,
        inline: true,
      },
    )
    .setFooter({
      text: won
        ? `x${casino.coinflip.multiplier} · +${payout.toLocaleString("es-MX")}`
        : `−${input.bet.toLocaleString("es-MX")}`,
    });

  return { embed };
}

function promptEmbed(bet: number, currency: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🪙 Coinflip")
    .setDescription(
      `Bet: **${bet.toLocaleString("es-MX")}** ${currency}.\nChoose **Heads** or **Tails**. Money is charged on click.`,
    );
}

/**
 * /coinflip bet [side]
 */
export async function handleCoinflipCommand(
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
  const bet = interaction.options.getInteger("bet", true);
  const sideRaw = (interaction.options.getString("side") ?? "")
    .trim()
    .toLowerCase();
  const side = sideRaw === "heads" || sideRaw === "tails" ? sideRaw : null;
  const ephemeral = consumeInteractionEphemeral(interaction.id, true);

  try {
    const { economy } = await assertEconomyAndCasino(guildId, bet);
    const currency = currencyOf(economy);

    if (side) {
      const { embed } = await resolveFlip({ guildId, userId, bet, side });
      await interaction.reply({
        embeds: [embed],
        components: [playAgainRow(`${CF_AGAIN}:${userId}`)],
        ...visibility(ephemeral),
      });
      const reply = await interaction.fetchReply();
      const key = tableKey(guildId, userId);
      clearPending(key);
      const row: CoinflipPending = {
        client: interaction.client,
        guildId,
        userId,
        channelId: interaction.channelId,
        messageId: reply.id,
        bet,
        timeout: setTimeout(() => undefined, 0),
      };
      pending.set(key, row);
      armIdle(row);
      return;
    }

    await interaction.reply({
      embeds: [promptEmbed(bet, currency)],
      components: [sideButtons(userId)],
      ...visibility(ephemeral),
    });
    const reply = await interaction.fetchReply();
    const key = tableKey(guildId, userId);
    clearPending(key);
    const row: CoinflipPending = {
      client: interaction.client,
      guildId,
      userId,
      channelId: interaction.channelId,
      messageId: reply.id,
      bet,
      timeout: setTimeout(() => undefined, 0),
    };
    pending.set(key, row);
    armIdle(row);
  } catch (error) {
    await replyCasinoError(interaction, error);
  }
}

export async function handleCoinflipButton(
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
      content: "❌ This coin isn't yours.",
      ...EPHEMERAL,
    });
    return;
  }

  const key = tableKey(interaction.guildId, ownerId);
  const row = pending.get(key);
  if (!row) {
    await interaction.reply({
      content: "❌ This table expired.",
      ...EPHEMERAL,
    });
    return;
  }

  try {
    if (action === CF_AGAIN) {
      const { economy } = await assertEconomyAndCasino(row.guildId, row.bet);
      await interaction.update({
        embeds: [promptEmbed(row.bet, currencyOf(economy))],
        components: [sideButtons(ownerId)],
      });
      armIdle(row);
      return;
    }

    const side =
      action === CF_HEADS ? "heads" : action === CF_TAILS ? "tails" : null;
    if (!side) {
      await interaction.reply({
        content: "❌ Unknown action.",
        ...EPHEMERAL,
      });
      return;
    }

    const { embed } = await resolveFlip({
      guildId: row.guildId,
      userId: row.userId,
      bet: row.bet,
      side,
    });
    await interaction.update({
      embeds: [embed],
      components: [playAgainRow(`${CF_AGAIN}:${ownerId}`)],
    });
    armIdle(row);
  } catch (error) {
    const msg =
      error instanceof EconomyError
        ? error.message
        : "Couldn't finish the coinflip.";
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `❌ ${msg}`, ...EPHEMERAL });
    }
  }
}
