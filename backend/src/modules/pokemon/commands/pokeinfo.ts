import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import { resolvePokeinfoFormat } from "@adobos/shared";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import {
  PokemonApiError,
  buildMegaBySpeciesMap,
  buildSmogonPokemonUrl,
  formatAbilityLabel,
  formatAlternativeForms,
  formatEvolutionAsciiTree,
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
  resolvePokemonForGeneration,
  searchPokemonAutocomplete,
  warmPokemonAutocompleteCache,
} from "../../../services/pokemonApi.js";
import { formatCompetitiveBulletList } from "../../../services/smogonService.js";
import {
  createBasePokemonEmbed,
} from "../../../utils/pokemonEmbed.js";
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
 * /pokeinfo pokemon [juego_formato] [publico] — ficha enriquecida.
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
  const juegoFormato = interaction.options.getString("juego_formato");
  const isPublic = interaction.options.getBoolean("publico") ?? false;

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

  const format = resolvePokeinfoFormat(juegoFormato, defaultGeneration);
  const generation = format.generation;

  // `publico: true` anula el efímero forzado del panel.
  const ephemeral = isPublic
    ? false
    : forceEphemeral
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
            .join("\n")
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
    const competitive = await getCompetitiveData(snapshot.name, generation, {
      preferredFormatId: format.preferredFormatId,
      useNatDex: format.useNatDex,
    });

    let evolutionLineText: string | null = null;
    if (species?.evolutionChainUrl) {
      try {
        const chain = await getEvolutionChain(species.evolutionChainUrl);
        let finalStageVarieties = species.varieties;
        let leaf = chain;
        while (leaf.evolvesTo.length === 1) {
          leaf = leaf.evolvesTo[0]!;
        }
        if (
          leaf.evolvesTo.length === 0 &&
          leaf.speciesName !== species.name
        ) {
          try {
            const leafSpecies = await getPokemonSpecies(leaf.speciesName);
            finalStageVarieties = leafSpecies.varieties;
          } catch {
            /* megas de etapa final opcionales */
          }
        }

        const megasBySpecies = buildMegaBySpeciesMap(
          chain,
          species.name,
          species.varieties,
          language,
          finalStageVarieties,
        );
        evolutionLineText = formatEvolutionAsciiTree(
          chain,
          language,
          POKEMON_UI_EMOJIS.mega_evolution,
          megasBySpecies,
        );
      } catch {
        /* cadena evolutiva opcional */
      }
    }

    const embed = createBasePokemonEmbed(
      [
        format.label,
        format.key === "default" ? "(default panel)" : null,
        competitive.format ? `Meta ${competitive.format}` : "Meta competitiva",
      ]
        .filter(Boolean)
        .join(" · "),
    )
      .setColor(color)
      .setTitle(`#${idPadded} — ${displayName}`)
      .setURL(smogonUrl)
      .setDescription(physique)
      .addFields(
        { name: "Tipos", value: typesText, inline: true },
        { name: "🛡️ Habilidades", value: abilitiesText, inline: true },
        {
          name: "⚔️ Meta Competitivo",
          value: `**Tier:** ${competitive.tier}`,
          inline: false,
        },
        {
          name: "Objetos",
          value: formatCompetitiveBulletList(competitive.items),
          inline: true,
        },
        {
          name: "Naturalezas",
          value: formatCompetitiveBulletList(competitive.natures),
          inline: true,
        },
        {
          name: "📊 Estadísticas Base",
          value: formatStatsCodeBlock(snapshot.stats),
          inline: false,
        },
      );

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
