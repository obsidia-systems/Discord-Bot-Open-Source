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
  formatTypeLabel,
  getPokemonData,
  getPokemonSpecies,
  getTypeColor,
  resolveDisplayName,
  resolvePokemonForGeneration,
} from "../../../services/pokemonApi.js";
import { getCoverageMovepoolOptions } from "../../../services/pokemonMoves.js";
import {
  MAX_TEAM_SIZE,
  addPokemonToTeam,
  clearTeam,
  countFilledSlots,
  getOrCreateTeam,
  getTeamMessageRef,
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
} from "../../../utils/pokemonEmojis.js";
import { analyzeTeamSynergy } from "../../../utils/typeChart.js";
import {
  PokemonError,
  assertPokemonCommandAllowed,
  getPokemonConfig,
} from "../service.js";
import { pokemonAccessFromInteraction } from "../access.js";

export const TEAMBUILDER_ADV_PREFIX = "tb_adv_";
export const TEAMBUILDER_SYN_PREFIX = "tb_syn_";
export const TEAMBUILDER_SLOT_PREFIX = "tb_slot_";
export const TEAMBUILDER_MOVES_PREFIX = "tb_moves_";

function formatSpeciesLabel(species: string): string {
  return capitalizePokemonName(species.replace(/-/g, " "));
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
    return isForm
      ? capitalizePokemonName(data.name.replace(/-/g, " "))
      : displayName;
  } catch {
    return formatSpeciesLabel(species);
  }
}

function formatMovesLine(moves: string[]): string {
  if (moves.length === 0) return "";
  return moves
    .map((m) => `\`${capitalizePokemonName(m.replace(/-/g, " "))}\``)
    .join(" · ");
}

function buildSlotFieldValue(
  slot: TeamSlotData,
  displayName: string,
): string {
  const movesLine = formatMovesLine(slot.moves);
  if (movesLine) {
    return `**${displayName}**\n${movesLine}`;
  }
  return `**${displayName}**`;
}

async function buildTeamEmbed(
  team: TeamData,
  username: string,
): Promise<EmbedBuilder> {
  const filled = countFilledSlots(team);
  const first = team.slots.find((s) => s != null) ?? null;
  const color = first ? 0x3b82f6 : 0x64748b;

  const embed = new EmbedBuilder()
    .setTitle(`📋 Teambuilder de ${username}`)
    .setDescription(
      [
        `Tu equipo actual (**${filled}/${MAX_TEAM_SIZE}**).`,
        "",
        "`/teambuilder add` · `/teambuilder remove` · `/teambuilder clear`",
      ].join("\n"),
    )
    .setColor(color)
    .setTimestamp(new Date());

  const labels = await Promise.all(
    team.slots.map(async (slot) =>
      slot ? resolveDisplayLabel(slot.species) : null,
    ),
  );

  for (let i = 0; i < MAX_TEAM_SIZE; i += 1) {
    const slot = team.slots[i];
    if (slot && labels[i]) {
      embed.addFields({
        name: `Slot ${i + 1}`,
        value: buildSlotFieldValue(slot, labels[i]!),
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
        .setCustomId(`${TEAMBUILDER_ADV_PREFIX}${ownerId}`)
        .setLabel("Modo Avanzado: Movimientos")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(empty),
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
  const embed = await buildTeamEmbed(team, username);
  if (statusLine) {
    embed.setFooter({ text: statusLine.slice(0, 2048) });
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

async function editStoredPanel(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  team: TeamData,
  username: string,
): Promise<boolean> {
  const embeds = [await buildTeamEmbed(team, username)];
  const components = buildPanelComponents(team, team.userId);
  const ref = getTeamMessageRef(team.userId);

  if (ref) {
    try {
      const channel = await interaction.client.channels.fetch(ref.channelId);
      if (channel && "messages" in channel) {
        const msg = await channel.messages.fetch(ref.messageId);
        await msg.edit({ embeds, components });
        return true;
      }
    } catch {
      // panel borrado / efímero
    }
  }

  // Fallback: si el botón vive en el panel, actualizarlo.
  if (interaction.isButton() && interaction.message) {
    try {
      await interaction.message.edit({ embeds, components });
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * `/teambuilder view|add|remove|clear` — panel + gestión por subcomandos.
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

      // Valida especie contra PokéAPI antes de persistir.
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

    await interaction.reply({
      content:
        "❌ Subcomando no reconocido. Usa `view`, `add`, `remove` o `clear`.",
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

/** `tb_moves_{ownerId}_{slotIndex}` */
function parseMovesSelectCustomId(customId: string): {
  ownerId: string;
  slotIndex: number;
} | null {
  if (!customId.startsWith(TEAMBUILDER_MOVES_PREFIX)) return null;
  const raw = customId.slice(TEAMBUILDER_MOVES_PREFIX.length);
  const parts = raw.split("_");
  if (parts.length < 2) return null;
  const slotIndex = Number.parseInt(parts[parts.length - 1] ?? "", 10);
  const ownerId = parts.slice(0, -1).join("_");
  if (!ownerId || !Number.isFinite(slotIndex)) return null;
  return { ownerId, slotIndex: Math.trunc(slotIndex) };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/**
 * Botón → select de slot (efímero).
 */
export async function handleTeambuilderAdvancedButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const ownerId = ownerFromPrefix(interaction.customId, TEAMBUILDER_ADV_PREFIX);
  if (!ownerId) return;

  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "❌ Solo quien abrió el Teambuilder puede usarlo.",
      ephemeral: true,
    });
    return;
  }

  // Actualiza ref del panel si el botón está en el mensaje principal.
  if (interaction.message) {
    setTeamMessageRef(ownerId, {
      channelId: interaction.message.channelId,
      messageId: interaction.message.id,
      guildId: interaction.guildId ?? undefined,
    });
  }

  const team = getOrCreateTeam(ownerId);
  if (isTeamEmpty(team)) {
    await interaction.reply({
      content: "❌ El equipo está vacío. Añade Pokémon con `/teambuilder add`.",
      ephemeral: true,
    });
    return;
  }

  const options: StringSelectMenuOptionBuilder[] = [];
  for (let i = 0; i < MAX_TEAM_SIZE; i += 1) {
    const slot = team.slots[i];
    if (!slot) continue;
    const label = await resolveDisplayLabel(slot.species);
    const movesHint =
      slot.moves.length > 0 ? ` (${slot.moves.length}/4 movs)` : "";
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(truncate(`Slot ${i + 1}: ${label}${movesHint}`, 100))
        .setValue(String(i)),
    );
  }

  if (options.length === 0) {
    await interaction.reply({
      content: "❌ No hay Pokémon configurables en el equipo.",
      ephemeral: true,
    });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${TEAMBUILDER_SLOT_PREFIX}${ownerId}`)
    .setPlaceholder("Elige un Pokémon del equipo")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  await interaction.reply({
    content: "⚙️ **Modo Avanzado:** selecciona el Pokémon para editar sus movimientos.",
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    ],
    ephemeral: true,
  });
}

/**
 * Select de slot → select múltiple de movimientos (máx. 4).
 */
export async function handleTeambuilderSlotSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const ownerId = ownerFromPrefix(
    interaction.customId,
    TEAMBUILDER_SLOT_PREFIX,
  );
  if (!ownerId) return;

  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "❌ Solo quien abrió el Teambuilder puede usarlo.",
      ephemeral: true,
    });
    return;
  }

  const slotIndex = Number.parseInt(interaction.values[0] ?? "", 10);
  if (!Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= MAX_TEAM_SIZE) {
    await interaction.update({
      content: "❌ Slot inválido.",
      components: [],
    });
    return;
  }

  const team = getOrCreateTeam(ownerId);
  const slot = team.slots[slotIndex];
  if (!slot) {
    await interaction.update({
      content: "❌ Ese slot está vacío.",
      components: [],
    });
    return;
  }

  await interaction.deferUpdate();

  const guildId = interaction.guildId;
  const generation = guildId
    ? getPokemonConfig(guildId).defaultGeneration
    : 9;
  const language = guildId ? getPokemonConfig(guildId).language : "es";

  try {
    const pool = await getCoverageMovepoolOptions(
      slot.species,
      generation,
      language === "en" ? "en" : "es",
    );

    // Preferir ofensivos; incluir estado si quedan huecos (útil en competitivo).
    const damaging = pool.moves.filter((m) => m.damageClass !== "status");
    const status = pool.moves.filter((m) => m.damageClass === "status");
    const ordered = [...damaging, ...status].slice(0, 25);

    if (ordered.length === 0) {
      await interaction.editReply({
        content: `❌ **${await resolveDisplayLabel(slot.species)}** no tiene movimientos en Gen ${generation}.`,
        components: [],
      });
      return;
    }

    const label = await resolveDisplayLabel(slot.species);
    const preselected = new Set(
      slot.moves.map((m) => m.toLowerCase()).slice(0, 4),
    );
    let defaultBudget = Math.min(4, preselected.size, ordered.length);

    const select = new StringSelectMenuBuilder()
      .setCustomId(`${TEAMBUILDER_MOVES_PREFIX}${ownerId}_${slotIndex}`)
      .setPlaceholder(`Elige 1–4 movimientos para ${label}`)
      .setMinValues(1)
      .setMaxValues(Math.min(4, ordered.length))
      .addOptions(
        ordered.map((m) => {
          const isDefault =
            defaultBudget > 0 && preselected.has(m.apiName.toLowerCase());
          if (isDefault) defaultBudget -= 1;
          return new StringSelectMenuOptionBuilder()
            .setLabel(truncate(m.displayName, 100))
            .setDescription(
              truncate(
                `${m.type} · ${m.damageClass === "status" ? "Estado" : m.damageClass === "physical" ? "Físico" : "Especial"}`,
                100,
              ),
            )
            .setValue(m.apiName.slice(0, 100))
            .setDefault(isDefault);
        }),
      );

    const hint = pool.truncated
      ? ` (top 25 de ${pool.totalMoves} por uso competitivo)`
      : "";

    await interaction.editReply({
      content: `⚙️ Movimientos de **${label}**${hint}. Selecciona hasta **4**:`,
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      ],
    });
  } catch (error) {
    const message =
      error instanceof PokemonApiError
        ? error.message
        : "No se pudo cargar el movepool.";
    await interaction.editReply({
      content: `❌ ${message}`,
      components: [],
    });
  }
}

/**
 * Select de movimientos → guarda en DB y refresca el panel.
 */
export async function handleTeambuilderMovesSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const parsed = parseMovesSelectCustomId(interaction.customId);
  if (!parsed) return;

  const { ownerId, slotIndex } = parsed;
  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "❌ Solo quien abrió el Teambuilder puede usarlo.",
      ephemeral: true,
    });
    return;
  }

  const moves = interaction.values.slice(0, 4);
  if (moves.length === 0) {
    await interaction.update({
      content: "❌ Debes elegir al menos un movimiento.",
      components: [],
    });
    return;
  }

  try {
    const updated = setSlotMoves(ownerId, slotIndex, moves);
    const slot = updated.slots[slotIndex];
    const label = slot
      ? await resolveDisplayLabel(slot.species)
      : `Slot ${slotIndex + 1}`;

    await editStoredPanel(interaction, updated, interaction.user.username);

    await interaction.update({
      content: `✅ Movimientos de **${label}** guardados:\n${formatMovesLine(moves) || "—"}`,
      components: [],
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message === "INVALID_SLOT"
        ? "Ese slot ya no tiene Pokémon."
        : "No se pudieron guardar los movimientos.";
    await interaction.update({
      content: `❌ ${message}`,
      components: [],
    });
  }
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
            return `${withEmoji} (${hit.weakCount} Pokémon débiles)`;
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

    const embed = new EmbedBuilder()
      .setTitle("📊 Reporte de Sinergia")
      .setDescription(
        `Análisis defensivo de **${members.length}** Pokémon (Gen ${generation}).\n_Debilidad crítica = tipo SE contra ≥3 del equipo._`,
      )
      .setColor(color)
      .addFields(
        {
          name: "🚨 Debilidades Compartidas",
          value: weaknessLines.join("\n").slice(0, 1024),
          inline: false,
        },
        {
          name: "🛡️ Inmunidades Clave",
          value: immunityLines.join("\n").slice(0, 1024),
          inline: false,
        },
      )
      .setFooter({
        text: `Teambuilder · ${interaction.user.username}`,
      })
      .setTimestamp(new Date());

    // Thumbnail del primer Pokémon del equipo.
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
