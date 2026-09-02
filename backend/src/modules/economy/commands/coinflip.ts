import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import { applyEconomyMessageTemplate } from "@adobos/shared";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import { assertCooldownAvailable, setCooldownMs } from "../cooldowns.js";
import { coinflipPayout } from "../casino/payouts.js";
import { flipCoin } from "../casino/rng.js";
import { creditWallet, debitWalletStrict } from "../funds.js";
import { EconomyError, getUserEconomyBalance } from "../service.js";
import { EPHEMERAL, visibility } from "./visibility.js";
import {
  LOSE,
  TABLE_IDLE_MS,
  WIN,
  assertEconomyAndCasino,
  clearMessageComponents,
  currencyOf,
  parseOwnerCustomId,
  playAgainRow,
  replyCasinoError,
  tableKey,
} from "./casinoCommon.js";

export const CF_BUTTON_PREFIX = "cf_";

const CF_CARA = "cf_cara";
const CF_CRUZ = "cf_cruz";
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
      .setCustomId(`${CF_CARA}:${userId}`)
      .setLabel("Cara")
      .setEmoji("🪙")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${CF_CRUZ}:${userId}`)
      .setLabel("Cruz")
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
  side: "cara" | "cruz";
}): Promise<{
  embed: EmbedBuilder;
}> {
  const { economy, casino } = await assertEconomyAndCasino(input.guildId, input.bet);
  await assertCooldownAvailable(input.guildId, input.userId, "coinflip");
  await debitWalletStrict(input.guildId, input.userId, input.bet);

  const result = flipCoin();
  const won = result === input.side;
  const currency = currencyOf(economy);
  const sideLabel = result === "cara" ? "Cara" : "Cruz";

  let payout = 0;
  let wallet = (await getUserEconomyBalance(input.guildId, input.userId)).wallet;
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
    : `La moneda cayó en **${sideLabel}**. Perdiste **${input.bet.toLocaleString("es-MX")}** ${currency}.`;

  const embed = new EmbedBuilder()
    .setColor(won ? WIN : LOSE)
    .setTitle(won ? "🪙 Coinflip — ¡Ganaste!" : "🪙 Coinflip — Perdiste")
    .setDescription(description)
    .addFields(
      {
        name: "Tu elección",
        value: input.side === "cara" ? "Cara" : "Cruz",
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
        : `−${input.bet.toLocaleString("es-MX")}`,
    });

  return { embed };
}

function promptEmbed(bet: number, currency: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🪙 Coinflip")
    .setDescription(
      `Apuesta: **${bet.toLocaleString("es-MX")}** ${currency}.\nElige **Cara** o **Cruz**. El dinero se cobra al pulsar.`,
    );
}

/**
 * /coinflip apuesta [lado]
 */
export async function handleCoinflipCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "Este comando solo funciona en un servidor.",
      ...EPHEMERAL,
    });
    return;
  }

  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const bet = interaction.options.getInteger("apuesta", true);
  const sideRaw = (interaction.options.getString("lado") ?? "")
    .trim()
    .toLowerCase();
  const side = sideRaw === "cara" || sideRaw === "cruz" ? sideRaw : null;
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
      content: "Este botón solo funciona en un servidor.",
      ...EPHEMERAL,
    });
    return;
  }

  const { action, ownerId } = parseOwnerCustomId(interaction.customId);
  if (!ownerId || interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "❌ Esta moneda no es tuya.",
      ...EPHEMERAL,
    });
    return;
  }

  const key = tableKey(interaction.guildId, ownerId);
  const row = pending.get(key);
  if (!row) {
    await interaction.reply({
      content: "❌ Esta mesa expiró.",
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

    const side = action === CF_CARA ? "cara" : action === CF_CRUZ ? "cruz" : null;
    if (!side) {
      await interaction.reply({
        content: "❌ Acción desconocida.",
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
        : "No se pudo completar el coinflip.";
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `❌ ${msg}`, ...EPHEMERAL });
    }
  }
}
