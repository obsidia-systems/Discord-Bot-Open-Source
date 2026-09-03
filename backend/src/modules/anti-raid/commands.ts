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
      content: "Use this command in a server.",
      ...EPHEMERAL,
    });
    return;
  }
  if (!canLockdown(interaction)) {
    await interaction.reply({
      content: "You need Manage Server for the lockdown.",
      ...EPHEMERAL,
    });
    return;
  }

  const sub = interaction.options.getSubcommand();
  const settings = await getAntiRaidSettings(interaction.guild.id);

  if (sub === "status") {
    await interaction.reply({
      content: settings.lockdownActive
        ? "Lockdown **active**. `/lockdown off` to restore."
        : "Lockdown **off**.",
      ...EPHEMERAL,
    });
    return;
  }

  await interaction.deferReply({ ...EPHEMERAL });

  if (sub === "on") {
    if (settings.lockdownActive) {
      await interaction.editReply("The lockdown was already active.");
      return;
    }
    const reason =
      interaction.options.getString("reason")?.trim() || "/lockdown command";
    const result = await applyGuildLockdown(
      interaction.guild,
      interaction.user.id,
    );
    const alert = await resolveAlertChannel(interaction.guild, settings);
    await sendAntiRaidAlert(
      alert,
      "Lockdown",
      `<@${interaction.user.id}> activated the lockdown (${reason}). Channels affected: ${result.channels}.`,
    );
    await interaction.editReply(
      `Lockdown active. @everyone can't send messages or connect in ${result.channels} channels.`,
    );
    return;
  }

  if (sub === "off") {
    if (!settings.lockdownActive) {
      await interaction.editReply("There is no active lockdown.");
      return;
    }
    const result = await liftGuildLockdown(interaction.guild);
    const alert = await resolveAlertChannel(interaction.guild, settings);
    await sendAntiRaidAlert(
      alert,
      "Lockdown",
      `<@${interaction.user.id}> removed the lockdown. Channels restored: ${result.channels}.`,
    );
    await interaction.editReply(
      `Lockdown removed. @everyone was restored in ${result.channels} channels.`,
    );
  }
}
