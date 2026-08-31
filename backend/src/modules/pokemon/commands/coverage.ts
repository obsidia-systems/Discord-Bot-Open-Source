import type {
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type EmbedBuilder,
} from "discord.js";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import {
  PokemonApiError,
  formatTypeLabel,
  getPokemonData,
  getPokemonSpecies,
  getTypeColor,
  resolveDisplayName,
} from "../../../services/pokemonApi.js";
import {
  type CoverageMoveOption,
  getCoverageMovepoolOptions,
} from "../../../services/pokemonMoves.js";
import {
  formatPokemonTypeWithEmoji,
  getPokemonTypeEmoji,
} from "../../../utils/pokemonEmojis.js";
import { createBasePokemonEmbed } from "../../../utils/pokemonEmbed.js";
import { calculateCoverage } from "../../../utils/typeChart.js";
import {
  PokemonError,
  assertPokemonCommandAllowed,
} from "../service.js";
import { pokemonAccessFromInteraction } from "../access.js";

/** Prefijo select `/coverage`. */
export const COVERAGE_SELECT_PREFIX = "cov_sel_";

/**
 * customId: `cov_sel_{ownerId}_{pokemonId}_{generation}`
 */
export function buildCoverageSelectCustomId(
  ownerId: string,
  pokemonId: number,
  generation: number,
): string {
  return `${COVERAGE_SELECT_PREFIX}${ownerId}_${pokemonId}_${generation}`;
}

export function parseCoverageSelectCustomId(customId: string): {
  ownerId: string;
  pokemonId: number;
  generation: number;
} | null {
  if (!customId.startsWith(COVERAGE_SELECT_PREFIX)) return null;
  const raw = customId.slice(COVERAGE_SELECT_PREFIX.length);
  const parts = raw.split("_");
  if (parts.length < 3) return null;
  const generation = Number(parts[parts.length - 1]);
  const pokemonId = Number(parts[parts.length - 2]);
  const ownerId = parts.slice(0, -2).join("_");
  if (!ownerId || !Number.isFinite(pokemonId) || !Number.isFinite(generation)) {
    return null;
  }
  return {
    ownerId,
    pokemonId: Math.trunc(pokemonId),
    generation: Math.trunc(generation),
  };
}

function truncateLabel(text: string, max = 100): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function damageClassLabel(
  damageClass: string,
  language: "es" | "en",
): string {
  const key = damageClass.toLowerCase();
  if (language === "en") {
    if (key === "physical") return "Physical";
    if (key === "special") return "Special";
    return "Status";
  }
  if (key === "physical") return "Físico";
  if (key === "special") return "Especial";
  return "Estado";
}

function formatAttackLine(
  move: CoverageMoveOption,
  language: "es" | "en",
): string {
  const emoji = getPokemonTypeEmoji(move.type) ?? "";
  const isStatus = move.damageClass === "status";
  const status =
    isStatus
      ? language === "es"
        ? " *(Estado)*"
        : " *(Status)*"
      : "";
  const prefix = emoji ? `${emoji} ` : "";
  const name = isStatus ? `*${move.displayName}*` : `**${move.displayName}**`;
  return `${prefix}${name}${status}`;
}

/**
 * Parte los ataques en dos columnas Discord:
 * slots 1–2 a la izquierda; 3–4 a la derecha (con 3: 2+1).
 */
function buildAttackSlotFields(
  moves: CoverageMoveOption[],
  language: "es" | "en",
): Array<{ name: string; value: string; inline: boolean }> {
  const left = moves.slice(0, 2);
  const right = moves.slice(2);

  return [
    {
      name: "⚔️ Slot 1 y 2",
      value:
        left.length > 0
          ? left.map((m) => formatAttackLine(m, language)).join("\n").slice(0, 1024)
          : "_—_",
      inline: true,
    },
    {
      name: "⚔️ Slot 3 y 4",
      value:
        right.length > 0
          ? right.map((m) => formatAttackLine(m, language)).join("\n").slice(0, 1024)
          : "_—_",
      inline: true,
    },
  ];
}

function formatTypeColumn(
  types: string[],
  language: "es" | "en",
  emptyLabel: string,
): string {
  if (types.length === 0) return emptyLabel;
  return types
    .map((t) =>
      formatPokemonTypeWithEmoji(t, formatTypeLabel(t, language)),
    )
    .join("\n")
    .slice(0, 1024);
}

function buildSelectRow(options: {
  moves: CoverageMoveOption[];
  ownerId: string;
  pokemonId: number;
  generation: number;
  language: "es" | "en";
  selected?: string[];
}): ActionRowBuilder<StringSelectMenuBuilder> {
  const selected = new Set(
    (options.selected ?? []).map((v) => v.toLowerCase()),
  );
  const menuOptions = options.moves.map((move) => {
    const typeLabel = formatTypeLabel(move.type, options.language);
    const classLabel = damageClassLabel(move.damageClass, options.language);
    const option = new StringSelectMenuOptionBuilder()
      .setLabel(truncateLabel(move.displayName))
      .setValue(move.apiName.slice(0, 100))
      .setDescription(truncateLabel(`${typeLabel} · ${classLabel}`, 100));
    if (selected.has(move.apiName.toLowerCase())) {
      option.setDefault(true);
    }
    return option;
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(
      buildCoverageSelectCustomId(
        options.ownerId,
        options.pokemonId,
        options.generation,
      ),
    )
    .setPlaceholder("Elige hasta 4 ataques...")
    .setMinValues(1)
    .setMaxValues(Math.min(4, Math.max(1, options.moves.length)))
    .addOptions(menuOptions);

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function buildSelectionEmbed(options: {
  displayName: string;
  color: number;
  spriteUrl: string | null;
  truncated: boolean;
  totalMoves: number;
  menuCount: number;
}): EmbedBuilder {
  const embed = createBasePokemonEmbed("Elige 1–4 movimientos en el menú")
    .setColor(options.color)
    .setTitle(`🎯 Cobertura de ${options.displayName}`)
    .setDescription(
      [
        `Selecciona hasta **4 ataques** de **${options.displayName}**.`,
        "_Los movimientos de estado aparecen en el menú, pero no cuentan para el cálculo de daño._",
        options.truncated
          ? `_Movepool grande (${options.totalMoves}): se muestran los ${options.menuCount} más usados en sets Smogon._`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );

  if (options.spriteUrl) embed.setThumbnail(options.spriteUrl);
  return embed;
}

function buildResultEmbed(options: {
  displayName: string;
  color: number;
  spriteUrl: string | null;
  selected: CoverageMoveOption[];
  language: "es" | "en";
}): EmbedBuilder {
  const offensive = options.selected.filter(
    (m) => m.damageClass !== "status",
  );
  const coverage = calculateCoverage(offensive.map((m) => m.type));
  const slotFields = buildAttackSlotFields(
    options.selected,
    options.language,
  );

  const embed = createBasePokemonEmbed(
    offensive.length === 0
      ? "Solo movimientos de estado — sin cobertura ofensiva"
      : `Tipos ofensivos: ${offensive.length} · Puedes cambiar la selección`,
  )
    .setColor(options.color)
    .setTitle(`🎯 Cobertura de ${options.displayName}`)
    .addFields(
      ...slotFields,
      // Separador invisible: fuerza fila nueva (2x2: inputs arriba, outputs abajo).
      { name: "\u200B", value: "\u200B", inline: false },
      {
        name: "💥 Súper Efectivo (×2+)",
        value: formatTypeColumn(
          coverage.superEffective,
          options.language,
          "_Ninguno_",
        ),
        inline: true,
      },
      {
        name: "🛑 Muro Defensivo (Walled)",
        value: formatTypeColumn(
          coverage.blindSpots,
          options.language,
          "✅ Ningún tipo elemental tiene reducción de daño frente a todo este conjunto de movimientos.",
        ),
        inline: true,
      },
    );

  if (options.spriteUrl) embed.setThumbnail(options.spriteUrl);
  return embed;
}

/**
 * /coverage pokemon [publico]
 */
export async function handleCoverageCommand(
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
      "coverage",
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
    const pool = await getCoverageMovepoolOptions(
      data.name,
      defaultGeneration,
      language,
    );

    if (pool.moves.length === 0) {
      await interaction.editReply({
        content: `❌ **${data.name}** no tiene movimientos en Gen ${defaultGeneration}.`,
      });
      return;
    }

    let species = null;
    try {
      species = await getPokemonSpecies(data.speciesName || data.name);
    } catch {
      /* opcional */
    }

    const displayName = resolveDisplayName(species, data.name, language);
    const color = getTypeColor(data.types[0], fallbackColor);

    const embed = buildSelectionEmbed({
      displayName,
      color,
      spriteUrl: data.spriteUrl,
      truncated: pool.truncated,
      totalMoves: pool.totalMoves,
      menuCount: pool.moves.length,
    });

    const row = buildSelectRow({
      moves: pool.moves,
      ownerId: interaction.user.id,
      pokemonId: data.id,
      generation: defaultGeneration,
      language,
    });

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    const message =
      error instanceof PokemonApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo preparar la cobertura.";
    await interaction.editReply({ content: `❌ ${message}`, components: [] });
  }
}

export async function handleCoverageSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const parsed = parseCoverageSelectCustomId(interaction.customId);
  if (!parsed) {
    await interaction.reply({
      content: "Menú de cobertura inválido.",
      ephemeral: true,
    });
    return;
  }

  if (interaction.user.id !== parsed.ownerId) {
    await interaction.reply({
      content: "Solo quien usó `/coverage` puede elegir los ataques.",
      ephemeral: true,
    });
    return;
  }

  if (!interaction.guildId) {
    await interaction.reply({
      content: "Este control solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  let fallbackColor = "#EF4444";
  let language: "es" | "en" = "es";

  try {
    const config = assertPokemonCommandAllowed(
      interaction.guildId,
      "coverage",
      interaction.channelId,
      pokemonAccessFromInteraction(interaction),
    );
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

  try {
    const data = await getPokemonData(String(parsed.pokemonId));
    const pool = await getCoverageMovepoolOptions(
      data.name,
      parsed.generation,
      language,
    );
    const byName = new Map(
      pool.moves.map((m) => [m.apiName.toLowerCase(), m] as const),
    );

    const selected: CoverageMoveOption[] = [];
    for (const value of interaction.values) {
      const move = byName.get(value.toLowerCase());
      if (move) selected.push(move);
    }

    if (selected.length === 0) {
      await interaction.reply({
        content: "No se reconocieron los movimientos seleccionados.",
        ephemeral: true,
      });
      return;
    }

    let species = null;
    try {
      species = await getPokemonSpecies(data.speciesName || data.name);
    } catch {
      /* opcional */
    }

    const displayName = resolveDisplayName(species, data.name, language);
    const color = getTypeColor(data.types[0], fallbackColor);

    const embed = buildResultEmbed({
      displayName,
      color,
      spriteUrl: data.spriteUrl,
      selected,
      language,
    });

    const row = buildSelectRow({
      moves: pool.moves,
      ownerId: parsed.ownerId,
      pokemonId: data.id,
      generation: parsed.generation,
      language,
      selected: selected.map((m) => m.apiName),
    });

    await interaction.update({ embeds: [embed], components: [row] });
  } catch (error) {
    const message =
      error instanceof PokemonApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo calcular la cobertura.";
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: `❌ ${message}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
    }
  }
}
