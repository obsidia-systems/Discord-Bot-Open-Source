import {
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import { clampTimeoutSeconds, parseDurationToSeconds } from "../duration.js";
import {
  executeModAction,
  getMemberInfo,
  ModerationError,
} from "../service.js";

export { parseDurationToSeconds };

async function replyOnce(
  interaction: ChatInputCommandInteraction,
  content: string,
  ephemeral: boolean,
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content });
    return;
  }
  if (ephemeral) {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({ content });
}

async function requireGuild(
  interaction: ChatInputCommandInteraction,
  ephemeral: boolean,
): Promise<string | null> {
  if (interaction.guildId) return interaction.guildId;
  await replyOnce(
    interaction,
    "This command only works in a server.",
    ephemeral,
  );
  return null;
}

function resolveChannelId(
  interaction: ChatInputCommandInteraction,
): string | null {
  const option = interaction.options.getChannel("canal");
  return option?.id ?? interaction.channelId;
}

async function runModAction(
  interaction: ChatInputCommandInteraction,
  input: Parameters<typeof executeModAction>[1],
  ephemeral: boolean,
): Promise<void> {
  await interaction.deferReply(
    ephemeral ? { flags: MessageFlags.Ephemeral } : {},
  );
  try {
    const result = await executeModAction(
      interaction.client,
      input,
      interaction.user.id,
    );
    await interaction.editReply({ content: result.message });
  } catch (error) {
    const message =
      error instanceof ModerationError
        ? error.message
        : "Couldn't run the moderation action.";
    await replyOnce(interaction, message, ephemeral);
  }
}

export async function handleBanCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  const guildId = await requireGuild(interaction, ephemeral);
  if (!guildId) return;
  const user = interaction.options.getUser("usuario", true);
  const reason =
    interaction.options.getString("razon")?.trim() ||
    `/ban action by ${interaction.user.tag}`;
  await runModAction(
    interaction,
    {
      action: "ban",
      guildId,
      userId: user.id,
      reason,
      deleteMessageDays: interaction.options.getInteger("borrar_dias") ?? 0,
      dmMode: "none",
    },
    ephemeral,
  );
}

export async function handleKickCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  const guildId = await requireGuild(interaction, ephemeral);
  if (!guildId) return;
  const user = interaction.options.getUser("usuario", true);
  const reason =
    interaction.options.getString("razon")?.trim() ||
    `/kick action by ${interaction.user.tag}`;
  await runModAction(
    interaction,
    {
      action: "kick",
      guildId,
      userId: user.id,
      reason,
      dmMode: "none",
    },
    ephemeral,
  );
}

export async function handleTimeoutCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  const guildId = await requireGuild(interaction, ephemeral);
  if (!guildId) return;
  const parsed = parseDurationToSeconds(
    interaction.options.getString("duracion", true),
  );
  const durationSeconds = parsed === null ? null : clampTimeoutSeconds(parsed);
  if (durationSeconds === null) {
    await replyOnce(
      interaction,
      "Invalid duration. Use formats like `10m`, `1h` or `24h` (max 28 days).",
      ephemeral,
    );
    return;
  }
  const user = interaction.options.getUser("usuario", true);
  const reason =
    interaction.options.getString("razon")?.trim() ||
    `/timeout action by ${interaction.user.tag}`;
  await runModAction(
    interaction,
    {
      action: "timeout",
      guildId,
      userId: user.id,
      reason,
      durationSeconds,
      dmMode: "none",
    },
    ephemeral,
  );
}

export async function handleUntimeoutCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  const guildId = await requireGuild(interaction, ephemeral);
  if (!guildId) return;
  const user = interaction.options.getUser("usuario", true);
  const reason =
    interaction.options.getString("razon")?.trim() ||
    `/untimeout action by ${interaction.user.tag}`;
  await runModAction(
    interaction,
    {
      action: "untimeout",
      guildId,
      userId: user.id,
      reason,
      dmMode: "none",
    },
    ephemeral,
  );
}

export async function handleWarnCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  const guildId = await requireGuild(interaction, ephemeral);
  if (!guildId) return;
  const user = interaction.options.getUser("usuario", true);
  const reason = interaction.options.getString("razon", true).trim();
  await runModAction(
    interaction,
    {
      action: "warn",
      guildId,
      userId: user.id,
      reason,
      dmMode: "none",
    },
    ephemeral,
  );
}

export async function handleWarnsCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  const guildId = await requireGuild(interaction, ephemeral);
  if (!guildId) return;
  const user = interaction.options.getUser("usuario", true);
  await interaction.deferReply(
    ephemeral ? { flags: MessageFlags.Ephemeral } : {},
  );
  try {
    const info = await getMemberInfo(interaction.client, user.id, guildId);
    if (info.warnings.length === 0) {
      await interaction.editReply({
        content: `${info.displayName} has no warnings.`,
      });
      return;
    }
    const lines = info.warnings.slice(0, 20).map((warn, index) => {
      const ts = Math.floor(new Date(warn.createdAt).getTime() / 1000);
      return `${index + 1}. ${warn.reason} (<t:${ts}:R>)`;
    });
    const extra =
      info.warnings.length > 20
        ? `\n…and ${info.warnings.length - 20} more.`
        : "";
    await interaction.editReply({
      content: `Warnings for ${info.displayName} (${info.warnings.length}):\n${lines.join("\n")}${extra}`,
    });
  } catch (error) {
    const message =
      error instanceof ModerationError
        ? error.message
        : "Couldn't load the record.";
    await replyOnce(interaction, message, ephemeral);
  }
}

export async function handleClearWarnsCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  const guildId = await requireGuild(interaction, ephemeral);
  if (!guildId) return;
  const user = interaction.options.getUser("usuario", true);
  await runModAction(
    interaction,
    {
      action: "clearwarns",
      guildId,
      userId: user.id,
      reason: `/clearwarns action by ${interaction.user.tag}`,
    },
    ephemeral,
  );
}

export async function handlePurgeCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  const guildId = await requireGuild(interaction, ephemeral);
  if (!guildId) return;
  const channelId = interaction.channelId;
  if (!channelId) {
    await replyOnce(interaction, "There's no text channel here.", ephemeral);
    return;
  }
  const user = interaction.options.getUser("usuario");
  await runModAction(
    interaction,
    {
      action: "purge",
      guildId,
      channelId,
      userId: user?.id,
      reason: `/purge action by ${interaction.user.tag}`,
      purgeLimit: interaction.options.getInteger("cantidad", true),
    },
    ephemeral,
  );
}

export async function handleSlowmodeCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  const guildId = await requireGuild(interaction, ephemeral);
  if (!guildId) return;
  const channelId = resolveChannelId(interaction);
  if (!channelId) {
    await replyOnce(interaction, "Specify a text channel.", ephemeral);
    return;
  }
  await runModAction(
    interaction,
    {
      action: "slowmode",
      guildId,
      channelId,
      reason: `/slowmode action by ${interaction.user.tag}`,
      slowmodeSeconds: interaction.options.getInteger("segundos", true),
    },
    ephemeral,
  );
}

export async function handleLockCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  const guildId = await requireGuild(interaction, ephemeral);
  if (!guildId) return;
  const channelId = resolveChannelId(interaction);
  if (!channelId) {
    await replyOnce(interaction, "Specify a text channel.", ephemeral);
    return;
  }
  await runModAction(
    interaction,
    {
      action: "lock",
      guildId,
      channelId,
      reason: `/lock action by ${interaction.user.tag}`,
    },
    ephemeral,
  );
}

export async function handleUnlockCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  const guildId = await requireGuild(interaction, ephemeral);
  if (!guildId) return;
  const channelId = resolveChannelId(interaction);
  if (!channelId) {
    await replyOnce(interaction, "Specify a text channel.", ephemeral);
    return;
  }
  await runModAction(
    interaction,
    {
      action: "unlock",
      guildId,
      channelId,
      reason: `/unlock action by ${interaction.user.tag}`,
    },
    ephemeral,
  );
}
