import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import {
  PokemonApiError,
  buildEncounterEmbedFields,
  getPokemonData,
  getPokemonEncounters,
  getPokemonSpecies,
  getTypeColor,
  resolveDisplayName,
} from "../../../services/pokemonApi.js";
import {
  PokemonError,
  assertPokemonCommandAllowed,
} from "../service.js";
import { pokemonAccessFromInteraction } from "../access.js";

/**
 * /location pokemon — encuentros salvajes agrupados por juego (fields).
 */
export async function handleLocationCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "Este comando solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const query = (interaction.options.getString("pokemon", true) ?? "")
    .trim()
    .toLowerCase();

  let forceEphemeral = true;
  let fallbackColor = "#EF4444";
  let language: "es" | "en" = "es";

  try {
    const config = assertPokemonCommandAllowed(
      interaction.guildId,
      "location",
      interaction.channelId,
      pokemonAccessFromInteraction(interaction),
    );
    forceEphemeral = config.forceEphemeral;
    fallbackColor = config.embedColor;
    language = config.language;
  } catch (error) {
    const message =
      error instanceof PokemonError
        ? error.message
        : "No se pudo validar el comando Pokémon.";
    await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
    return;
  }

  const ephemeral = forceEphemeral
    ? true
    : consumeInteractionEphemeral(interaction.id, true);

  await interaction.deferReply({ ephemeral });

  try {
    const data = await getPokemonData(query);
    const encounters = await getPokemonEncounters(String(data.id));

    let species = null;
    try {
      species = await getPokemonSpecies(data.speciesName || data.name);
    } catch {
      /* nombre localizado opcional */
    }

    const displayName = resolveDisplayName(species, data.name, language);
    const color = getTypeColor(data.types[0], fallbackColor);
    const fields = buildEncounterEmbedFields(encounters);

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`Ubicaciones de ${displayName}`)
      .setFooter({
        text:
          encounters.length === 0
            ? "PokéAPI · Sin encuentros salvajes"
            : `PokéAPI · ${encounters.length} versión(es) con encuentros`,
      });

    if (encounters.length === 0) {
      embed.setDescription(
        "Este Pokémon no se encuentra de forma salvaje en la hierba.",
      );
    } else {
      embed.addFields(fields);
    }

    if (data.spriteUrl) {
      embed.setThumbnail(data.spriteUrl);
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const message =
      error instanceof PokemonApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudieron obtener las ubicaciones.";
    await interaction.editReply({ content: `❌ ${message}` });
  }
}
