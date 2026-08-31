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
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import {
  PokemonApiError,
  capitalizePokemonName,
  getPokemonData,
  getPokemonSpecies,
  getTypeColor,
  resolveDisplayName,
} from "../../../services/pokemonApi.js";
import { resolveMoveInfo } from "../../../services/pokemonMoves.js";
import {
  type CompetitiveSet,
  type PokemonAllCompetitiveSets,
  formatCompetitiveEvs,
  getPokemonAllCompetitiveSets,
  isMegaSpeciesName,
  toSmogonSpeciesCandidates,
} from "../../../services/smogonService.js";
import {
  getMoveDamageClassEmoji,
  getPokemonTypeEmoji,
} from "../../../utils/pokemonEmojis.js";
import {
  createBasePokemonEmbed,
  formatPokemonFooter,
} from "../../../utils/pokemonEmbed.js";
import {
  PokemonError,
  assertPokemonCommandAllowed,
} from "../service.js";
import { pokemonAccessFromInteraction } from "../access.js";

/** Prefijo botones paginación `/bestsets`. */
export const BESTSETS_PAGE_PREFIX = "bs_page_";
/** Prefijo select de salto `/bestsets`. */
export const BESTSETS_JUMP_PREFIX = "bs_jump_";

const JUMP_MENU_MAX_OPTIONS = 25;

export type BestsetsPageAction = "p" | "n";

/**
 * customId: `bs_page_{ownerId}_{pokemonId}_{generation}_{page}_{action}`
 */
export function buildBestsetsPageCustomId(
  ownerId: string,
  pokemonId: number,
  generation: number,
  page: number,
  action: BestsetsPageAction,
): string {
  return `${BESTSETS_PAGE_PREFIX}${ownerId}_${pokemonId}_${generation}_${page}_${action}`;
}

export function parseBestsetsPageCustomId(customId: string): {
  ownerId: string;
  pokemonId: number;
  generation: number;
  page: number;
} | null {
  if (!customId.startsWith(BESTSETS_PAGE_PREFIX)) return null;
  const raw = customId.slice(BESTSETS_PAGE_PREFIX.length);
  const parts = raw.split("_");
  if (parts.length < 5) return null;
  const action = parts[parts.length - 1];
  const page = Number(parts[parts.length - 2]);
  const generation = Number(parts[parts.length - 3]);
  const pokemonId = Number(parts[parts.length - 4]);
  const ownerId = parts.slice(0, -4).join("_");
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
    pokemonId: Math.trunc(pokemonId),
    generation: Math.trunc(generation),
    page: Math.trunc(page),
  };
}

/** customId: `bs_jump_{ownerId}_{pokemonId}_{generation}` */
export function buildBestsetsJumpCustomId(
  ownerId: string,
  pokemonId: number,
  generation: number,
): string {
  return `${BESTSETS_JUMP_PREFIX}${ownerId}_${pokemonId}_${generation}`;
}

export function parseBestsetsJumpCustomId(customId: string): {
  ownerId: string;
  pokemonId: number;
  generation: number;
} | null {
  if (!customId.startsWith(BESTSETS_JUMP_PREFIX)) return null;
  const raw = customId.slice(BESTSETS_JUMP_PREFIX.length);
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

function buildJumpPageWindow(
  totalPages: number,
  currentPage: number,
  maxOptions = JUMP_MENU_MAX_OPTIONS,
): number[] {
  const total = Math.max(0, Math.trunc(totalPages));
  if (total <= 0) return [];
  if (total <= maxOptions) {
    return Array.from({ length: total }, (_, i) => i);
  }
  const safeCurrent = Math.min(Math.max(0, Math.trunc(currentPage)), total - 1);
  const half = Math.floor((maxOptions - 1) / 2);
  let start = Math.max(0, safeCurrent - half);
  let end = start + maxOptions;
  if (end > total) {
    end = total;
    start = Math.max(0, end - maxOptions);
  }
  return Array.from({ length: end - start }, (_, i) => start + i);
}

function truncateLabel(text: string, max = 100): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function resolveBestsetsDisplayName(
  species: Awaited<ReturnType<typeof getPokemonSpecies>> | null,
  apiName: string,
  language: "es" | "en",
): string {
  // Formas Mega / regionales: preferir etiqueta Showdown (`Staraptor-Mega`).
  if (isMegaSpeciesName(apiName) || /-(alola|galar|hisui|paldea|gmax)/i.test(apiName)) {
    return toSmogonSpeciesCandidates(apiName)[0] ?? capitalizePokemonName(apiName);
  }
  return resolveDisplayName(species, apiName, language);
}

async function formatMovesField(
  moves: string[],
  language: "es" | "en",
): Promise<string> {
  if (moves.length === 0) return "_Sin movimientos_";
  const lines: string[] = [];
  for (let i = 0; i < moves.length; i++) {
    const moveName = moves[i]!;
    try {
      const info = await resolveMoveInfo(moveName, language);
      const typeEmoji = getPokemonTypeEmoji(info.type) ?? "";
      const classEmoji = getMoveDamageClassEmoji(info.damageClass);
      const icons = [typeEmoji, classEmoji].filter(Boolean).join(" ");
      lines.push(
        `${i + 1}. ${icons} **${info.displayName}**`
          .replace(/\s+/g, " ")
          .trim(),
      );
    } catch {
      lines.push(`${i + 1}. **${moveName}**`);
    }
  }
  return lines.join("\n").slice(0, 1024);
}

function buildJumpSelectRow(options: {
  sets: CompetitiveSet[];
  page: number;
  ownerId: string;
  pokemonId: number;
  generation: number;
}): ActionRowBuilder<StringSelectMenuBuilder> | null {
  const total = options.sets.length;
  if (total <= 1) return null;

  const window = buildJumpPageWindow(total, options.page);
  const menuOptions = window.map((index) => {
    const set = options.sets[index];
    const label = truncateLabel(
      set
        ? `${set.formatName} - ${set.name}`
        : `Set ${index + 1}`,
    );
    const option = new StringSelectMenuOptionBuilder()
      .setLabel(label)
      .setValue(String(index));
    if (index === options.page) {
      option.setDefault(true);
    }
    return option;
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(
      buildBestsetsJumpCustomId(
        options.ownerId,
        options.pokemonId,
        options.generation,
      ),
    )
    .setPlaceholder("Saltar a un set...")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(menuOptions);

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export async function buildBestsetsPageView(options: {
  displayName: string;
  color: number;
  spriteUrl: string | null;
  payload: PokemonAllCompetitiveSets;
  page: number;
  ownerId: string;
  pokemonId: number;
  language: "es" | "en";
}): Promise<{
  embeds: EmbedBuilder[];
  components: Array<
    | ActionRowBuilder<ButtonBuilder>
    | ActionRowBuilder<StringSelectMenuBuilder>
  >;
}> {
  const { payload } = options;
  const total = Math.max(1, payload.sets.length);
  const safePage =
    payload.sets.length === 0
      ? 0
      : Math.min(Math.max(0, options.page), payload.sets.length - 1);
  const set: CompetitiveSet | undefined = payload.sets[safePage];

  const embed = createBasePokemonEmbed().setColor(options.color);

  if (!set) {
    embed
      .setTitle(`⚔️ Sets de ${options.displayName}`)
      .setDescription(
        `_No hay sets Smogon para **${options.displayName}** en Gen ${payload.generation}._`,
      )
      .setFooter({
        text: formatPokemonFooter(`Gen ${payload.generation}`),
      });
  } else {
    const movesText = await formatMovesField(set.moves, options.language);
    embed
      .setTitle(`⚔️ Set: ${set.name} - ${options.displayName}`)
      .addFields(
        {
          name: "🎒 Objeto",
          value: set.item || "—",
          inline: true,
        },
        {
          name: "🛡️ Habilidad",
          value: set.ability || "—",
          inline: true,
        },
        {
          name: "⚖️ Naturaleza",
          value: set.nature || "—",
          inline: true,
        },
        {
          name: "📊 EVs",
          value: formatCompetitiveEvs(set.evs),
          inline: false,
        },
        {
          name: "⚔️ Movimientos",
          value: movesText,
          inline: false,
        },
      )
      .setFooter({
        text: formatPokemonFooter(
          `Set ${safePage + 1} de ${total} • ${set.formatName}`,
        ),
      });
  }

  if (options.spriteUrl) {
    embed.setThumbnail(options.spriteUrl);
  }

  const components: Array<
    | ActionRowBuilder<ButtonBuilder>
    | ActionRowBuilder<StringSelectMenuBuilder>
  > = [];

  const jumpRow = buildJumpSelectRow({
    sets: payload.sets,
    page: safePage,
    ownerId: options.ownerId,
    pokemonId: options.pokemonId,
    generation: payload.generation,
  });
  if (jumpRow) components.push(jumpRow);

  const multi = payload.sets.length > 1;
  if (multi) {
    const prevPage = Math.max(0, safePage - 1);
    const nextPage = Math.min(payload.sets.length - 1, safePage + 1);
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(
            buildBestsetsPageCustomId(
              options.ownerId,
              options.pokemonId,
              payload.generation,
              prevPage,
              "p",
            ),
          )
          .setLabel("◀ Anterior")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage <= 0),
        new ButtonBuilder()
          .setCustomId(
            buildBestsetsPageCustomId(
              options.ownerId,
              options.pokemonId,
              payload.generation,
              nextPage,
              "n",
            ),
          )
          .setLabel("Siguiente ▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage >= payload.sets.length - 1),
      ),
    );
  }

  return { embeds: [embed], components };
}

async function updateBestsetsMessage(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  ownerId: string,
  pokemonId: number,
  generation: number,
  page: number,
): Promise<void> {
  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "Solo quien usó `/bestsets` puede navegar este menú.",
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
      "bestsets",
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
    const payload = await getPokemonAllCompetitiveSets(
      data.name,
      generation,
      language,
    );

    let species = null;
    try {
      species = await getPokemonSpecies(data.speciesName || data.name);
    } catch {
      /* opcional */
    }

    const displayName = resolveBestsetsDisplayName(species, data.name, language);
    const color = getTypeColor(data.types[0], fallbackColor);

    const view = await buildBestsetsPageView({
      displayName,
      color,
      spriteUrl: data.spriteUrl,
      payload,
      page,
      ownerId,
      pokemonId: data.id,
      language,
    });

    await interaction.update(view);
  } catch (error) {
    const message =
      error instanceof PokemonApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo actualizar el set.";
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: `❌ ${message}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
    }
  }
}

/**
 * /bestsets pokemon [publico]
 * Agrega todos los sets Smogon de la generación del panel.
 */
export async function handleBestsetsCommand(
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
      "bestsets",
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
    const payload = await getPokemonAllCompetitiveSets(
      data.name,
      defaultGeneration,
      language,
    );

    let species = null;
    try {
      species = await getPokemonSpecies(data.speciesName || data.name);
    } catch {
      /* opcional */
    }

    const displayName = resolveBestsetsDisplayName(species, data.name, language);
    const color = getTypeColor(data.types[0], fallbackColor);

    const view = await buildBestsetsPageView({
      displayName,
      color,
      spriteUrl: data.spriteUrl,
      payload,
      page: 0,
      ownerId: interaction.user.id,
      pokemonId: data.id,
      language,
    });

    await interaction.editReply(view);
  } catch (error) {
    const message =
      error instanceof PokemonApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudieron obtener los sets.";
    await interaction.editReply({ content: `❌ ${message}`, components: [] });
  }
}

export async function handleBestsetsPageButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const parsed = parseBestsetsPageCustomId(interaction.customId);
  if (!parsed) {
    await interaction.reply({
      content: "Control de paginación inválido.",
      ephemeral: true,
    });
    return;
  }

  await updateBestsetsMessage(
    interaction,
    parsed.ownerId,
    parsed.pokemonId,
    parsed.generation,
    parsed.page,
  );
}

export async function handleBestsetsJumpSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const parsed = parseBestsetsJumpCustomId(interaction.customId);
  if (!parsed) {
    await interaction.reply({
      content: "Menú de salto inválido.",
      ephemeral: true,
    });
    return;
  }

  const page = Number(interaction.values[0] ?? 0);
  if (!Number.isFinite(page)) {
    await interaction.reply({
      content: "Selección inválida.",
      ephemeral: true,
    });
    return;
  }

  await updateBestsetsMessage(
    interaction,
    parsed.ownerId,
    parsed.pokemonId,
    parsed.generation,
    Math.trunc(page),
  );
}
