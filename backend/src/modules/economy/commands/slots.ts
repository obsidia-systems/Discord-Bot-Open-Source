import {
  EmbedBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import { assertCooldownAvailable, setCooldownMs } from "../cooldowns.js";
import { SLOT_PAIR_MULTIPLIER, slotsCredit, spinSlots } from "../casino/slots.js";
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

export const SL_BUTTON_PREFIX = "sl_";
const SL_AGAIN = "sl_again";

interface SlotsPending {
  client: Client;
  guildId: string;
  userId: string;
  channelId: string;
  messageId: string;
  bet: number;
  timeout: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, SlotsPending>();

function clearPending(key: string): void {
  const row = pending.get(key);
  if (!row) return;
  clearTimeout(row.timeout);
  pending.delete(key);
}

function armIdle(row: SlotsPending): void {
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

async function resolveSpin(input: {
  guildId: string;
  userId: string;
  bet: number;
}): Promise<EmbedBuilder> {
  const { economy, casino } = await assertEconomyAndCasino(input.guildId, input.bet);
  await assertCooldownAvailable(input.guildId, input.userId, "slots");
  await debitWalletStrict(input.guildId, input.userId, input.bet);

  const spun = spinSlots();
  const payout = slotsCredit(input.bet, spun.multiplier);
  const currency = currencyOf(economy);
  let wallet = (await getUserEconomyBalance(input.guildId, input.userId)).wallet;
  if (payout > 0) {
    wallet = (await creditWallet(input.guildId, input.userId, payout)).wallet;
  }

  await setCooldownMs(
    input.guildId,
    input.userId,
    "slots",
    casino.slots.cooldownSeconds * 1000,
  );

  const line = spun.reels.map((s) => s.emoji).join("  ");
  const won = payout > 0;
  const kind =
    spun.multiplier >= 3
      ? "Tres iguales"
      : spun.multiplier === SLOT_PAIR_MULTIPLIER
        ? "Par (2 de 3)"
        : "Sin premio";

  return new EmbedBuilder()
    .setColor(won ? WIN : LOSE)
    .setTitle(won ? "🎰 Slots — ¡Ganaste!" : "🎰 Slots — Sin premio")
    .setDescription(`**${line}**\n${kind}`)
    .addFields(
      {
        name: "Apuesta",
        value: `**${input.bet.toLocaleString("es-MX")}** ${currency}`,
        inline: true,
      },
      {
        name: "Cartera",
        value: `**${wallet.toLocaleString("es-MX")}** ${currency}`,
        inline: true,
      },
    )
    .setFooter({
      text: won
        ? `x${spun.multiplier} · +${payout.toLocaleString("es-MX")}`
        : `−${input.bet.toLocaleString("es-MX")}`,
    });
}

/**
 * /slots apuesta
 */
export async function handleSlotsCommand(
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
  const ephemeral = consumeInteractionEphemeral(interaction.id, true);

  try {
    const embed = await resolveSpin({ guildId, userId, bet });
    await interaction.reply({
      embeds: [embed],
      components: [playAgainRow(`${SL_AGAIN}:${userId}`)],
      ...visibility(ephemeral),
    });
    const reply = await interaction.fetchReply();
    const key = tableKey(guildId, userId);
    clearPending(key);
    const row: SlotsPending = {
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

export async function handleSlotsButton(
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
      content: "❌ Esta máquina no es tuya.",
      ...EPHEMERAL,
    });
    return;
  }
  if (action !== SL_AGAIN) {
    await interaction.reply({
      content: "❌ Acción desconocida.",
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
    const embed = await resolveSpin({
      guildId: row.guildId,
      userId: row.userId,
      bet: row.bet,
    });
    await interaction.update({
      embeds: [embed],
      components: [playAgainRow(`${SL_AGAIN}:${ownerId}`)],
    });
    armIdle(row);
  } catch (error) {
    const msg =
      error instanceof EconomyError
        ? error.message
        : "No se pudo girar.";
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `❌ ${msg}`, ...EPHEMERAL });
    }
  }
}
