import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import {
  addUserXp,
  deductUserXp,
  getLevelsConfigCached,
  setUserLevel,
} from "../service.js";

/**
 * /givexp usuario cantidad — suma XP y recalcula nivel.
 */
export async function handleGiveXpCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "Este comando solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const config = getLevelsConfigCached(interaction.guildId);
  if (!config.enabled) {
    await interaction.reply({
      content: "El módulo de Rangos y XP está desactivado en este servidor.",
      ephemeral: true,
    });
    return;
  }

  const target = interaction.options.getUser("usuario", true);
  const amount = interaction.options.getInteger("cantidad", true);
  if (amount < 1) {
    await interaction.reply({
      content: "La cantidad debe ser mayor que 0.",
      ephemeral: true,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  const result = addUserXp(interaction.guildId, target.id, amount);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("XP otorgada")
    .setDescription(
      `Añadiste **${amount.toLocaleString("es-MX")}** XP a <@${target.id}>.`,
    )
    .addFields(
      {
        name: "XP total",
        value: `\`${result.xp.toLocaleString("es-MX")}\``,
        inline: true,
      },
      {
        name: "Nivel",
        value: `\`${result.newLevel}\``,
        inline: true,
      },
    )
    .setTimestamp(new Date());

  if (result.leveledUp) {
    embed.setFooter({
      text: `Subió del nivel ${result.previousLevel} → ${result.newLevel}`,
    });
  }

  await interaction.reply({ embeds: [embed], ephemeral });
}

/**
 * /removexp usuario cantidad — resta XP (mín. 0) y recalcula nivel.
 */
export async function handleRemoveXpCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "Este comando solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const config = getLevelsConfigCached(interaction.guildId);
  if (!config.enabled) {
    await interaction.reply({
      content: "El módulo de Rangos y XP está desactivado en este servidor.",
      ephemeral: true,
    });
    return;
  }

  const target = interaction.options.getUser("usuario", true);
  const amount = interaction.options.getInteger("cantidad", true);
  if (amount < 1) {
    await interaction.reply({
      content: "La cantidad debe ser mayor que 0.",
      ephemeral: true,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  const result = deductUserXp(interaction.guildId, target.id, amount);
  const removed = Math.abs(result.gained);

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle("XP retirada")
    .setDescription(
      `Quitaste **${removed.toLocaleString("es-MX")}** XP a <@${target.id}>.`,
    )
    .addFields(
      {
        name: "XP total",
        value: `\`${result.xp.toLocaleString("es-MX")}\``,
        inline: true,
      },
      {
        name: "Nivel",
        value: `\`${result.newLevel}\``,
        inline: true,
      },
    )
    .setTimestamp(new Date());

  if (result.newLevel < result.previousLevel) {
    embed.setFooter({
      text: `Bajó del nivel ${result.previousLevel} → ${result.newLevel}`,
    });
  }

  await interaction.reply({ embeds: [embed], ephemeral });
}

/**
 * /setlevel usuario nivel — fija nivel y XP base de ese nivel.
 */
export async function handleSetLevelCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "Este comando solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const config = getLevelsConfigCached(interaction.guildId);
  if (!config.enabled) {
    await interaction.reply({
      content: "El módulo de Rangos y XP está desactivado en este servidor.",
      ephemeral: true,
    });
    return;
  }

  const target = interaction.options.getUser("usuario", true);
  const level = interaction.options.getInteger("nivel", true);
  if (level < 0) {
    await interaction.reply({
      content: "El nivel debe ser ≥ 0.",
      ephemeral: true,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  const result = setUserLevel(interaction.guildId, target.id, level);

  const embed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle("Nivel establecido")
    .setDescription(
      `El nivel de <@${target.id}> se fijó manualmente en **${result.level}**.`,
    )
    .addFields(
      {
        name: "XP base",
        value: `\`${result.xp.toLocaleString("es-MX")}\``,
        inline: true,
      },
      {
        name: "Antes",
        value: `Nivel ${result.previousLevel} · \`${result.previousXp.toLocaleString("es-MX")}\` XP`,
        inline: true,
      },
    )
    .setTimestamp(new Date());

  await interaction.reply({ embeds: [embed], ephemeral });
}
