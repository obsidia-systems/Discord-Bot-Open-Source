import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type EmbedBuilder,
} from "discord.js";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import {
  PokemonApiError,
  capitalizePokemonName,
  formatTypeLabel,
  getPokemonData,
  getPokemonSpecies,
  getTypeColor,
  isPokemonCacheReady,
  resolveDisplayName,
  resolvePokemonForGeneration,
  searchPokemonAutocomplete,
  warmPokemonAutocompleteCache,
} from "../../../services/pokemonApi.js";
import {
  flattenLearnsetMoves,
  getPokemonLearnset,
  resolveMoveInfo,
  searchMovepoolAutocomplete,
  toMoveApiSlug,
} from "../../../services/pokemonMoves.js";
import {
  MAX_TEAM_SIZE,
  addPokemonToTeam,
  clearTeam,
  countFilledSlots,
  getOrCreateTeam,
  isTeamEmpty,
  isTeamFull,
  removePokemonFromTeam,
  setSlotMoves,
  setTeamMessageRef,
  type TeamData,
  type TeamSlotData,
} from "../../../services/teambuilderState.js";
import {
  formatPokemonTypeWithEmoji,
  getPokemonTypeEmoji,
} from "../../../utils/pokemonEmojis.js";
import {
  createBasePokemonEmbed,
  formatPokemonFooter,
} from "../../../utils/pokemonEmbed.js";
import { analyzeTeamSynergy } from "../../../utils/typeChart.js";
import {
  PokemonError,
  assertPokemonCommandAllowed,
  getPokemonConfig,
} from "../service.js";
import { pokemonAccessFromInteraction } from "../access.js";

export const TEAMBUILDER_SYN_PREFIX = "tb_syn_";

function formatSpeciesLabel(species: string): string {
  return capitalizePokemonName(species);
}

async function resolveDisplayLabel(species: string): Promise<string> {
  try {
    const data = await getPokemonData(species);
    const speciesData = await getPokemonSpecies(String(data.id)).catch(
      () => null,
    );
    const displayName = resolveDisplayName(speciesData, data.name, "es");
    const isForm =
      /-(mega|alola|galar|hisui|paldea|gmax|therian|incarnate|attack|defense|speed|origin|sky|blade|shield)/i.test(
        data.name,
      );
    // Formas: estilo Showdown (`Staraptor-Mega`).
    return isForm ? capitalizePokemonName(data.name) : displayName;
  } catch {
    return formatSpeciesLabel(species);
  }
}

function formatTypeEmojis(types: string[]): string {
  return types
    .map((t) => getPokemonTypeEmoji(t))
    .filter((e): e is string => Boolean(e))
    .join(" ");
}

async function formatMovesBlock(
  moves: string[],
  language: "es" | "en",
): Promise<string> {
  if (moves.length === 0) return "";
  const lines = await Promise.all(
    moves.map(async (m) => {
      try {
        const info = await resolveMoveInfo(m, language);
        return `> • ${info.displayName}`;
      } catch {
        return `> • ${capitalizePokemonName(m.replace(/-/g, " "))}`;
      }
    }),
  );
  return lines.join("\n");
}

async function buildSlotFieldValue(
  slot: TeamSlotData,
  displayName: string,
  language: "es" | "en",
): Promise<string> {
  const header = `**${displayName}**`;
  const movesBlock = await formatMovesBlock(slot.moves, language);
  if (movesBlock) return `${header}\n${movesBlock}`;
  return header;
}

async function buildTeamEmbed(
  team: TeamData,
  username: string,
  options?: { generation?: number; language?: "es" | "en" },
): Promise<EmbedBuilder> {
  const generation = options?.generation ?? 9;
  const language = options?.language ?? "es";
  const filled = countFilledSlots(team);
  const first = team.slots.find((s) => s != null) ?? null;
  const color = first ? 0x3b82f6 : 0x64748b;

  const embed = createBasePokemonEmbed()
    .setTitle(`📋 Teambuilder de ${username}`)
    .setDescription(
      [
        `Tu equipo actual (**${filled}/${MAX_TEAM_SIZE}**).`,
        "",
        "`/teambuilder add` · `/teambuilder moves` · `/teambuilder remove` · `/teambuilder clear`",
      ].join("\n"),
    )
    .setColor(color)
    .setTimestamp(new Date());

  const slotMeta = await Promise.all(
    team.slots.map(async (slot) => {
      if (!slot) return null;
      try {
        const data = await getPokemonData(slot.species);
        const snapshot = resolvePokemonForGeneration(data, generation);
        const label = await resolveDisplayLabel(slot.species);
        const types =
          snapshot.types.length > 0 ? snapshot.types : data.types;
        return { label, types };
      } catch {
        return {
          label: formatSpeciesLabel(slot.species),
          types: [] as string[],
        };
      }
    }),
  );

  for (let i = 0; i < MAX_TEAM_SIZE; i += 1) {
    const slot = team.slots[i];
    const meta = slotMeta[i];
    if (slot && meta) {
      const typeEmojis = formatTypeEmojis(meta.types);
      const fieldName = typeEmojis
        ? `Slot ${i + 1} ${typeEmojis}`
        : `Slot ${i + 1}`;
      embed.addFields({
        name: fieldName.slice(0, 256),
        value: await buildSlotFieldValue(slot, meta.label, language),
        inline: true,
      });
    } else {
      embed.addFields({
        name: `Slot ${i + 1}`,
        value: "*Ranura Vacía*",
        inline: true,
      });
    }
  }

  if (first) {
    try {
      const data = await getPokemonData(first.species);
      if (data.spriteUrl) embed.setThumbnail(data.spriteUrl);
    } catch {
      // sin sprite
    }
  }

  return embed;
}

function buildPanelComponents(team: TeamData, ownerId: string) {
  const empty = isTeamEmpty(team);

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${TEAMBUILDER_SYN_PREFIX}${ownerId}`)
        .setLabel("Analizar Sinergia")
        .setEmoji("📊")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(empty),
    ),
  ];
}

function resolveEphemeral(
  interaction: ChatInputCommandInteraction,
  forceEphemeral: boolean,
): boolean {
  const isPublic = interaction.options.getBoolean("publico") ?? false;
  return isPublic
    ? false
    : forceEphemeral
      ? true
      : consumeInteractionEphemeral(interaction.id, true);
}

async function replyWithPanel(
  interaction: ChatInputCommandInteraction,
  team: TeamData,
  forceEphemeral: boolean,
  statusLine?: string,
): Promise<void> {
  const ephemeral = resolveEphemeral(interaction, forceEphemeral);
  const username = interaction.user.username;
  const guildId = interaction.guildId;
  const generation = guildId
    ? getPokemonConfig(guildId).defaultGeneration
    : 9;
  const language = guildId
    ? getPokemonConfig(guildId).language === "en"
      ? "en"
      : "es"
    : "es";
  const embed = await buildTeamEmbed(team, username, { generation, language });
  if (statusLine) {
    embed.setFooter({ text: formatPokemonFooter(statusLine) });
  }

  await interaction.reply({
    embeds: [embed],
    components: buildPanelComponents(team, interaction.user.id),
    ephemeral,
  });

  try {
    const reply = await interaction.fetchReply();
    setTeamMessageRef(interaction.user.id, {
      channelId: reply.channelId,
      messageId: reply.id,
      guildId: interaction.guildId ?? undefined,
    });
  } catch {
    // sin ref
  }
}

function normalizeMoveInput(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const slug = toMoveApiSlug(raw) || raw.trim().toLowerCase().replace(/\s+/g, "-");
  return slug || null;
}

/**
 * Autocomplete de `/teambuilder`: especie (`add`) o movimientos (`moves`).
 */
export async function handleTeambuilderAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const focused = interaction.options.getFocused(true);

  if (focused.name === "pokemon") {
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
    return;
  }

  if (!/^move[1-4]$/.test(focused.name)) {
    await interaction.respond([]);
    return;
  }

  const slotNum = interaction.options.getInteger("slot");
  if (slotNum == null || slotNum < 1 || slotNum > MAX_TEAM_SIZE) {
    await interaction.respond([]);
    return;
  }

  const team = getOrCreateTeam(interaction.user.id);
  const slot = team.slots[slotNum - 1];
  if (!slot) {
    await interaction.respond([]);
    return;
  }

  const guildId = interaction.guildId;
  const generation = guildId
    ? getPokemonConfig(guildId).defaultGeneration
    : 9;
  const language = guildId
    ? getPokemonConfig(guildId).language === "en"
      ? "en"
      : "es"
    : "es";

  try {
    const learnset = await getPokemonLearnset(
      slot.species,
      generation,
      language,
    );
    const pool = flattenLearnsetMoves(learnset);
    const choices = searchMovepoolAutocomplete(
      pool,
      String(focused.value ?? ""),
      25,
    );
    await interaction.respond(choices);
  } catch {
    await interaction.respond([]);
  }
}

/**
 * `/teambuilder view|add|remove|clear|moves`
 */
export async function handleTeambuilderCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "Este comando solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  let forceEphemeral = true;
  try {
    const config = assertPokemonCommandAllowed(
      interaction.guildId,
      "teambuilder",
      interaction.channelId,
      pokemonAccessFromInteraction(interaction),
    );
    forceEphemeral = config.forceEphemeral;
  } catch (error) {
    const message =
      error instanceof PokemonError
        ? error.message
        : "No se pudo validar el comando Pokémon.";
    await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand(true);

  try {
    if (sub === "view") {
      const team = getOrCreateTeam(interaction.user.id);
      await replyWithPanel(interaction, team, forceEphemeral);
      return;
    }

    if (sub === "add") {
      const raw =
        interaction.options.getString("pokemon", true)?.trim().toLowerCase() ??
        "";
      if (!raw) {
        await interaction.reply({
          content: "❌ Indica un Pokémon.",
          ephemeral: true,
        });
        return;
      }

      const team = getOrCreateTeam(interaction.user.id);
      if (isTeamFull(team)) {
        await interaction.reply({
          content: `❌ El equipo ya está completo (${MAX_TEAM_SIZE}/${MAX_TEAM_SIZE}).`,
          ephemeral: true,
        });
        return;
      }

      const data = await getPokemonData(raw);
      const label = await resolveDisplayLabel(data.name);
      const updated = addPokemonToTeam(interaction.user.id, data.name);
      await replyWithPanel(
        interaction,
        updated,
        forceEphemeral,
        `✅ ${label} añadido (${countFilledSlots(updated)}/${MAX_TEAM_SIZE})`,
      );
      return;
    }

    if (sub === "remove") {
      const slotNum = interaction.options.getInteger("slot", true);
      const index = slotNum - 1;
      const team = getOrCreateTeam(interaction.user.id);

      if (index < 0 || index >= MAX_TEAM_SIZE) {
        await interaction.reply({
          content: "❌ Slot inválido. Usa un número del 1 al 6.",
          ephemeral: true,
        });
        return;
      }

      const removed = team.slots[index];
      if (!removed) {
        await interaction.reply({
          content: `❌ El slot **${slotNum}** está vacío.`,
          ephemeral: true,
        });
        return;
      }

      const label = await resolveDisplayLabel(removed.species);
      const updated = removePokemonFromTeam(interaction.user.id, index);
      await replyWithPanel(
        interaction,
        updated,
        forceEphemeral,
        `✅ ${label} eliminado del slot ${slotNum} (${countFilledSlots(updated)}/${MAX_TEAM_SIZE})`,
      );
      return;
    }

    if (sub === "clear") {
      const updated = clearTeam(interaction.user.id);
      await replyWithPanel(
        interaction,
        updated,
        forceEphemeral,
        "✅ Equipo vaciado",
      );
      return;
    }

    if (sub === "moves") {
      const slotNum = interaction.options.getInteger("slot", true);
      const index = slotNum - 1;
      const team = getOrCreateTeam(interaction.user.id);

      if (index < 0 || index >= MAX_TEAM_SIZE) {
        await interaction.reply({
          content: "❌ Slot inválido. Usa un número del 1 al 6.",
          ephemeral: true,
        });
        return;
      }

      const target = team.slots[index];
      if (!target) {
        await interaction.reply({
          content: `❌ El slot **${slotNum}** está vacío.`,
          ephemeral: true,
        });
        return;
      }

      const rawMoves = [
        interaction.options.getString("move1"),
        interaction.options.getString("move2"),
        interaction.options.getString("move3"),
        interaction.options.getString("move4"),
      ];

      const seen = new Set<string>();
      const moves: string[] = [];
      for (const raw of rawMoves) {
        const slug = normalizeMoveInput(raw);
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        moves.push(slug);
      }

      if (moves.length === 0) {
        await interaction.reply({
          content:
            "❌ Indica al menos un movimiento (`move1`…`move4`). Usa el autocompletado para buscar en todo el movepool.",
          ephemeral: true,
        });
        return;
      }

      const label = await resolveDisplayLabel(target.species);
      const updated = setSlotMoves(interaction.user.id, index, moves);
      await replyWithPanel(
        interaction,
        updated,
        forceEphemeral,
        `✅ Movimientos de ${label} (slot ${slotNum}) actualizados`,
      );
      return;
    }

    await interaction.reply({
      content:
        "❌ Subcomando no reconocido. Usa `view`, `add`, `remove`, `clear` o `moves`.",
      ephemeral: true,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "TEAM_FULL") {
      await interaction.reply({
        content: `❌ El equipo ya está completo (${MAX_TEAM_SIZE}/${MAX_TEAM_SIZE}).`,
        ephemeral: true,
      });
      return;
    }
    if (error instanceof Error && error.message === "INVALID_SLOT") {
      await interaction.reply({
        content: "❌ Ese slot no tiene Pokémon.",
        ephemeral: true,
      });
      return;
    }
    if (error instanceof PokemonApiError && error.status === 404) {
      await interaction.reply({
        content:
          "❌ Pokémon no encontrado. Elige una opción del autocompletado.",
        ephemeral: true,
      });
      return;
    }
    const message =
      error instanceof PokemonApiError
        ? error.message
        : "No se pudo actualizar el equipo.";
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: `❌ ${message}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
    }
  }
}

function ownerFromPrefix(customId: string, prefix: string): string | null {
  if (!customId.startsWith(prefix)) return null;
  const ownerId = customId.slice(prefix.length);
  return ownerId || null;
}

export async function handleTeambuilderSynergyButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const ownerId = ownerFromPrefix(interaction.customId, TEAMBUILDER_SYN_PREFIX);
  if (!ownerId) return;

  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "❌ Solo quien abrió el Teambuilder puede usarlo.",
      ephemeral: true,
    });
    return;
  }

  const team = getOrCreateTeam(ownerId);
  if (isTeamEmpty(team)) {
    await interaction.reply({
      content: "❌ El equipo está vacío. Añade Pokémon con `/teambuilder add`.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId;
  const generation = guildId
    ? getPokemonConfig(guildId).defaultGeneration
    : 9;
  const language = guildId
    ? getPokemonConfig(guildId).language === "en"
      ? "en"
      : "es"
    : "es";

  try {
    const members: Array<{ name: string; types: string[] }> = [];

    for (const slot of team.slots) {
      if (!slot) continue;
      try {
        const data = await getPokemonData(slot.species);
        const snapshot = resolvePokemonForGeneration(data, generation);
        const label = await resolveDisplayLabel(slot.species);
        const types =
          snapshot.types.length > 0 ? snapshot.types : data.types;
        if (types.length === 0) continue;
        members.push({ name: label, types });
      } catch {
        // especie inválida: omitir del análisis
      }
    }

    if (members.length === 0) {
      await interaction.editReply({
        content: "❌ No se pudieron resolver los tipos del equipo.",
      });
      return;
    }

    const report = analyzeTeamSynergy(members);

    const weaknessLines =
      report.criticalWeaknesses.length === 0
        ? ["✅ Excelente balance defensivo."]
        : report.criticalWeaknesses.map((hit) => {
            const typeLabel = formatTypeLabel(hit.type, language);
            const withEmoji = formatPokemonTypeWithEmoji(hit.type, typeLabel);
            return `${withEmoji} (Atraviesa a ${hit.weakCount} Pokémon)`;
          });

    const immunityLines =
      report.immunities.length === 0
        ? ["— Ninguna inmunidad en el equipo."]
        : report.immunities.map((imm) => {
            const typeLabel = formatTypeLabel(imm.type, language);
            const withEmoji = formatPokemonTypeWithEmoji(imm.type, typeLabel);
            const names = imm.immuneMembers.join(", ");
            return `${withEmoji} (Inmune: ${names})`;
          });

    const firstType = members[0]?.types[0] ?? "normal";
    const color = getTypeColor(firstType);

    const embed = createBasePokemonEmbed(
      `Teambuilder · ${interaction.user.username}`,
    )
      .setTitle("📊 Reporte de Sinergia")
      .setDescription(
        "Análisis de coberturas cruzadas y vulnerabilidades del equipo.",
      )
      .setColor(color)
      .addFields(
        {
          name: "🚨 Amenazas Críticas",
          value: weaknessLines.join("\n").slice(0, 1024),
          inline: false,
        },
        {
          name: "\u200B",
          value: "\u200B",
          inline: false,
        },
        {
          name: "🛡️ Muros e Inmunidades",
          value: immunityLines.join("\n").slice(0, 1024),
          inline: false,
        },
      )
      .setTimestamp(new Date());

    const firstFilled = team.slots.find((s) => s != null);
    if (firstFilled) {
      try {
        const data = await getPokemonData(firstFilled.species);
        if (data.spriteUrl) embed.setThumbnail(data.spriteUrl);
      } catch {
        /* opcional */
      }
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const message =
      error instanceof PokemonApiError
        ? error.message
        : "No se pudo analizar la sinergia del equipo.";
    await interaction.editReply({ content: `❌ ${message}` });
  }
}
