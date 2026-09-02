import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder, MessageFlags } from "discord.js";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import { getLevelsConfigCached, getUserRankStats } from "../service.js";

const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const;

/**
 * /rank — consulta user_xp, posición global y progreso al siguiente nivel.
 */
export async function handleRankCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "Este comando solo funciona en un servidor.",
      ...EPHEMERAL,
    });
    return;
  }

  const config = await getLevelsConfigCached(interaction.guildId);
  if (!config.enabled) {
    await interaction.reply({
      content: "El módulo Levels está desactivado en este servidor.",
      ...EPHEMERAL,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  await interaction.deferReply(
    ephemeral ? { flags: MessageFlags.Ephemeral } : {},
  );

  const target = interaction.options.getUser("usuario") ?? interaction.user;
  const stats = await getUserRankStats(interaction.guildId, target.id);

  if (!stats) {
    await interaction.editReply({
      content:
        target.id === interaction.user.id
          ? "Aún no tienes XP. ¡Envía mensajes o entra a voz para empezar!"
          : `<@${target.id}> todavía no tiene XP registrada.`,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xe11d48)
    .setAuthor({
      name: target.tag,
      iconURL: target.displayAvatarURL({ size: 128 }),
    })
    .setTitle("📊 Tu rango")
    .addFields(
      { name: "Nivel", value: `**${stats.level}**`, inline: true },
      {
        name: "XP total",
        value: `\`${stats.xp.toLocaleString("es-MX")}\``,
        inline: true,
      },
      {
        name: "Posición",
        value: `**#${stats.rank}** / ${stats.totalUsers}`,
        inline: true,
      },
      {
        name: "Siguiente nivel",
        value: `Faltan **${stats.xpRemaining.toLocaleString("es-MX")}** XP (meta \`${stats.xpForNextLevel.toLocaleString("es-MX")}\`)`,
        inline: false,
      },
    )
    .setTimestamp(new Date());

  await interaction.editReply({ embeds: [embed] });
}
