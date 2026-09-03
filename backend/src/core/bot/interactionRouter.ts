import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  Interaction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import { MessageFlags } from "discord.js";
import { logger } from "../log.js";
import {
  dispatchAutocomplete,
  dispatchButton,
  dispatchModal,
  dispatchSelect,
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
    if (interaction.isStringSelectMenu()) {
      await handleSelect(interaction, registry);
      return;
    }
    if (interaction.isModalSubmit()) {
      await handleModal(interaction, registry);
    }
  } catch (error: unknown) {
    logger.error({ err: error }, "Error in interactionCreate:");
    if (
      interaction.isRepliable() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction
        .reply({
          content: "An error occurred while processing the interaction.",
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
    logger.warn({ err: error }, "autocomplete failed:");
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
      content: "⏳ You're going too fast. Wait a few seconds.",
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
    content: `Command \`/${interaction.commandName}\` is not registered.`,
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
    content: `No handler registered for \`${interaction.customId}\`.`,
    ...EPHEMERAL,
  });
}

async function handleSelect(
  interaction: StringSelectMenuInteraction,
  registry: ModuleRegistry,
): Promise<void> {
  const handled = await dispatchSelect(registry, interaction);
  if (handled) return;

  if (interaction.replied || interaction.deferred) return;
  await interaction.reply({
    content: `No select handler for \`${interaction.customId}\`.`,
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
    content: `No modal handler for \`${interaction.customId}\`.`,
    ...EPHEMERAL,
  });
}
