import type { ChatInputCommandInteraction } from "discord.js";
import { consumeInteractionEphemeral } from "../ephemeral.js";
import { logger } from "../../../core/log.js";

/** Stub genérico mientras se implementa la lógica de negocio. */
export async function stubCommand(
  interaction: ChatInputCommandInteraction,
  feature: string,
): Promise<void> {
  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  logger.info(
    `stub /${interaction.commandName} (${feature}) guild=${interaction.guildId}`,
  );
  await interaction.reply({
    content: `🚧 \`/${interaction.commandName}\` está registrado. Lógica de **${feature}** pendiente.`,
    ephemeral,
  });
}
