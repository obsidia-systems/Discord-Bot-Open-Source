import type { ChatInputCommandInteraction } from "discord.js";
import { consumeInteractionEphemeral } from "../ephemeral.js";

/** Stub genérico mientras se implementa la lógica de negocio. */
export async function stubCommand(
  interaction: ChatInputCommandInteraction,
  feature: string,
): Promise<void> {
  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  console.log(
    `[adobos] stub /${interaction.commandName} (${feature}) guild=${interaction.guildId}`,
  );
  await interaction.reply({
    content: `🚧 \`/${interaction.commandName}\` está registrado. Lógica de **${feature}** pendiente.`,
    ephemeral,
  });
}
