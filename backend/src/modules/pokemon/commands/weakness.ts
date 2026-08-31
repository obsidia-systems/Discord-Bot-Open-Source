import type { ChatInputCommandInteraction } from "discord.js";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import {
  PokemonApiError,
  formatAbilityLabel,
  formatTypeLabel,
  getPokemonData,
  getPokemonSpecies,
  getTypeColor,
  resolveDisplayName,
  resolvePokemonForGeneration,
} from "../../../services/pokemonApi.js";
import {
  formatPokemonTypeWithEmoji,
  getPokemonTypeEmoji,
} from "../../../utils/pokemonEmojis.js";
import { createBasePokemonEmbed } from "../../../utils/pokemonEmbed.js";
import {
  DEFENSIVE_MATCHUP_ORDER,
  calculateDefensiveMatchup,
  isPokemonTypeName,
  type PokemonTypeName,
} from "../../../utils/typeChart.js";
import {
  PokemonError,
  assertPokemonCommandAllowed,
} from "../service.js";
import { pokemonAccessFromInteraction } from "../access.js";

/**
 * Notas cortas de habilidades que alteran el matchup defensivo.
 * Clave = slug PokéAPI.
 */
const ABILITY_DEFENSE_NOTES: Record<string, string> = {
  levitate: "Inmunidad a Tierra",
  "flash-fire": "Inmunidad / absorción de Fuego",
  "water-absorb": "Inmunidad / absorción de Agua",
  "volt-absorb": "Inmunidad / absorción de Eléctrico",
  "lightning-rod": "Inmunidad a Eléctrico (atrae)",
  "storm-drain": "Inmunidad a Agua (atrae)",
  "sap-sipper": "Inmunidad a Planta",
  "motor-drive": "Inmunidad a Eléctrico",
  "earth-eater": "Inmunidad / absorción de Tierra",
  "well-baked-body": "Inmunidad a Fuego",
  "dry-skin": "Daño extra de Fuego; cura con Agua",
  "thick-fat": "Resistencia ×½ a Fuego y Hielo",
  "heatproof": "Resistencia ×½ a Fuego",
  "water-bubble": "Resistencia ×½ a Fuego",
  fluffy: "Resistencia ×½ a contactos; debilidad ×2 a Fuego",
  filter: "Reduce daño de golpes super efectivos",
  "solid-rock": "Reduce daño de golpes super efectivos",
  "prism-armor": "Reduce daño de golpes super efectivos",
  wonderguard: "Solo recibe daño super efectivo",
  "wonder-guard": "Solo recibe daño super efectivo",
  "purifying-salt": "Resistencia ×½ a Fantasma",
};

function formatTypeList(
  types: PokemonTypeName[],
  language: "es" | "en",
): string {
  return types
    .map((t) => {
      const label = formatTypeLabel(t, language);
      const emoji = getPokemonTypeEmoji(t);
      return emoji ? `${emoji} ${label}` : label;
    })
    .join("\n");
}

function buildAbilityNotesField(
  abilities: Array<{ name: string; isHidden: boolean }>,
): { name: string; value: string; inline: boolean } | null {
  if (abilities.length === 0) return null;

  const lines = abilities.map((a) => {
    const label = formatAbilityLabel(a.name);
    const note = ABILITY_DEFENSE_NOTES[a.name.toLowerCase()];
    const hidden = a.isHidden ? " *(Oculta)*" : "";
    if (note) return `• **${label}**${hidden} — ${note}`;
    return `• **${label}**${hidden}`;
  });

  const hasSpecial = abilities.some(
    (a) => ABILITY_DEFENSE_NOTES[a.name.toLowerCase()],
  );
  const header = hasSpecial
    ? "_Algunas habilidades cambian el daño recibido:_"
    : "_Las habilidades pueden alterar estas debilidades en combate:_";

  return {
    name: "⚠️ Notas de Habilidad",
    value: `${header}\n${lines.join("\n")}`.slice(0, 1024),
    inline: false,
  };
}

/**
 * /weakness pokemon [teratipo] [publico]
 */
export async function handleWeaknessCommand(
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
  const teraRaw = (interaction.options.getString("teratipo") ?? "")
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
      "weakness",
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

  const teraType =
    teraRaw && isPokemonTypeName(teraRaw) ? (teraRaw as PokemonTypeName) : null;

  const ephemeral = isPublic
    ? false
    : forceEphemeral
      ? true
      : consumeInteractionEphemeral(interaction.id, true);

  await interaction.deferReply({ ephemeral });

  try {
    const data = await getPokemonData(query);
    const snapshot = resolvePokemonForGeneration(data, defaultGeneration);

    let species = null;
    try {
      species = await getPokemonSpecies(data.speciesName || data.name);
    } catch {
      /* opcional */
    }

    const displayName = resolveDisplayName(species, data.name, language);
    const calcTypes: string[] = teraType
      ? [teraType]
      : snapshot.types.length > 0
        ? snapshot.types
        : [];

    if (calcTypes.length === 0) {
      await interaction.editReply({
        content: "❌ No se pudieron determinar los tipos del Pokémon.",
      });
      return;
    }

    const matchup = calculateDefensiveMatchup(calcTypes);
    const colorType = teraType ?? snapshot.types[0];
    const color = getTypeColor(colorType, fallbackColor);

    const teraLabel = teraType
      ? formatTypeLabel(teraType, language)
      : null;
    const title = teraLabel
      ? `🛡️ Análisis Defensivo: ${displayName} [Teratipo ${teraLabel}]`
      : `🛡️ Análisis Defensivo: ${displayName}`;

    const typesLine = calcTypes
      .map((t) =>
        formatPokemonTypeWithEmoji(t, formatTypeLabel(t, language)),
      )
      .join(" · ");

    const embed = createBasePokemonEmbed(
      `Gen ${defaultGeneration} • Tabla de tipos`,
    )
      .setColor(color)
      .setTitle(title.slice(0, 256))
      .setDescription(
        teraType
          ? `**Teratipo activo:** ${typesLine}\n_Tipos biológicos ignorados._`
          : `**Tipos:** ${typesLine}`,
      );

    if (data.spriteUrl) {
      embed.setThumbnail(data.spriteUrl);
    }

    for (const { key, title: fieldTitle } of DEFENSIVE_MATCHUP_ORDER) {
      const list = matchup[key];
      if (!list || list.length === 0) continue;
      embed.addFields({
        name: fieldTitle,
        value: formatTypeList(list, language).slice(0, 1024),
        inline: true,
      });
    }

    const abilityField = buildAbilityNotesField(snapshot.abilities);
    if (abilityField) {
      embed.addFields(abilityField);
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const message =
      error instanceof PokemonApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo calcular el análisis defensivo.";
    await interaction.editReply({ content: `❌ ${message}` });
  }
}
