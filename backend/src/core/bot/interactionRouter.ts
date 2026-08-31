import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  Interaction,
  ModalSubmitInteraction,
} from "discord.js";
import { MessageFlags } from "discord.js";
import { logger } from "../log.js";
import {
  dispatchAutocomplete,
  dispatchButton,
  dispatchModal,
  type ModuleRegistry,
} from "../modules/registry.js";
import { allowChatCommand } from "./commandRateLimit.js";

const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const;

/**
 * Despacha interacciones a handlers registrados por módulos
 * (slash commands + autocomplete + botones + modal submits).
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
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction, registry);
      return;
    }
    if (interaction.isChatInputCommand()) {
      await handleChatInput(interaction, registry);
      return;
    }
    if (interaction.isButton()) {
      await handleButton(interaction, registry);
      return;
    }
    if (interaction.isModalSubmit()) {
      await handleModal(interaction, registry);
    }
  } catch (error: unknown) {
    logger.error({ err: error }, "Error en interactionCreate:");
    if (
      interaction.isRepliable() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction
        .reply({
          content: "Ocurrió un error al procesar la interacción.",
          ...EPHEMERAL,
        })
        .catch(() => undefined);
    }
  }
}

async function handleAutocomplete(
  interaction: AutocompleteInteraction,
  registry: ModuleRegistry,
): Promise<void> {
  try {
    const handled = await dispatchAutocomplete(registry, interaction);
    if (!handled && !interaction.responded) {
      await interaction.respond([]);
    }
  } catch (error) {
    logger.warn({ err: error }, "autocomplete falló:");
    if (!interaction.responded) {
      await interaction.respond([]).catch(() => undefined);
    }
  }
}

async function handleChatInput(
  interaction: ChatInputCommandInteraction,
  registry: ModuleRegistry,
): Promise<void> {
  if (!allowChatCommand(interaction.user.id, interaction.commandName)) {
    await interaction.reply({
      content: "⏳ Vas demasiado rápido. Espera unos segundos.",
      ...EPHEMERAL,
    });
    return;
  }

  const def = registry.commands.find((c) => c.name === interaction.commandName);
  if (def) {
    await def.handle(interaction);
    return;
  }

  if (registry.fallbackChat) {
    const customHandled = await registry.fallbackChat(interaction);
    if (customHandled) return;
  }

  await interaction.reply({
    content: `Comando \`/${interaction.commandName}\` no registrado.`,
    ...EPHEMERAL,
  });
}

async function handleButton(
  interaction: ButtonInteraction,
  registry: ModuleRegistry,
): Promise<void> {
  const handled = await dispatchButton(registry, interaction);
  if (handled) return;

  if (interaction.replied || interaction.deferred) return;
  await interaction.reply({
    content: `No hay handler registrado para \`${interaction.customId}\`.`,
    ...EPHEMERAL,
  });
}

async function handleModal(
  interaction: ModalSubmitInteraction,
  registry: ModuleRegistry,
): Promise<void> {
  const handled = await dispatchModal(registry, interaction);
  if (handled) return;

  if (interaction.replied || interaction.deferred) return;
  await interaction.reply({
    content: `No hay handler de modal para \`${interaction.customId}\`.`,
    ...EPHEMERAL,
  });
}
