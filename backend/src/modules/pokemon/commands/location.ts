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
  type PokemonEncounterByVersion,
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

/** Prefijo de botones de paginación `/location` (registry). */
export const LOCATION_PAGE_PREFIX = "loc_page_";

/** Prefijo del select de salto `/location` (interactionCreate). */
export const LOCATION_JUMP_PREFIX = "loc_jump_";

const JUMP_MENU_MAX_OPTIONS = 25;

/** Página = un juego / versión con sus ubicaciones. */
export interface LocationPage {
  versionName: string;
  locations: string[];
}

/**
 * customId: `loc_page_{ownerId}_{pokemonId}_{page}`
 * (page 0-index)
 */
export function buildLocationPageCustomId(
  ownerId: string,
  pokemonId: number,
  page: number,
): string {
  return `${LOCATION_PAGE_PREFIX}${ownerId}_${pokemonId}_${page}`;
}

export function parseLocationPageCustomId(
  customId: string,
): { ownerId: string; pokemonId: number; page: number } | null {
  if (!customId.startsWith(LOCATION_PAGE_PREFIX)) return null;
  const raw = customId.slice(LOCATION_PAGE_PREFIX.length);
  const parts = raw.split("_");
  if (parts.length < 3) return null;
  const page = Number(parts[parts.length - 1]);
  const pokemonId = Number(parts[parts.length - 2]);
  const ownerId = parts.slice(0, -2).join("_");
  if (!ownerId || !Number.isFinite(pokemonId) || !Number.isFinite(page)) {
    return null;
  }
  return { ownerId, pokemonId, page: Math.trunc(page) };
}

/**
 * customId: `loc_jump_{ownerId}_{pokemonId}`
 * value del select = índice de página (string)
 */
export function buildLocationJumpCustomId(
  ownerId: string,
  pokemonId: number,
): string {
  return `${LOCATION_JUMP_PREFIX}${ownerId}_${pokemonId}`;
}

export function parseLocationJumpCustomId(
  customId: string,
): { ownerId: string; pokemonId: number } | null {
  if (!customId.startsWith(LOCATION_JUMP_PREFIX)) return null;
  const raw = customId.slice(LOCATION_JUMP_PREFIX.length);
  const parts = raw.split("_");
  if (parts.length < 2) return null;
  const pokemonId = Number(parts[parts.length - 1]);
  const ownerId = parts.slice(0, -1).join("_");
  if (!ownerId || !Number.isFinite(pokemonId)) return null;
  return { ownerId, pokemonId: Math.trunc(pokemonId) };
}

export function encountersToPages(
  groups: PokemonEncounterByVersion[],
): LocationPage[] {
  return groups.map((g) => ({
    versionName: g.versionLabel,
    locations: g.locations,
  }));
}

/**
 * Ventana deslizante de índices (máx. 25) centrada en la página actual.
 */
export function buildJumpPageWindow(
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
  const half = Math.floor((maxOptions - 1) / 2); // 12 con max=25
  let start = Math.max(0, safeCurrent - half);
  let end = start + maxOptions;
  if (end > total) {
    end = total;
    start = Math.max(0, end - maxOptions);
  }
  return Array.from({ length: end - start }, (_, i) => start + i);
}

function formatLocationsBlock(locations: string[]): string {
  if (locations.length === 0) return "> —";

  const lines: string[] = [];
  let omitted = 0;
  for (const loc of locations) {
    const next = `> ${loc}`;
    const provisional = [...lines, next].join("\n");
    if (provisional.length > 3500) {
      omitted = locations.length - lines.length;
      break;
    }
    lines.push(next);
  }

  let block = lines.join("\n");
  if (omitted > 0) {
    block += `\n*... y ${omitted} zonas más*`;
  }
  return block;
}

function truncateLabel(text: string, max = 100): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function buildJumpSelectRow(options: {
  pages: LocationPage[];
  page: number;
  ownerId: string;
  pokemonId: number;
}): ActionRowBuilder<StringSelectMenuBuilder> | null {
  const total = options.pages.length;
  if (total <= 1) return null;

  const window = buildJumpPageWindow(total, options.page);
  const menuOptions = window.map((index) => {
    const version = options.pages[index]?.versionName ?? `Página ${index + 1}`;
    const label = truncateLabel(`${index + 1}. ${version}`);
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
      buildLocationJumpCustomId(options.ownerId, options.pokemonId),
    )
    .setPlaceholder("🗺️ Saltar a un juego específico...")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(menuOptions);

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

/**
 * Embed + botones + select de salto de una página de `/location`.
 * Orden: Fila 1 botones, Fila 2 menú de salto.
 */
export function buildLocationPageView(options: {
  displayName: string;
  color: number;
  spriteUrl: string | null;
  pages: LocationPage[];
  page: number;
  ownerId: string;
  pokemonId: number;
}): {
  embeds: EmbedBuilder[];
  components: Array<
    | ActionRowBuilder<ButtonBuilder>
    | ActionRowBuilder<StringSelectMenuBuilder>
  >;
} {
  const totalPages = Math.max(1, options.pages.length);
  const safePage = Math.min(
    Math.max(0, Math.trunc(options.page)),
    totalPages - 1,
  );
  const current = options.pages[safePage] ?? {
    versionName: "—",
    locations: [],
  };

  const description = [
    `**🎮 Juego:** ${current.versionName}`,
    "",
    "**Zonas de encuentro:**",
    formatLocationsBlock(current.locations),
  ].join("\n");

  const embed = new EmbedBuilder()
    .setColor(options.color)
    .setTitle(`📍 Ubicaciones de ${options.displayName}`)
    .setDescription(description.slice(0, 4096))
    .setFooter({
      text: `Página ${safePage + 1} de ${totalPages} • PokéAPI`,
    });

  if (options.spriteUrl) {
    embed.setThumbnail(options.spriteUrl);
  }

  if (options.pages.length <= 1) {
    return { embeds: [embed], components: [] };
  }

  const prevPage = Math.max(0, safePage - 1);
  const nextPage = Math.min(totalPages - 1, safePage + 1);
  const back5Page = Math.max(0, safePage - 5);
  const fwd5Page = Math.min(totalPages - 1, safePage + 5);

  const jumpRow = buildJumpSelectRow({
    pages: options.pages,
    page: safePage,
    ownerId: options.ownerId,
    pokemonId: options.pokemonId,
  });

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(
        buildLocationPageCustomId(
          options.ownerId,
          options.pokemonId,
          back5Page,
        ),
      )
      .setLabel("⏪ -5")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 0),
    new ButtonBuilder()
      .setCustomId(
        buildLocationPageCustomId(
          options.ownerId,
          options.pokemonId,
          prevPage,
        ),
      )
      .setLabel("◀ Anterior")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 0),
    new ButtonBuilder()
      .setCustomId(
        buildLocationPageCustomId(
          options.ownerId,
          options.pokemonId,
          nextPage,
        ),
      )
      .setLabel("Siguiente ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(
        buildLocationPageCustomId(
          options.ownerId,
          options.pokemonId,
          fwd5Page,
        ),
      )
      .setLabel("+5 ⏩")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1),
  );

  const components: Array<
    | ActionRowBuilder<ButtonBuilder>
    | ActionRowBuilder<StringSelectMenuBuilder>
  > = [buttonRow];
  if (jumpRow) components.push(jumpRow);

  return { embeds: [embed], components };
}

/**
 * /location pokemon — encuentros paginados (1 juego por página).
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
  const isPublic = interaction.options.getBoolean("publico") ?? false;

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

  // `publico: true` anula el efímero forzado del panel.
  const ephemeral = isPublic
    ? false
    : forceEphemeral
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

    if (encounters.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`📍 Ubicaciones de ${displayName}`)
        .setDescription(
          "Este Pokémon no se encuentra de forma salvaje en la hierba.",
        )
        .setFooter({ text: "PokéAPI · Sin encuentros salvajes" });
      if (data.spriteUrl) embed.setThumbnail(data.spriteUrl);
      await interaction.editReply({ embeds: [embed], components: [] });
      return;
    }

    const pages = encountersToPages(encounters);
    const view = buildLocationPageView({
      displayName,
      color,
      spriteUrl: data.spriteUrl,
      pages,
      page: 0,
      ownerId: interaction.user.id,
      pokemonId: data.id,
    });

    await interaction.editReply(view);
  } catch (error) {
    const message =
      error instanceof PokemonApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudieron obtener las ubicaciones.";
    await interaction.editReply({ content: `❌ ${message}`, components: [] });
  }
}

async function updateLocationMessage(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  ownerId: string,
  pokemonId: number,
  page: number,
): Promise<void> {
  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "Solo quien usó `/location` puede cambiar de página.",
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
      "location",
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
    const encounters = await getPokemonEncounters(String(data.id));

    let species = null;
    try {
      species = await getPokemonSpecies(data.speciesName || data.name);
    } catch {
      /* opcional */
    }

    const displayName = resolveDisplayName(species, data.name, language);
    const color = getTypeColor(data.types[0], fallbackColor);
    const pages = encountersToPages(encounters);

    if (pages.length === 0) {
      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(color)
            .setTitle(`📍 Ubicaciones de ${displayName}`)
            .setDescription(
              "Este Pokémon no se encuentra de forma salvaje en la hierba.",
            ),
        ],
        components: [],
      });
      return;
    }

    const view = buildLocationPageView({
      displayName,
      color,
      spriteUrl: data.spriteUrl,
      pages,
      page,
      ownerId,
      pokemonId: data.id,
    });

    await interaction.update(view);
  } catch (error) {
    const message =
      error instanceof PokemonApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo actualizar la página.";
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: `❌ ${message}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
    }
  }
}

/**
 * Botón `loc_page_*` — cambia de página in-place (solo el autor).
 */
export async function handleLocationPageButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const parsed = parseLocationPageCustomId(interaction.customId);
  if (!parsed) {
    await interaction.reply({
      content: "Control de paginación inválido.",
      ephemeral: true,
    });
    return;
  }

  await updateLocationMessage(
    interaction,
    parsed.ownerId,
    parsed.pokemonId,
    parsed.page,
  );
}

/**
 * Select `loc_jump_*` — salta a un juego concreto.
 */
export async function handleLocationJumpSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const parsed = parseLocationJumpCustomId(interaction.customId);
  if (!parsed) {
    await interaction.reply({
      content: "Selector de juego inválido.",
      ephemeral: true,
    });
    return;
  }

  const raw = interaction.values[0] ?? "";
  const page = Number(raw);
  if (!Number.isFinite(page) || page < 0) {
    await interaction.reply({
      content: "Página inválida.",
      ephemeral: true,
    });
    return;
  }

  await updateLocationMessage(
    interaction,
    parsed.ownerId,
    parsed.pokemonId,
    Math.trunc(page),
  );
}
