import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  Interaction,
  ModalSubmitInteraction,
} from "discord.js";
import { logger } from "../log.js";
import {
  dispatchButton,
  dispatchModal,
  type ModuleRegistry,
} from "../modules/registry.js";
import { allowChatCommand } from "./commandRateLimit.js";

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
      await handleAutocomplete(interaction);
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
          ephemeral: true,
        })
        .catch(() => undefined);
    }
  }
}

async function handleAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  try {
    const { getSystemCommandDefinition } = await import("@adobos/shared");
    if (!getSystemCommandDefinition(interaction.commandName)) {
      await interaction.respond([]);
      return;
    }

    if (interaction.commandName === "buy") {
      const { handleBuyAutocomplete } = await import(
        "../../modules/economy/commands/buy.js"
      );
      await handleBuyAutocomplete(interaction);
      return;
    }

    if (
      interaction.commandName === "pokeinfo" ||
      interaction.commandName === "teambuilder" ||
      interaction.commandName === "weakness" ||
      interaction.commandName === "breeding" ||
      interaction.commandName === "location" ||
      interaction.commandName === "counters" ||
      interaction.commandName === "sandwich"
    ) {
      const { handlePokeinfoAutocomplete } = await import(
        "../../modules/pokemon/commands/pokeinfo.js"
      );
      await handlePokeinfoAutocomplete(interaction);
      return;
    }

    await interaction.respond([]);
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
      ephemeral: true,
    });
    return;
  }

  // 1) Comandos nativos del catálogo (mega-lista)
  try {
    const { getSystemCommandDefinition } = await import("@adobos/shared");
    if (getSystemCommandDefinition(interaction.commandName)) {
      const { assertSystemCommandAllowed } = await import(
        "../../modules/system-commands/guard.js"
      );
      const guard = await assertSystemCommandAllowed(interaction);
      if (!guard.ok) {
        await interaction.reply({
          content: guard.message,
          ephemeral: true,
        });
        return;
      }

      const { dispatchDefaultCommand } = await import(
        "../../modules/system-commands/handlers/index.js"
      );
      const handled = await dispatchDefaultCommand(interaction);
      if (handled) return;
    }
  } catch (error) {
    logger.warn({ err: error }, "default-commands dispatch falló:");
  }

  // 2) Handlers registrados por módulos (legacy / plugins)
  const def = registry.commands.find((c) => c.name === interaction.commandName);
  if (def) {
    await def.handle(interaction);
    return;
  }

  // 3) Comandos custom de la guild
  try {
    const { handleCustomChatCommand } = await import(
      "../../modules/custom-commands/handler.js"
    );
    const handled = await handleCustomChatCommand(interaction);
    if (handled) return;
  } catch (error) {
    logger.warn({ err: error }, "custom-commands handler falló:");
  }

  await interaction.reply({
    content: `Comando \`/${interaction.commandName}\` no registrado.`,
    ephemeral: true,
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
    ephemeral: true,
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
    ephemeral: true,
  });
}
