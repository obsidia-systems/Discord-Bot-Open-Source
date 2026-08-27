import type { ChatInputCommandInteraction } from "discord.js";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import {
  PokemonError,
  assertPokemonCommandAllowed,
} from "../service.js";
import { pokemonAccessFromInteraction } from "../access.js";

/**
 * Stub compartido de comandos Pokémon pendientes.
 * Valida plugin activo, toggle del comando, canal permitido y anti-sniping.
 * Nota: `/pokeinfo` y `/location` tienen handlers reales (no usar este stub).
 */
export async function handlePokemonStubCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "Este comando solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const commandName = interaction.commandName;
  let forceEphemeral = true;

  try {
    const config = assertPokemonCommandAllowed(
      interaction.guildId,
      commandName,
      interaction.channelId,
      pokemonAccessFromInteraction(interaction),
    );
    forceEphemeral = config.forceEphemeral;
  } catch (error) {
    const message =
      error instanceof PokemonError
        ? error.message
        : "No se pudo validar el comando Pokémon.";
    await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
    return;
  }

  const pokemon = interaction.options.getString("pokemon");
  const ephemeral = forceEphemeral
    ? true
    : consumeInteractionEphemeral(interaction.id, true);

  await interaction.reply({
    content: [
      `🚧 \`/${commandName}\` está registrado. Lógica pendiente.`,
      pokemon ? `Consulta: **${pokemon}**` : null,
      "Fuentes previstas: PokéAPI + datos competitivos (Smogon).",
    ]
      .filter(Boolean)
      .join("\n"),
    ephemeral,
  });
}

export async function handleTeambuilderCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await handlePokemonStubCommand(interaction);
}

export async function handleWeaknessCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await handlePokemonStubCommand(interaction);
}

export async function handleBreedingCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await handlePokemonStubCommand(interaction);
}

export async function handleCountersCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await handlePokemonStubCommand(interaction);
}

export async function handleSandwichCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await handlePokemonStubCommand(interaction);
}
