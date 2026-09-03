import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type StringSelectMenuInteraction,
} from "discord.js";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import { assertCooldownAvailable, setCooldownMs } from "../cooldowns.js";
import { resolveRouletteBet, type RouletteBetType } from "../casino/payouts.js";
import {
  pushRouletteHistory,
  rouletteColor,
  rouletteColorEmoji,
  spinEuropeanRoulette,
} from "../casino/roulette.js";
import { creditWallet, debitWalletStrict } from "../funds.js";
import { EconomyError, getUserEconomyBalance } from "../service.js";
import { EPHEMERAL, visibility } from "./visibility.js";
import {
  INFO,
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

export const RL_BUTTON_PREFIX = "rl_";
export const RL_SELECT_PREFIX = "rl_";

const RL_ROJO = "rl_rojo";
const RL_NEGRO = "rl_negro";
const RL_VERDE = "rl_verde";
const RL_AGAIN = "rl_again";
const RL_LO = "rl_lo";
const RL_HI = "rl_hi";

interface RoulettePending {
  client: Client;
  guildId: string;
  userId: string;
  channelId: string;
  messageId: string;
  bet: number;
  timeout: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, RoulettePending>();

function colorButtons(userId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${RL_ROJO}:${userId}`)
      .setLabel("Red")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${RL_NEGRO}:${userId}`)
      .setLabel("Black")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${RL_VERDE}:${userId}`)
      .setLabel("Green")
      .setStyle(ButtonStyle.Success),
  );
}

function numberSelects(userId: string): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const lo = new StringSelectMenuBuilder()
    .setCustomId(`${RL_LO}:${userId}`)
    .setPlaceholder("Number 0–17")
    .addOptions(
      Array.from({ length: 18 }, (_, n) => ({
        label: String(n),
        value: String(n),
      })),
    );
  const hi = new StringSelectMenuBuilder()
    .setCustomId(`${RL_HI}:${userId}`)
    .setPlaceholder("Number 18–36")
    .addOptions(
      Array.from({ length: 19 }, (_, i) => {
        const n = i + 18;
        return { label: String(n), value: String(n) };
      }),
    );
  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(lo),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(hi),
  ];
}

function tableComponents(userId: string) {
  return [colorButtons(userId), ...numberSelects(userId)];
}

function clearPending(key: string): void {
  const row = pending.get(key);
  if (!row) return;
  clearTimeout(row.timeout);
  pending.delete(key);
}

function armIdle(row: RoulettePending): void {
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

function promptEmbed(bet: number, currency: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(INFO)
    .setTitle("🎡 Roulette")
    .setDescription(
      `Bet: **${bet.toLocaleString("es-MX")}** ${currency}.\nChoose a color or a number. Money is charged on selection.`,
    );
}

async function resolveSpin(input: {
  guildId: string;
  userId: string;
  bet: number;
  tipo: RouletteBetType;
  valorNumero: number | null;
}): Promise<EmbedBuilder> {
  const { economy, casino } = await assertEconomyAndCasino(input.guildId, input.bet);
  await assertCooldownAvailable(input.guildId, input.userId, "roulette");
  await debitWalletStrict(input.guildId, input.userId, input.bet);

  const spun = spinEuropeanRoulette();
  const { won, color } = resolveRouletteBet({
    tipo: input.tipo,
    valorNumero: input.valorNumero,
    spun,
  });
  const history = pushRouletteHistory(input.guildId, spun);
  const currency = currencyOf(economy);

  const multiplier =
    input.tipo === "numero"
      ? casino.roulette.numberMultiplier
      : input.tipo === "verde"
        ? casino.roulette.greenMultiplier
        : casino.roulette.colorMultiplier;

  let payout = 0;
  let wallet = (await getUserEconomyBalance(input.guildId, input.userId)).wallet;
  if (won) {
    payout = Math.floor(input.bet * multiplier);
    wallet = (await creditWallet(input.guildId, input.userId, payout)).wallet;
  }

  await setCooldownMs(
    input.guildId,
    input.userId,
    "roulette",
    casino.roulette.cooldownSeconds * 1000,
  );

  const betLabel =
    input.tipo === "numero"
      ? `Number **${input.valorNumero}**`
      : input.tipo.charAt(0).toUpperCase() + input.tipo.slice(1);

  const embed = new EmbedBuilder()
    .setColor(won ? WIN : LOSE)
    .setTitle(won ? "🎡 Roulette — You won!" : "🎡 Roulette — You lost")
    .setDescription(
      [
        `The ball landed on **${spun}** ${rouletteColorEmoji(color)} (**${color}**).`,
        won
          ? `You won **${payout.toLocaleString("es-MX")}** ${currency} (x${multiplier}).`
          : `You lost **${input.bet.toLocaleString("es-MX")}** ${currency}.`,
      ].join("\n"),
    )
    .addFields(
      { name: "Your bet", value: betLabel, inline: true },
      {
        name: "Wallet",
        value: `**${wallet.toLocaleString("es-MX")}** ${currency}`,
        inline: true,
      },
    );

  if (casino.roulette.showNumberHistory && history.length > 0) {
    const chips = history
      .map((n) => `${rouletteColorEmoji(rouletteColor(n))}${n}`)
      .join(" · ");
    embed.addFields({ name: "Recent numbers", value: chips });
  }

  return embed;
}

/**
 * /roulette apuesta [tipo] [valor_numero]
 */
export async function handleRouletteCommand(
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
  const bet = interaction.options.getInteger("apuesta", true);
  const tipoRaw = (interaction.options.getString("tipo") ?? "")
    .trim()
    .toLowerCase();
  const tipo = ["rojo", "negro", "verde", "numero"].includes(tipoRaw)
    ? (tipoRaw as RouletteBetType)
    : null;
  const valorNumero = interaction.options.getInteger("valor_numero");
  const ephemeral = consumeInteractionEphemeral(interaction.id, true);

  if (tipo === "numero") {
    if (
      valorNumero === null ||
      !Number.isInteger(valorNumero) ||
      valorNumero < 0 ||
      valorNumero > 36
    ) {
      await interaction.reply({
        content:
          "❌ Provide `valor_numero` between 0 and 36, or pick the number at the table.",
        ...EPHEMERAL,
      });
      return;
    }
  }

  try {
    const { economy } = await assertEconomyAndCasino(guildId, bet);
    const currency = currencyOf(economy);

    if (tipo) {
      const embed = await resolveSpin({
        guildId,
        userId,
        bet,
        tipo,
        valorNumero: tipo === "numero" ? valorNumero : null,
      });
      await interaction.reply({
        embeds: [embed],
        components: [playAgainRow(`${RL_AGAIN}:${userId}`)],
        ...visibility(ephemeral),
      });
      const reply = await interaction.fetchReply();
      const key = tableKey(guildId, userId);
      clearPending(key);
      const row: RoulettePending = {
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
      components: tableComponents(userId),
      ...visibility(ephemeral),
    });
    const reply = await interaction.fetchReply();
    const key = tableKey(guildId, userId);
    clearPending(key);
    const row: RoulettePending = {
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

export async function handleRouletteButton(
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
      content: "❌ This table isn't yours.",
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
    if (action === RL_AGAIN) {
      const { economy } = await assertEconomyAndCasino(row.guildId, row.bet);
      await interaction.update({
        embeds: [promptEmbed(row.bet, currencyOf(economy))],
        components: tableComponents(ownerId),
      });
      armIdle(row);
      return;
    }

    const tipo: RouletteBetType | null =
      action === RL_ROJO
        ? "rojo"
        : action === RL_NEGRO
          ? "negro"
          : action === RL_VERDE
            ? "verde"
            : null;
    if (!tipo) {
      await interaction.reply({
        content: "❌ Unknown action.",
        ...EPHEMERAL,
      });
      return;
    }

    const embed = await resolveSpin({
      guildId: row.guildId,
      userId: row.userId,
      bet: row.bet,
      tipo,
      valorNumero: null,
    });
    await interaction.update({
      embeds: [embed],
      components: [playAgainRow(`${RL_AGAIN}:${ownerId}`)],
    });
    armIdle(row);
  } catch (error) {
    const msg =
      error instanceof EconomyError
        ? error.message
        : "Couldn't finish the roulette.";
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `❌ ${msg}`, ...EPHEMERAL });
    }
  }
}

export async function handleRouletteSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "This menu only works in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const { ownerId } = parseOwnerCustomId(interaction.customId);
  if (!ownerId || interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "❌ This table isn't yours.",
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

  const raw = interaction.values[0];
  const valorNumero = Number(raw);
  if (!Number.isInteger(valorNumero) || valorNumero < 0 || valorNumero > 36) {
    await interaction.reply({
      content: "❌ Invalid number.",
      ...EPHEMERAL,
    });
    return;
  }

  try {
    const embed = await resolveSpin({
      guildId: row.guildId,
      userId: row.userId,
      bet: row.bet,
      tipo: "numero",
      valorNumero,
    });
    await interaction.update({
      embeds: [embed],
      components: [playAgainRow(`${RL_AGAIN}:${ownerId}`)],
    });
    armIdle(row);
  } catch (error) {
    const msg =
      error instanceof EconomyError
        ? error.message
        : "Couldn't finish the roulette.";
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `❌ ${msg}`, ...EPHEMERAL });
    }
  }
}
