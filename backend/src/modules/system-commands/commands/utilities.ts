import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder, MessageFlags } from "discord.js";
import { consumeInteractionEphemeral } from "../ephemeral.js";

export async function handlePingCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  const sent = await interaction.reply({
    content: "🏓 Pong…",
    ephemeral,
    fetchReply: true,
  });
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  const ws = interaction.client.ws.ping;
  await interaction.editReply({
    content: `🏓 Pong — API \`${latency}ms\` · WS \`${ws}ms\``,
  });
}

export async function handleServerInfoCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "This command only works in a server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle(guild.name)
    .setThumbnail(guild.iconURL({ size: 128 }) ?? null)
    .addFields(
      {
        name: "Members",
        value: String(guild.memberCount),
        inline: true,
      },
      {
        name: "Created",
        value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
        inline: true,
      },
      {
        name: "ID",
        value: `\`${guild.id}\``,
        inline: false,
      },
    )
    .setTimestamp(new Date());

  await interaction.reply({ embeds: [embed], ephemeral });
}
