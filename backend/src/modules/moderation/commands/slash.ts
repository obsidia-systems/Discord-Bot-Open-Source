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
    "Este comando solo funciona en un servidor.",
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
        : "No se pudo ejecutar la acción de moderación.";
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
    `Acción /ban por ${interaction.user.tag}`;
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
    `Acción /kick por ${interaction.user.tag}`;
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
      "Duración inválida. Usa formatos como `10m`, `1h` o `24h` (máx. 28 días).",
      ephemeral,
    );
    return;
  }
  const user = interaction.options.getUser("usuario", true);
  const reason =
    interaction.options.getString("razon")?.trim() ||
    `Acción /timeout por ${interaction.user.tag}`;
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
    `Acción /untimeout por ${interaction.user.tag}`;
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
        content: `${info.displayName} no tiene advertencias.`,
      });
      return;
    }
    const lines = info.warnings.slice(0, 20).map((warn, index) => {
      const ts = Math.floor(new Date(warn.createdAt).getTime() / 1000);
      return `${index + 1}. ${warn.reason} (<t:${ts}:R>)`;
    });
    const extra =
      info.warnings.length > 20
        ? `\n…y ${info.warnings.length - 20} más.`
        : "";
    await interaction.editReply({
      content: `Advertencias de ${info.displayName} (${info.warnings.length}):\n${lines.join("\n")}${extra}`,
    });
  } catch (error) {
    const message =
      error instanceof ModerationError
        ? error.message
        : "No se pudo cargar el expediente.";
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
      reason: `Acción /clearwarns por ${interaction.user.tag}`,
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
    await replyOnce(interaction, "No hay un canal de texto aquí.", ephemeral);
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
      reason: `Acción /purge por ${interaction.user.tag}`,
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
    await replyOnce(interaction, "Indica un canal de texto.", ephemeral);
    return;
  }
  await runModAction(
    interaction,
    {
      action: "slowmode",
      guildId,
      channelId,
      reason: `Acción /slowmode por ${interaction.user.tag}`,
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
    await replyOnce(interaction, "Indica un canal de texto.", ephemeral);
    return;
  }
  await runModAction(
    interaction,
    {
      action: "lock",
      guildId,
      channelId,
      reason: `Acción /lock por ${interaction.user.tag}`,
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
    await replyOnce(interaction, "Indica un canal de texto.", ephemeral);
    return;
  }
  await runModAction(
    interaction,
    {
      action: "unlock",
      guildId,
      channelId,
      reason: `Acción /unlock por ${interaction.user.tag}`,
    },
    ephemeral,
  );
}
