import type { ChatInputCommandInteraction } from "discord.js";
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

/** Parsea duraciones tipo 10m, 1h, 24h, 30s → segundos. */
export function parseDurationToSeconds(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase();
  const match = /^(\d+)\s*(s|m|h|d|seg|min|hora|horas|dia|días|dias)?$/.exec(
    trimmed,
  );
  if (!match) return null;
  const amount = Number.parseInt(match[1]!, 10);
  if (!Number.isFinite(amount) || amount < 1) return null;
  const unit = match[2] ?? "m";
  switch (unit) {
    case "s":
    case "seg":
      return amount;
    case "m":
    case "min":
      return amount * 60;
    case "h":
    case "hora":
    case "horas":
      return amount * 3600;
    case "d":
    case "dia":
    case "días":
    case "dias":
      return amount * 86400;
    default:
      return amount * 60;
  }
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

  let durationSeconds: number | undefined;
  if (action === "timeout") {
    const duracion = interaction.options.getString("duracion", true);
    const parsed = parseDurationToSeconds(duracion);
    if (parsed === null) {
      await interaction.reply({
        content:
          "❌ Duración inválida. Usa formatos como `10m`, `1h` o `24h`.",
        ephemeral: true,
      });
      return;
    }
    durationSeconds = Math.min(parsed, 28 * 86400);
  }

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
