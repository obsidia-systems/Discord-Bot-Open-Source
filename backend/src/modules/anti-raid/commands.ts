import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getAntiRaidSettings } from "./service.js";
import { applyGuildLockdown, liftGuildLockdown } from "./lockdown.js";
import { resolveAlertChannel, sendAntiRaidAlert } from "./alerts.js";

const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const;

function canLockdown(interaction: ChatInputCommandInteraction): boolean {
  const perms = interaction.memberPermissions;
  if (!perms) return false;
  return (
    perms.has(PermissionFlagsBits.ManageGuild) ||
    perms.has(PermissionFlagsBits.Administrator)
  );
}

export async function handleLockdownCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: "Usa este comando en un servidor.",
      ...EPHEMERAL,
    });
    return;
  }
  if (!canLockdown(interaction)) {
    await interaction.reply({
      content: "Necesitas Administrar servidor para el lockdown.",
      ...EPHEMERAL,
    });
    return;
  }

  const sub = interaction.options.getSubcommand();
  const settings = await getAntiRaidSettings(interaction.guild.id);

  if (sub === "status") {
    await interaction.reply({
      content: settings.lockdownActive
        ? "Lockdown **activo**. `/lockdown off` para restaurar."
        : "Lockdown **apagado**.",
      ...EPHEMERAL,
    });
    return;
  }

  await interaction.deferReply({ ...EPHEMERAL });

  if (sub === "on") {
    if (settings.lockdownActive) {
      await interaction.editReply("El lockdown ya estaba activo.");
      return;
    }
    const reason =
      interaction.options.getString("razon")?.trim() || "comando /lockdown";
    const result = await applyGuildLockdown(
      interaction.guild,
      interaction.user.id,
    );
    const alert = await resolveAlertChannel(interaction.guild, settings);
    await sendAntiRaidAlert(
      alert,
      "Lockdown",
      `<@${interaction.user.id}> activó el lockdown (${reason}). Canales tocados: ${result.channels}.`,
    );
    await interaction.editReply(
      `Lockdown activo. @everyone no puede escribir ni conectar en ${result.channels} canales.`,
    );
    return;
  }

  if (sub === "off") {
    if (!settings.lockdownActive) {
      await interaction.editReply("No hay lockdown activo.");
      return;
    }
    const result = await liftGuildLockdown(interaction.guild);
    const alert = await resolveAlertChannel(interaction.guild, settings);
    await sendAntiRaidAlert(
      alert,
      "Lockdown",
      `<@${interaction.user.id}> quitó el lockdown. Canales restaurados: ${result.channels}.`,
    );
    await interaction.editReply(
      `Lockdown quitado. Se restauró @everyone en ${result.channels} canales.`,
    );
  }
}
