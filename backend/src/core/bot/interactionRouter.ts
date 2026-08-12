import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  Interaction,
} from "discord.js";
import {
  dispatchButton,
  type ModuleRegistry,
} from "../modules/registry.js";

/**
 * Despacha interacciones a handlers registrados por módulos
 * (slash commands + botones por id/prefijo).
 */
export function registerInteractionRouter(
  client: Client,
  registry: ModuleRegistry,
): void {
  client.on("interactionCreate", (interaction) => {
    void onInteractionCreate(interaction, registry);
  });
}

async function onInteractionCreate(
  interaction: Interaction,
  registry: ModuleRegistry,
): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      await handleChatInput(interaction, registry);
      return;
    }
    if (interaction.isButton()) {
      await handleButton(interaction, registry);
    }
  } catch (error: unknown) {
    console.error("[adobos] Error en interactionCreate:", error);
    if (
      interaction.isRepliable() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction
        .reply({
          content: "Ocurrió un error al procesar la interacción.",
          ephemeral: true,
        })
        .catch(() => undefined);
    }
  }
}

async function handleChatInput(
  interaction: ChatInputCommandInteraction,
  registry: ModuleRegistry,
): Promise<void> {
  const def = registry.commands.find((c) => c.name === interaction.commandName);
  if (!def) {
    await interaction.reply({
      content: `Comando \`/${interaction.commandName}\` no registrado.`,
      ephemeral: true,
    });
    return;
  }
  await def.handle(interaction);
}

async function handleButton(
  interaction: ButtonInteraction,
  registry: ModuleRegistry,
): Promise<void> {
  // Handlers legacy de prueba del núcleo
  if (interaction.customId === "test_button_1") {
    await interaction.reply({
      content: "¡El botón interactivo funciona!",
      ephemeral: true,
    });
    return;
  }

  const handled = await dispatchButton(registry, interaction);
  if (handled) return;

  if (interaction.replied || interaction.deferred) return;
  await interaction.reply({
    content: `No hay handler registrado para \`${interaction.customId}\`.`,
    ephemeral: true,
  });
}
