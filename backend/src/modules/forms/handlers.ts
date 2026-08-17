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
} from "@adobos/shared";
import { getFormsConfigCached } from "./service.js";

function embedColorInt(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(n) ? n : 0x5865f2;
}

export async function onFormsOpenButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.customId.startsWith(FORM_OPEN_PREFIX)) {
    return;
  }

  const guildId = interaction.customId.slice(FORM_OPEN_PREFIX.length);
  if (guildId !== interaction.guildId) {
    await interaction.reply({
      content: "Este formulario no pertenece a este servidor.",
      ephemeral: true,
    });
    return;
  }

  const config = getFormsConfigCached(guildId);
  if (config.questions.length === 0) {
    await interaction.reply({
      content: "Este formulario aún no tiene preguntas configuradas.",
      ephemeral: true,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`${FORM_SUBMIT_PREFIX}${guildId}`.slice(0, 100))
    .setTitle(config.modalTitle.slice(0, 45));

  for (const question of config.questions.slice(0, 5)) {
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

  const guildId = interaction.customId.slice(FORM_SUBMIT_PREFIX.length);
  if (guildId !== interaction.guildId) {
    await interaction.reply({
      content: "Este formulario no pertenece a este servidor.",
      ephemeral: true,
    });
    return;
  }

  const config = getFormsConfigCached(guildId);
  if (!config.receptionChannelId) {
    await interaction.reply({
      content:
        "El formulario no tiene canal de recepción configurado. Avisa a un administrador.",
      ephemeral: true,
    });
    return;
  }

  const fields: { name: string; value: string }[] = [];
  for (const question of config.questions) {
    const customId = `${FORM_QUESTION_PREFIX}${question.id}`;
    let value = "";
    try {
      value = interaction.fields.getTextInputValue(customId);
    } catch {
      value = "—";
    }
    fields.push({
      name: question.label.slice(0, 256),
      value: (value.trim() || "—").slice(0, 1024),
    });
  }

  const channel = await bot.channels
    .fetch(config.receptionChannelId)
    .catch(() => null);
  if (
    !channel ||
    !channel.isTextBased() ||
    (channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement)
  ) {
    await interaction.reply({
      content: "No se pudo enviar la respuesta al canal de recepción.",
      ephemeral: true,
    });
    return;
  }

  const member = interaction.member;
  const displayName =
    member && "displayName" in member
      ? String(member.displayName)
      : interaction.user.globalName || interaction.user.username;

  const embed = new EmbedBuilder()
    .setColor(embedColorInt(config.embedColor))
    .setTitle("Nueva Respuesta de Formulario")
    .setDescription(
      `**Usuario:** ${displayName} (@${interaction.user.username})\n**ID:** \`${interaction.user.id}\``,
    )
    .setThumbnail(interaction.user.displayAvatarURL({ size: 128, extension: "png", forceStatic: true }))
    .setTimestamp(new Date())
    .setFooter({ text: config.modalTitle.slice(0, 100) });

  for (const field of fields) {
    embed.addFields({ name: field.name, value: field.value });
  }

  if ("send" in channel) {
    await channel.send({ embeds: [embed] }).catch(() => null);
  }

  await interaction.reply({
    content: "¡Formulario enviado con éxito!",
    ephemeral: true,
  });
}
