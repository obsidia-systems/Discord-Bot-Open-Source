import type { ChatInputCommandInteraction } from "discord.js";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import {
  PokemonApiError,
  capitalizePokemonName,
  getPokemonData,
  getPokemonSpecies,
  getTypeColor,
  resolveDisplayName,
} from "../../../services/pokemonApi.js";
import {
  type CompetitiveCounterEntry,
  formatCounterThreatLabel,
  getPokemonCounters,
  isMegaSpeciesName,
  toSmogonSpeciesCandidates,
} from "../../../services/smogonService.js";
import {
  PokemonError,
  assertPokemonCommandAllowed,
} from "../service.js";
import { pokemonAccessFromInteraction } from "../access.js";
import { createBasePokemonEmbed } from "../../../utils/pokemonEmbed.js";

const FALLBACK_DESCRIPTION =
  "⚠️ No hay datos estadísticos recientes de counters para este Pokémon en las tiers principales. Utiliza el comando `/weakness` para evaluar sus puntos ciegos elementales.";

function resolveCountersDisplayName(
  species: Awaited<ReturnType<typeof getPokemonSpecies>> | null,
  apiName: string,
  language: "es" | "en",
): string {
  if (
    isMegaSpeciesName(apiName) ||
    /-(alola|galar|hisui|paldea|gmax)/i.test(apiName)
  ) {
    return toSmogonSpeciesCandidates(apiName)[0] ?? capitalizePokemonName(apiName);
  }
  return resolveDisplayName(species, apiName, language);
}

function formatCounterLine(entry: CompetitiveCounterEntry, index: number): string {
  return `**${index}. ${entry.name}**\n↳ ${formatCounterThreatLabel(entry.score)}`;
}

function buildCounterColumns(
  counters: CompetitiveCounterEntry[],
): Array<{ name: string; value: string; inline: boolean }> {
  const left = counters.slice(0, 5);
  const right = counters.slice(5, 10);

  const leftValue =
    left.length > 0
      ? left.map((c, i) => formatCounterLine(c, i + 1)).join("\n")
      : "_—_";
  const rightValue =
    right.length > 0
      ? right.map((c, i) => formatCounterLine(c, i + 6)).join("\n")
      : "_—_";

  return [
    {
      name: "☠️ Counters (1-5)",
      value: leftValue.slice(0, 1024),
      inline: true,
    },
    {
      name: "☠️ Counters (6-10)",
      value: rightValue.slice(0, 1024),
      inline: true,
    },
  ];
}

/**
 * /counters pokemon [publico]
 */
export async function handleCountersCommand(
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
  const isPublic = interaction.options.getBoolean("publico") ?? false;

  let forceEphemeral = true;
  let fallbackColor = "#EF4444";
  let language: "es" | "en" = "es";
  let defaultGeneration = 9;

  try {
    const config = assertPokemonCommandAllowed(
      interaction.guildId,
      "counters",
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

  const ephemeral = isPublic
    ? false
    : forceEphemeral
      ? true
      : consumeInteractionEphemeral(interaction.id, true);

  await interaction.deferReply({ ephemeral });

  try {
    const data = await getPokemonData(query);

    let species = null;
    try {
      species = await getPokemonSpecies(data.speciesName || data.name);
    } catch {
      /* opcional */
    }

    const displayName = resolveCountersDisplayName(
      species,
      data.name,
      language,
    );
    const color = getTypeColor(data.types[0], fallbackColor);

    let result = null;
    try {
      result = await getPokemonCounters(data.name, defaultGeneration, {
        limit: 10,
      });
    } catch {
      result = null;
    }

    if (!result || result.counters.length === 0) {
      const empty = createBasePokemonEmbed(
        `Gen ${defaultGeneration} • Usage stats`,
      )
        .setColor(color)
        .setTitle(`🚫 Amenazas Principales: ${displayName}`)
        .setDescription(FALLBACK_DESCRIPTION);
      if (data.spriteUrl) empty.setThumbnail(data.spriteUrl);
      await interaction.editReply({ embeds: [empty] });
      return;
    }

    const embed = createBasePokemonEmbed(
      `Basado en estadísticas de ${result.formatLabel}`,
    )
      .setColor(color)
      .setTitle(`🚫 Amenazas Principales: ${displayName}`)
      .setDescription(
        "Los Pokémon que estadísticamente vencen o frenan en seco (wall) a esta especie.",
      )
      .addFields(...buildCounterColumns(result.counters));

    if (data.spriteUrl) embed.setThumbnail(data.spriteUrl);

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const message =
      error instanceof PokemonApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudieron obtener los counters.";
    await interaction.editReply({ content: `❌ ${message}` });
  }
}
