import {
  ActionRowBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Client,
  type ModalSubmitInteraction,
} from "discord.js";
import {
  FORM_OPEN_PREFIX,
  FORM_QUESTION_PREFIX,
  FORM_SUBMIT_PREFIX,
  type FormAnswerEntry,
} from "@adobos/shared";
import {
  getFormById,
  getUserCooldownRemainingMs,
  insertFormResponse,
} from "./service.js";

function embedColorInt(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(n) ? n : 0x5865f2;
}

function parseFormId(customId: string, prefix: string): number | null {
  if (!customId.startsWith(prefix)) return null;
  const raw = customId.slice(prefix.length);
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id) || id < 1) return null;
  return id;
}

function formatCooldown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes <= 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes} min`;
  return `${minutes} min ${seconds}s`;
}

export async function onFormsOpenButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.customId.startsWith(FORM_OPEN_PREFIX)) {
    return;
  }

  const formId = parseFormId(interaction.customId, FORM_OPEN_PREFIX);
  if (formId == null) {
    // Compat: botones legacy `form_open_<guildId>` (snowflake)
    await interaction.reply({
      content:
        "Este formulario ya no está activo. Un administrador debe volver a publicarlo desde el panel.",
      ephemeral: true,
    });
    return;
  }

  const form = getFormById(formId);
  if (!form || form.guildId !== interaction.guildId) {
    await interaction.reply({
      content: "Este formulario está inactivo o fue eliminado.",
      ephemeral: true,
    });
    return;
  }

  if (form.questions.length === 0) {
    await interaction.reply({
      content: "Este formulario aún no tiene preguntas configuradas.",
      ephemeral: true,
    });
    return;
  }

  const remaining = getUserCooldownRemainingMs(
    form.id,
    interaction.user.id,
    form.cooldownMinutes,
  );
  if (remaining > 0) {
    await interaction.reply({
      content: `Debes esperar **${formatCooldown(remaining)}** antes de volver a enviar este formulario.`,
      ephemeral: true,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`${FORM_SUBMIT_PREFIX}${form.id}`.slice(0, 100))
    .setTitle(form.modalTitle.slice(0, 45));

  for (const question of form.questions.slice(0, 5)) {
    const input = new TextInputBuilder()
      .setCustomId(`${FORM_QUESTION_PREFIX}${question.id}`.slice(0, 100))
      .setLabel(question.label.slice(0, 45))
      .setStyle(
        question.style === "PARAGRAPH"
          ? TextInputStyle.Paragraph
          : TextInputStyle.Short,
      )
      .setRequired(question.required)
      .setMaxLength(question.style === "PARAGRAPH" ? 1000 : 256);

    if (question.placeholder?.trim()) {
      input.setPlaceholder(question.placeholder.trim().slice(0, 100));
    }

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input),
    );
  }

  await interaction.showModal(modal);
}

export async function onFormsModalSubmit(
  interaction: ModalSubmitInteraction,
  bot: Client,
): Promise<void> {
  if (
    !interaction.guildId ||
    !interaction.customId.startsWith(FORM_SUBMIT_PREFIX)
  ) {
    return;
  }

  const formId = parseFormId(interaction.customId, FORM_SUBMIT_PREFIX);
  if (formId == null) {
    await interaction.reply({
      content: "Formulario inválido.",
      ephemeral: true,
    });
    return;
  }

  const form = getFormById(formId);
  if (!form || form.guildId !== interaction.guildId) {
    await interaction.reply({
      content: "Este formulario está inactivo o fue eliminado.",
      ephemeral: true,
    });
    return;
  }

  const remaining = getUserCooldownRemainingMs(
    form.id,
    interaction.user.id,
    form.cooldownMinutes,
  );
  if (remaining > 0) {
    await interaction.reply({
      content: `Debes esperar **${formatCooldown(remaining)}** antes de volver a enviar este formulario.`,
      ephemeral: true,
    });
    return;
  }

  if (!form.receptionChannelId) {
    await interaction.reply({
      content:
        "El formulario no tiene canal de recepción configurado. Avisa a un administrador.",
      ephemeral: true,
    });
    return;
  }

  const answers: FormAnswerEntry[] = [];
  for (const question of form.questions) {
    const customId = `${FORM_QUESTION_PREFIX}${question.id}`;
    let value = "";
    try {
      value = interaction.fields.getTextInputValue(customId);
    } catch {
      value = "";
    }
    answers.push({
      questionId: question.id,
      label: question.label.slice(0, 256),
      value: (value.trim() || "—").slice(0, 1024),
    });
  }

  const member = interaction.member;
  const displayName =
    member && "displayName" in member
      ? String(member.displayName)
      : interaction.user.globalName || interaction.user.username;
  const avatarUrl = interaction.user.displayAvatarURL({
    size: 128,
    extension: "png",
    forceStatic: true,
  });

  insertFormResponse({
    formId: form.id,
    guildId: form.guildId,
    userId: interaction.user.id,
    username: interaction.user.username,
    displayName,
    avatarUrl,
    answers,
  });

  const channel = await bot.channels
    .fetch(form.receptionChannelId)
    .catch(() => null);
  if (
    channel &&
    channel.isTextBased() &&
    (channel.type === ChannelType.GuildText ||
      channel.type === ChannelType.GuildAnnouncement) &&
    "send" in channel
  ) {
    const embed = new EmbedBuilder()
      .setColor(embedColorInt(form.embedColor))
      .setTitle("Nueva Respuesta de Formulario")
      .setDescription(
        `**Usuario:** ${displayName} (@${interaction.user.username})\n**ID:** \`${interaction.user.id}\``,
      )
      .setThumbnail(avatarUrl)
      .setTimestamp(new Date())
      .setFooter({ text: form.modalTitle.slice(0, 100) });

    for (const answer of answers) {
      embed.addFields({ name: answer.label, value: answer.value });
    }

    await channel.send({ embeds: [embed] }).catch(() => null);
  }

  await interaction.reply({
    content: "¡Formulario enviado con éxito!",
    ephemeral: true,
  });
}
