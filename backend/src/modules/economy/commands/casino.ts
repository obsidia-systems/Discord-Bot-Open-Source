import type { ChatInputCommandInteraction } from "discord.js";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import { assertCasinoBetAllowed } from "../casinoService.js";
import { EconomyError, getEconomyConfig } from "../service.js";

type CasinoGame = "coinflip" | "roulette" | "blackjack";

/**
 * Stub compartido: economía activa + casino activo + límites de apuesta.
 */
async function handleCasinoStub(
  interaction: ChatInputCommandInteraction,
  game: CasinoGame,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "Este comando solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const economy = getEconomyConfig(interaction.guildId);
  if (!economy.isActive) {
    await interaction.reply({
      content: "⛔ La economía está desactivada en este servidor.",
      ephemeral: true,
    });
    return;
  }

  const bet = interaction.options.getInteger("cantidad", true);
  const ephemeral = consumeInteractionEphemeral(interaction.id, true);

  try {
    assertCasinoBetAllowed(interaction.guildId, bet);
  } catch (error) {
    const message =
      error instanceof EconomyError
        ? error.message
        : "No se pudo validar la apuesta.";
    await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
    return;
  }

  await interaction.reply({
    content: `🚧 \`/${game}\` está en construcción.\nApuesta validada: **${bet.toLocaleString("es-MX")}** ${economy.currencyName || "monedas"}.`,
    ephemeral,
  });
}

export async function handleCoinflipCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await handleCasinoStub(interaction, "coinflip");
}

export async function handleRouletteCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await handleCasinoStub(interaction, "roulette");
}

export async function handleBlackjackCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await handleCasinoStub(interaction, "blackjack");
}
