import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import { EmbedBuilder } from "discord.js";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import {
  PokemonApiError,
  buildSmogonPokemonUrl,
  formatAbilityLabel,
  formatAlternativeForms,
  formatCompetitiveMetaField,
  formatEvolutionLineField,
  formatPhysiqueLine,
  formatStatsCodeBlock,
  formatTypeLabel,
  getCompetitiveData,
  getEvolutionChain,
  getPokemonData,
  getPokemonSpecies,
  getTypeColor,
  isPokemonCacheReady,
  resolveDisplayName,
  resolveEvolutionLine,
  resolvePokemonForGeneration,
  searchPokemonAutocomplete,
  warmPokemonAutocompleteCache,
} from "../../../services/pokemonApi.js";
import {
  formatPokemonTypeWithEmoji,
  POKEMON_UI_EMOJIS,
} from "../../../utils/pokemonEmojis.js";
import {
  PokemonError,
  assertPokemonCommandAllowed,
} from "../service.js";
import { pokemonAccessFromInteraction } from "../access.js";

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
 * /pokeinfo pokemon [generacion] — ficha enriquecida.
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
  const generationOpt = interaction.options.getInteger("generacion");

  let forceEphemeral = true;
  let fallbackColor = "#EF4444";
  let language: "es" | "en" = "es";
  let defaultGeneration = 9;

  try {
    const config = assertPokemonCommandAllowed(
      interaction.guildId,
      "pokeinfo",
      interaction.channelId,
      pokemonAccessFromInteraction(interaction),
    );
    forceEphemeral = config.forceEphemeral;
    fallbackColor = config.embedColor;
    language = config.language;
    defaultGeneration = config.defaultGeneration;
  } catch (error) {
    const message =
      error instanceof PokemonError
        ? error.message
        : "No se pudo validar el comando Pokémon.";
    await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
    return;
  }

  const generation =
    generationOpt !== null && generationOpt !== undefined
      ? Math.max(1, Math.min(9, generationOpt))
      : defaultGeneration;

  const ephemeral = forceEphemeral
    ? true
    : consumeInteractionEphemeral(interaction.id, true);

  await interaction.deferReply({ ephemeral });

  try {
    const data = await getPokemonData(query);
    const snapshot = resolvePokemonForGeneration(data, generation);

    let species = null;
    try {
      species = await getPokemonSpecies(data.speciesName || data.name);
    } catch {
      /* nombre / formas / evolución opcionales */
    }

    const displayName = resolveDisplayName(species, data.name, language);
    const idPadded = String(snapshot.id).padStart(3, "0");
    const primaryType = snapshot.types[0];
    const color = getTypeColor(primaryType, fallbackColor);
    const smogonUrl = buildSmogonPokemonUrl(snapshot.name, generation);

    const typesText =
      snapshot.types.length > 0
        ? snapshot.types
            .map((t) =>
              formatPokemonTypeWithEmoji(t, formatTypeLabel(t, language)),
            )
            .join(" / ")
        : "—";

    const abilitiesText =
      snapshot.abilities.length > 0
        ? snapshot.abilities
            .map((a) => {
              const label = formatAbilityLabel(a.name);
              return a.isHidden ? `${label} *(Oculta)*` : label;
            })
            .join("\n")
        : "—";

    const physique = formatPhysiqueLine(snapshot.heightM, snapshot.weightKg);
    const formsText = formatAlternativeForms(species, snapshot.name);
    const competitive = await getCompetitiveData(snapshot.name, generation);

    let evolutionLineText: string | null = null;
    if (species?.evolutionChainUrl) {
      try {
        const chain = await getEvolutionChain(species.evolutionChainUrl);
        const summary = resolveEvolutionLine(
          chain,
          species.name,
          species.varieties,
          language,
        );
        evolutionLineText = formatEvolutionLineField(
          summary,
          language,
          POKEMON_UI_EMOJIS.mega_evolution,
        );
      } catch {
        /* cadena evolutiva opcional */
      }
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`#${idPadded} — ${displayName}`)
      .setURL(smogonUrl)
      .setDescription(physique)
      .addFields(
        { name: "Tipos", value: typesText, inline: true },
        { name: "🛡️ Habilidades", value: abilitiesText, inline: true },
        {
          name: "📅 Generación",
          value: `Gen ${generation}`,
          inline: true,
        },
        {
          name: "📊 Estadísticas Base",
          value: formatStatsCodeBlock(snapshot.stats),
          inline: false,
        },
        {
          name: "⚔️ Meta Competitivo",
          value: formatCompetitiveMetaField(competitive),
          inline: true,
        },
      )
      .setFooter({
        text: [
          `PokéAPI · Gen ${generation}`,
          generationOpt == null ? "(default panel)" : null,
          competitive.format ? `Meta ${competitive.format}` : "Meta Smogon/PS",
        ]
          .filter(Boolean)
          .join(" · "),
      });

    if (evolutionLineText) {
      embed.addFields({
        name: "🧬 Línea Evolutiva",
        value: evolutionLineText,
        inline: false,
      });
    }

    if (formsText) {
      embed.addFields({
        name: "🧬 Formas Alternativas",
        value: formsText,
        inline: false,
      });
    }

    if (snapshot.spriteUrl) {
      embed.setThumbnail(snapshot.spriteUrl);
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
