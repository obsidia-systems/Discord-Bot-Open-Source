import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder, MessageFlags } from "discord.js";
import { consumeInteractionEphemeral } from "#modules/system-commands/ephemeral.js";
import { getLevelsConfigCached, getUserRankStats } from "../domain/levels.js";

const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const;

/**
 * /rank — consulta user_xp, posición global y progreso al siguiente nivel.
 */
export async function handleRankCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "This command only works in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const config = await getLevelsConfigCached(interaction.guildId);
  if (!config.enabled) {
    await interaction.reply({
      content: "The Levels module is disabled in this server.",
      ...EPHEMERAL,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  await interaction.deferReply(
    ephemeral ? { flags: MessageFlags.Ephemeral } : {},
  );

  const target = interaction.options.getUser("user") ?? interaction.user;
  const stats = await getUserRankStats(interaction.guildId, target.id);

  if (!stats) {
    await interaction.editReply({
      content:
        target.id === interaction.user.id
          ? "You don't have any XP yet. Send messages or join voice to get started!"
          : `<@${target.id}> has no XP recorded yet.`,
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
      { name: "Level", value: `**${stats.level}**`, inline: true },
      {
        name: "XP total",
        value: `\`${stats.xp.toLocaleString("es-MX")}\``,
        inline: true,
      },
      {
        name: "Rank",
        value: `**#${stats.rank}** / ${stats.totalUsers}`,
        inline: true,
      },
      {
        name: "Next level",
        value: `**${stats.xpRemaining.toLocaleString("es-MX")}** XP left (goal \`${stats.xpForNextLevel.toLocaleString("es-MX")}\`)`,
        inline: false,
      },
    )
    .setTimestamp(new Date());

  await interaction.editReply({ embeds: [embed] });
}
