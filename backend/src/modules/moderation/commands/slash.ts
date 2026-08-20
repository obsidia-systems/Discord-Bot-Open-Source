import type { ChatInputCommandInteraction } from "discord.js";
import {
  ApplicationCommandOptionType,
  type APIApplicationCommandOption,
} from "discord.js";
import { executeModAction, ModerationError } from "../service.js";

async function replyError(
  interaction: ChatInputCommandInteraction,
  message: string,
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: message });
    return;
  }
  await interaction.reply({ content: message, ephemeral: true });
}

async function runModSlash(
  interaction: ChatInputCommandInteraction,
  action: "ban" | "kick" | "timeout",
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "Este comando solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const user = interaction.options.getUser("usuario", true);
  const reason =
    interaction.options.getString("razon")?.trim() ||
    `Acción /${action} por ${interaction.user.tag}`;
  const durationSeconds =
    action === "timeout"
      ? (interaction.options.getInteger("minutos") ?? 10) * 60
      : undefined;
  const deleteMessageDays =
    action === "ban"
      ? (interaction.options.getInteger("borrar_dias") ?? 0)
      : undefined;

  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await executeModAction(interaction.client, {
      action,
      guildId: interaction.guildId,
      userId: user.id,
      reason,
      durationSeconds,
      deleteMessageDays,
      dmMode: "none",
    });
    await interaction.editReply({ content: `✅ ${result.message}` });
  } catch (error) {
    const message =
      error instanceof ModerationError
        ? error.message
        : "No se pudo ejecutar la acción de moderación.";
    await replyError(interaction, `❌ ${message}`);
  }
}

export async function handleBanCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await runModSlash(interaction, "ban");
}

export async function handleKickCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await runModSlash(interaction, "kick");
}

export async function handleTimeoutCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await runModSlash(interaction, "timeout");
}

export const banCommandOptions: APIApplicationCommandOption[] = [
  {
    type: ApplicationCommandOptionType.User,
    name: "usuario",
    description: "Miembro a banear.",
    required: true,
  },
  {
    type: ApplicationCommandOptionType.String,
    name: "razon",
    description: "Motivo del baneo.",
    required: false,
  },
  {
    type: ApplicationCommandOptionType.Integer,
    name: "borrar_dias",
    description: "Borrar mensajes de los últimos N días (0–7).",
    required: false,
    min_value: 0,
    max_value: 7,
  },
];

export const kickCommandOptions: APIApplicationCommandOption[] = [
  {
    type: ApplicationCommandOptionType.User,
    name: "usuario",
    description: "Miembro a expulsar.",
    required: true,
  },
  {
    type: ApplicationCommandOptionType.String,
    name: "razon",
    description: "Motivo de la expulsión.",
    required: false,
  },
];

export const timeoutCommandOptions: APIApplicationCommandOption[] = [
  {
    type: ApplicationCommandOptionType.User,
    name: "usuario",
    description: "Miembro a silenciar.",
    required: true,
  },
  {
    type: ApplicationCommandOptionType.Integer,
    name: "minutos",
    description: "Duración del timeout en minutos (por defecto 10).",
    required: false,
    min_value: 1,
    max_value: 40320,
  },
  {
    type: ApplicationCommandOptionType.String,
    name: "razon",
    description: "Motivo del timeout.",
    required: false,
  },
];
