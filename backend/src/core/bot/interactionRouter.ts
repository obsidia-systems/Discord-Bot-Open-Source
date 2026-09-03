import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  Interaction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import { Events, MessageFlags } from "discord.js";
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
 * Discord invalida el token de la interacción a los 3 s si no hubo ACK.
 * Si un handler no respondió a los 2,5 s, el router hace `deferReply` por él
 * para no perder el token — y lo registra para arreglar ese comando.
 */
const DEFER_DEADLINE_MS = 2_500;
/** Umbral de log: por encima de esto la interacción va WARN, no DEBUG. */
const SLOW_INTERACTION_MS = 1_500;

/**
 * Despacha interacciones a handlers registrados por módulos
 * (slash commands + autocomplete + botones + modal submits).
 */
export function registerInteractionRouter(
  client: Client,
  registry: ModuleRegistry,
): void {
  client.on(Events.InteractionCreate, (interaction) => {
    void routeInteraction(interaction, registry);
  });
}

function interactionLabel(interaction: Interaction): string {
  if (interaction.isChatInputCommand()) return `/${interaction.commandName}`;
  if (interaction.isAutocomplete()) {
    return `autocomplete:${interaction.commandName}`;
  }
  if (interaction.isButton()) return `button:${interaction.customId}`;
  if (interaction.isStringSelectMenu()) {
    return `select:${interaction.customId}`;
  }
  if (interaction.isModalSubmit()) return `modal:${interaction.customId}`;
  return `type:${interaction.type}`;
}

async function routeInteraction(
  interaction: Interaction,
  registry: ModuleRegistry,
): Promise<void> {
  const label = interactionLabel(interaction);
  const startedAt = Date.now();

  let deadline: ReturnType<typeof setTimeout> | undefined;
  if (interaction.isRepliable()) {
    deadline = setTimeout(() => {
      if (
        !interaction.isRepliable() ||
        interaction.replied ||
        interaction.deferred
      ) {
        return;
      }
      logger.warn(
        { interaction: label },
        "router: auto-defer — el handler superó 2,5 s sin ACK",
      );
      void interaction.deferReply().catch(() => undefined);
    }, DEFER_DEADLINE_MS);
    deadline.unref?.();
  }

  try {
    await onInteractionCreate(interaction, registry);
  } finally {
    if (deadline) clearTimeout(deadline);
    const ms = Date.now() - startedAt;
    if (ms >= SLOW_INTERACTION_MS) {
      logger.warn({ interaction: label, ms }, "interacción lenta");
    } else {
      logger.debug({ interaction: label, ms }, "interacción");
    }
  }
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
