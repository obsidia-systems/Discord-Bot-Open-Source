import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import { EmbedBuilder } from "discord.js";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import {
  PokemonApiError,
  formatAbilityLabel,
  formatTypeLabel,
  getPokemonData,
  getPokemonSpecies,
  getTypeColor,
  isPokemonCacheReady,
  resolveDisplayName,
  searchPokemonAutocomplete,
  warmPokemonAutocompleteCache,
} from "../../../services/pokemonApi.js";
import {
  PokemonError,
  assertPokemonCommandAllowed,
  getPokemonConfig,
} from "../service.js";

/**
 * Autocomplete de la opción `pokemon` (índice en memoria).
 */
export async function handlePokeinfoAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "pokemon") {
    await interaction.respond([]);
    return;
  }

  if (!isPokemonCacheReady()) {
    try {
      await warmPokemonAutocompleteCache();
    } catch {
      await interaction.respond([]);
      return;
    }
  }

  const choices = searchPokemonAutocomplete(String(focused.value ?? ""), 25);
  await interaction.respond(choices);
}

/**
 * /pokeinfo pokemon — ficha con tipos, habilidades y stats base.
 */
export async function handlePokeinfoCommand(
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
      "pokeinfo",
      interaction.channelId,
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
    let species = null;
    try {
      species = await getPokemonSpecies(data.name);
    } catch {
      /* nombre localizado opcional */
    }

    const displayName = resolveDisplayName(species, data.name, language);
    const idPadded = String(data.id).padStart(3, "0");
    const primaryType = data.types[0];
    const color = getTypeColor(primaryType, fallbackColor);

    const typesText =
      data.types.length > 0
        ? data.types.map((t) => formatTypeLabel(t, language)).join(" / ")
        : "—";

    const abilitiesText =
      data.abilities.length > 0
        ? data.abilities
            .map((a) => {
              const label = formatAbilityLabel(a.name);
              return a.isHidden ? `${label} *(Oculta)*` : label;
            })
            .join("\n")
        : "—";

    const { stats } = data;
    const statsText = [
      `**HP** ${stats.hp}`,
      `**Atk** ${stats.attack}`,
      `**Def** ${stats.defense}`,
      `**SpA** ${stats.specialAttack}`,
      `**SpD** ${stats.specialDefense}`,
      `**Spe** ${stats.speed}`,
      `**BST** ${stats.bst}`,
    ].join(" · ");

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`#${idPadded} — ${displayName}`)
      .addFields(
        { name: "🩸 Tipos", value: typesText, inline: true },
        { name: "🛡️ Habilidades", value: abilitiesText, inline: true },
        { name: "📊 Estadísticas Base", value: statsText, inline: false },
      )
      .setFooter({
        text: `PokéAPI · Gen config: ${getPokemonConfig(interaction.guildId).defaultGeneration}`,
      });

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
          : "No se pudo obtener el Pokémon.";
    await interaction.editReply({ content: `❌ ${message}` });
  }
}
