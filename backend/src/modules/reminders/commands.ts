import {
  assertRemindDueInRange,
  dueFromDurationSeconds,
  formatRemindDiscordStamp,
  parseRemindDurationSeconds,
  parseRemindWhen,
  REMIND_BUTTON_CANCEL_PREFIX,
  type Reminder,
} from "@adobos/shared";
import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import {
  createReminder,
  deleteReminder,
  getReminderSettings,
  listUserReminders,
  RemindersError,
} from "./domain/reminders.js";

const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const;

function cancelRow(id: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${REMIND_BUTTON_CANCEL_PREFIX}${id}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );
}

async function replyError(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  error: unknown,
): Promise<void> {
  const message =
    error instanceof RemindersError
      ? error.message
      : "Couldn't save the reminder.";
  const payload = { content: message, ...EPHEMERAL };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => null);
    return;
  }
  await interaction.reply(payload).catch(() => null);
}

function isStaff(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
): boolean {
  const member = interaction.member;
  if (!member || typeof member === "string") return false;
  const perms = "permissions" in member ? member.permissions : null;
  if (!perms || typeof perms === "string") return false;
  return perms.has(PermissionFlagsBits.ManageGuild);
}

function formatLine(row: Reminder): string {
  return `**#${row.id}** ${formatRemindDiscordStamp(new Date(row.dueAt))} — ${row.message}`;
}

async function createFromDue(
  interaction: ChatInputCommandInteraction,
  due: Date,
  text: string,
): Promise<void> {
  const now = new Date();
  const range = assertRemindDueInRange(due, now);
  if (range === "too_soon") {
    throw new RemindersError("Minimum 1 minute.", 400, "TOO_SOON");
  }
  if (range === "too_far") {
    throw new RemindersError("Maximum 365 days.", 400, "TOO_FAR");
  }
  if (!interaction.guildId || !interaction.channelId) {
    throw new RemindersError(
      "Use this command in a server channel.",
      400,
      "NO_CHANNEL",
    );
  }
  const row = await createReminder({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    channelId: interaction.channelId,
    message: text,
    dueAt: due,
  });
  await interaction.reply({
    content: `I'll ping you ${formatRemindDiscordStamp(due)}.\n#${row.id}: ${row.message}`,
    components: [cancelRow(row.id)],
    ...EPHEMERAL,
  });
}

export async function handleRemindCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: "Use this command in a server.",
      ...EPHEMERAL,
    });
    return;
  }
  const sub = interaction.options.getSubcommand(true);
  try {
    if (sub === "list") {
      const rows = await listUserReminders(
        interaction.guildId,
        interaction.user.id,
      );
      if (rows.length === 0) {
        await interaction.reply({
          content: "You have no pending reminders.",
          ...EPHEMERAL,
        });
        return;
      }
      const body = rows.slice(0, 10).map(formatLine).join("\n");
      const extra = rows.length > 10 ? `\n…and ${rows.length - 10} more.` : "";
      await interaction.reply({
        content: body + extra,
        ...EPHEMERAL,
      });
      return;
    }
    if (sub === "cancel") {
      const id = interaction.options.getInteger("id", true);
      await deleteReminder(
        id,
        interaction.guildId,
        interaction.user.id,
        isStaff(interaction),
      );
      await interaction.reply({
        content: `Cancelled #${id}.`,
        ...EPHEMERAL,
      });
      return;
    }

    const settings = await getReminderSettings(interaction.guildId);
    if (!settings.enabled) {
      throw new RemindersError(
        "Reminders is turned off in this server.",
        403,
        "DISABLED",
      );
    }
    const text = interaction.options.getString("text", true);
    const when = interaction.options.getString("when", true);
    if (sub === "in") {
      const seconds = parseRemindDurationSeconds(when);
      const due = seconds ? dueFromDurationSeconds(seconds, new Date()) : null;
      if (!due) {
        throw new RemindersError(
          "I didn't understand the duration. Try `20m`, `2h` or `1d12h`.",
          400,
          "BAD_DURATION",
        );
      }
      await createFromDue(interaction, due, text);
      return;
    }
    if (sub === "at") {
      const due = parseRemindWhen(when, settings.timezone, new Date());
      if (!due) {
        throw new RemindersError(
          "I didn't understand the time. Try `15:00` or `2026-09-03 18:30`.",
          400,
          "BAD_WHEN",
        );
      }
      await createFromDue(interaction, due, text);
      return;
    }
    throw new RemindersError("Unknown subcommand.", 400, "UNKNOWN");
  } catch (error: unknown) {
    await replyError(interaction, error);
  }
}

export async function handleRemindCancelButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: "Use this in a server.",
      ...EPHEMERAL,
    });
    return;
  }
  const raw = interaction.customId.slice(REMIND_BUTTON_CANCEL_PREFIX.length);
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id) || id < 1) {
    await interaction.reply({
      content: "Invalid id.",
      ...EPHEMERAL,
    });
    return;
  }
  try {
    await deleteReminder(
      id,
      interaction.guildId,
      interaction.user.id,
      isStaff(interaction),
    );
    if (interaction.message) {
      await interaction.update({
        content: `Cancelled #${id}.`,
        components: [],
      });
      return;
    }
    await interaction.reply({
      content: `Cancelled #${id}.`,
      ...EPHEMERAL,
    });
  } catch (error: unknown) {
    await replyError(interaction, error);
  }
}
