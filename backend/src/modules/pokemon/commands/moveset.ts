import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { resolvePokeinfoFormat } from "@adobos/shared";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import {
  PokemonApiError,
  getPokemonData,
  getPokemonSpecies,
  getTypeColor,
  resolveDisplayName,
} from "../../../services/pokemonApi.js";
import {
  type LearnsetMoveEntry,
  type MoveLearnMethod,
  type PokemonLearnset,
  getLearnsetCategoryMoves,
  getPokemonLearnset,
} from "../../../services/pokemonMoves.js";
import {
  getMoveDamageClassEmoji,
  getPokemonTypeEmoji,
} from "../../../utils/pokemonEmojis.js";
import {
  PokemonError,
  assertPokemonCommandAllowed,
} from "../service.js";
import { pokemonAccessFromInteraction } from "../access.js";

/** Prefijo botones paginación `/moveset`. */
export const MOVESET_PAGE_PREFIX = "ms_page_";
/** Prefijo select filtro `/moveset`. */
export const MOVESET_FILTER_PREFIX = "ms_flt_";

const MOVES_PER_PAGE = 12;

export type MovesetPageAction = "p" | "n";

const CATEGORY_LABELS: Record<MoveLearnMethod, string> = {
  "level-up": "Por Nivel",
  machine: "Por Máquina Técnica (MT)",
  egg: "Movimientos Huevo",
};

const CATEGORY_SHORT: Record<MoveLearnMethod, string> = {
  "level-up": "lvl",
  machine: "mt",
  egg: "egg",
};

function categoryFromShort(raw: string): MoveLearnMethod {
  if (raw === "mt") return "machine";
  if (raw === "egg") return "egg";
  return "level-up";
}

function shortFromCategory(cat: MoveLearnMethod): string {
  return CATEGORY_SHORT[cat];
}

/**
 * customId: `ms_page_{ownerId}_{pokemonId}_{gen}_{cat}_{page}_{action}`
 */
export function buildMovesetPageCustomId(
  ownerId: string,
  pokemonId: number,
  generation: number,
  category: MoveLearnMethod,
  page: number,
  action: MovesetPageAction,
): string {
  return `${MOVESET_PAGE_PREFIX}${ownerId}_${pokemonId}_${generation}_${shortFromCategory(category)}_${page}_${action}`;
}

export function parseMovesetPageCustomId(customId: string): {
  ownerId: string;
  pokemonId: number;
  generation: number;
  category: MoveLearnMethod;
  page: number;
} | null {
  if (!customId.startsWith(MOVESET_PAGE_PREFIX)) return null;
  const raw = customId.slice(MOVESET_PAGE_PREFIX.length);
  const parts = raw.split("_");
  // ...owner, pokeId, gen, cat, page, action
  if (parts.length < 6) return null;
  const action = parts[parts.length - 1];
  const page = Number(parts[parts.length - 2]);
  const cat = parts[parts.length - 3] ?? "lvl";
  const generation = Number(parts[parts.length - 4]);
  const pokemonId = Number(parts[parts.length - 5]);
  const ownerId = parts.slice(0, -5).join("_");
  if (
    !ownerId ||
    !Number.isFinite(pokemonId) ||
    !Number.isFinite(generation) ||
    !Number.isFinite(page) ||
    !action
  ) {
    return null;
  }
  return {
    ownerId,
    pokemonId,
    generation: Math.trunc(generation),
    category: categoryFromShort(cat),
    page: Math.trunc(page),
  };
}

/** customId: `ms_flt_{ownerId}_{pokemonId}_{gen}` */
export function buildMovesetFilterCustomId(
  ownerId: string,
  pokemonId: number,
  generation: number,
): string {
  return `${MOVESET_FILTER_PREFIX}${ownerId}_${pokemonId}_${generation}`;
}

export function parseMovesetFilterCustomId(customId: string): {
  ownerId: string;
  pokemonId: number;
  generation: number;
} | null {
  if (!customId.startsWith(MOVESET_FILTER_PREFIX)) return null;
  const raw = customId.slice(MOVESET_FILTER_PREFIX.length);
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

function formatMoveLine(move: LearnsetMoveEntry): string {
  const typeEmoji = getPokemonTypeEmoji(move.type) ?? "";
  const classEmoji = getMoveDamageClassEmoji(move.damageClass);
  const prefix =
    move.method === "level-up"
      ? `[Nivel ${move.levelLearnedAt}]`
      : move.method === "machine"
        ? `[MT]`
        : `[Huevo]`;
  const icons = [typeEmoji, classEmoji].filter(Boolean).join(" ");
  return `${prefix} ${icons} **${move.displayName}**`.replace(/\s+/g, " ").trim();
}

function buildMovesDescription(
  moves: LearnsetMoveEntry[],
  page: number,
): { text: string; totalPages: number; safePage: number } {
  const totalPages = Math.max(1, Math.ceil(moves.length / MOVES_PER_PAGE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  if (moves.length === 0) {
    return {
      text: "_No hay movimientos en esta categoría para la generación elegida._",
      totalPages: 1,
      safePage: 0,
    };
  }
  const slice = moves.slice(
    safePage * MOVES_PER_PAGE,
    safePage * MOVES_PER_PAGE + MOVES_PER_PAGE,
  );
  return {
    text: slice.map(formatMoveLine).join("\n").slice(0, 4096),
    totalPages,
    safePage,
  };
}

export function buildMovesetPageView(options: {
  displayName: string;
  color: number;
  spriteUrl: string | null;
  learnset: PokemonLearnset;
  category: MoveLearnMethod;
  page: number;
  ownerId: string;
  generation: number;
}): {
  embeds: EmbedBuilder[];
  components: Array<
    | ActionRowBuilder<ButtonBuilder>
    | ActionRowBuilder<StringSelectMenuBuilder>
  >;
} {
  const moves = getLearnsetCategoryMoves(options.learnset, options.category);
  const { text, totalPages, safePage } = buildMovesDescription(
    moves,
    options.page,
  );

  const embed = new EmbedBuilder()
    .setColor(options.color)
    .setTitle(`⚔️ Moveset de ${options.displayName}`)
    .setDescription(text)
    .setFooter({
      text: `Página ${safePage + 1} de ${totalPages} • ${CATEGORY_LABELS[options.category]} • Gen ${options.generation} • PokéAPI`,
    });

  if (options.spriteUrl) {
    embed.setThumbnail(options.spriteUrl);
  }

  const filterMenu = new StringSelectMenuBuilder()
    .setCustomId(
      buildMovesetFilterCustomId(
        options.ownerId,
        options.learnset.pokemonId,
        options.generation,
      ),
    )
    .setPlaceholder("Filtrar por método de aprendizaje...")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Por Nivel")
        .setValue("level-up")
        .setDefault(options.category === "level-up"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Por Máquina Técnica (MT)")
        .setValue("machine")
        .setDefault(options.category === "machine"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Movimientos Huevo")
        .setValue("egg")
        .setDefault(options.category === "egg"),
    );

  const filterRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(filterMenu);

  const prevPage = Math.max(0, safePage - 1);
  const nextPage = Math.min(totalPages - 1, safePage + 1);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(
        buildMovesetPageCustomId(
          options.ownerId,
          options.learnset.pokemonId,
          options.generation,
          options.category,
          prevPage,
          "p",
        ),
      )
      .setLabel("◀ Anterior")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 0 || totalPages <= 1),
    new ButtonBuilder()
      .setCustomId(
        buildMovesetPageCustomId(
          options.ownerId,
          options.learnset.pokemonId,
          options.generation,
          options.category,
          nextPage,
          "n",
        ),
      )
      .setLabel("Siguiente ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1 || totalPages <= 1),
  );

  return {
    embeds: [embed],
    components: [filterRow, buttonRow],
  };
}

/**
 * /moveset pokemon [juego_formato] [publico]
 */
export async function handleMovesetCommand(
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
      "moveset",
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

  const ephemeral = isPublic
    ? false
    : forceEphemeral
      ? true
      : consumeInteractionEphemeral(interaction.id, true);

  await interaction.deferReply({ ephemeral });

  try {
    const data = await getPokemonData(query);
    const learnset = await getPokemonLearnset(data.name, generation, language);

    let species = null;
    try {
      species = await getPokemonSpecies(data.speciesName || data.name);
    } catch {
      /* opcional */
    }

    const displayName = resolveDisplayName(species, data.name, language);
    const color = getTypeColor(data.types[0], fallbackColor);

    // Preferir categoría con datos; default level-up
    let category: MoveLearnMethod = "level-up";
    if (learnset.levelUp.length === 0 && learnset.machine.length > 0) {
      category = "machine";
    } else if (
      learnset.levelUp.length === 0 &&
      learnset.machine.length === 0 &&
      learnset.egg.length > 0
    ) {
      category = "egg";
    }

    const view = buildMovesetPageView({
      displayName,
      color,
      spriteUrl: data.spriteUrl,
      learnset,
      category,
      page: 0,
      ownerId: interaction.user.id,
      generation,
    });

    await interaction.editReply(view);
  } catch (error) {
    const message =
      error instanceof PokemonApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo obtener el moveset.";
    await interaction.editReply({ content: `❌ ${message}`, components: [] });
  }
}

async function updateMovesetMessage(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  ownerId: string,
  pokemonId: number,
  generation: number,
  category: MoveLearnMethod,
  page: number,
): Promise<void> {
  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "Solo quien usó `/moveset` puede navegar este menú.",
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
      "moveset",
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
    const data = await getPokemonData(String(pokemonId));
    const learnset = await getPokemonLearnset(data.name, generation, language);

    let species = null;
    try {
      species = await getPokemonSpecies(data.speciesName || data.name);
    } catch {
      /* opcional */
    }

    const displayName = resolveDisplayName(species, data.name, language);
    const color = getTypeColor(data.types[0], fallbackColor);

    const view = buildMovesetPageView({
      displayName,
      color,
      spriteUrl: data.spriteUrl,
      learnset,
      category,
      page,
      ownerId,
      generation,
    });

    await interaction.update(view);
  } catch (error) {
    const message =
      error instanceof PokemonApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo actualizar el moveset.";
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: `❌ ${message}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
    }
  }
}

export async function handleMovesetPageButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const parsed = parseMovesetPageCustomId(interaction.customId);
  if (!parsed) {
    await interaction.reply({
      content: "Control de paginación inválido.",
      ephemeral: true,
    });
    return;
  }

  await updateMovesetMessage(
    interaction,
    parsed.ownerId,
    parsed.pokemonId,
    parsed.generation,
    parsed.category,
    parsed.page,
  );
}

export async function handleMovesetFilterSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const parsed = parseMovesetFilterCustomId(interaction.customId);
  if (!parsed) {
    await interaction.reply({
      content: "Filtro inválido.",
      ephemeral: true,
    });
    return;
  }

  const raw = interaction.values[0] ?? "level-up";
  const category: MoveLearnMethod =
    raw === "machine" || raw === "egg" || raw === "level-up"
      ? raw
      : "level-up";

  await updateMovesetMessage(
    interaction,
    parsed.ownerId,
    parsed.pokemonId,
    parsed.generation,
    category,
    0,
  );
}
