import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder, MessageFlags } from "discord.js";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import {
  getLevelsConfigCached,
  listLeaderboardRows,
} from "../service.js";

const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const;

/**
 * /leaderboard — Top 10 de XP del servidor.
 */
export async function handleLeaderboardCommand(
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

  const rows = await listLeaderboardRows(interaction.guildId, 10);
  if (rows.length === 0) {
    await interaction.editReply({
      content: "Aún no hay XP registrada en este servidor.",
    });
    return;
  }

  const lines = rows.map((row, index) => {
    const medal =
      index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `\`${index + 1}.\``;
    return `${medal} <@${row.userId}> — Nv. **${row.level}** · \`${row.xp.toLocaleString("es-MX")} XP\``;
  });

  const embed = new EmbedBuilder()
    .setColor(0xa855f7)
    .setTitle(`🏆 Top ${rows.length} — ${interaction.guild.name}`)
    .setDescription(lines.join("\n"))
    .setTimestamp(new Date());

  await interaction.editReply({ embeds: [embed] });
}
