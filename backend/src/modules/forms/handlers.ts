import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  FileUploadBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Client,
  type GuildMember,
  type ModalSubmitInteraction,
  type TextBasedChannel,
} from "discord.js";
import {
  FORM_ACCEPT_PREFIX,
  FORM_DENY_PREFIX,
  FORM_OPEN_PREFIX,
  FORM_QUESTION_PREFIX,
  FORM_SUBMIT_PREFIX,
  formMemberGateReason,
  parseFormNumericId,
  type FormAnswerEntry,
  type FormQuestion,
  type InteractiveForm,
} from "@adobos/shared";
import {
  FormsError,
  getFormById,
  getFormResponseById,
  getUserCooldownRemainingMs,
  insertFormResponse,
  reviewFormResponse,
} from "./service.js";

const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const;

function embedColorInt(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(n) ? n : 0x5865f2;
}

function formatCooldown(ms: number): string {
  if (!Number.isFinite(ms) || ms === Number.POSITIVE_INFINITY) {
    return "you already submitted this form";
  }
  const totalSec = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes <= 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes} min`;
  return `${minutes} min ${seconds}s`;
}

function memberRoleIds(member: GuildMember | null): string[] {
  if (!member) return [];
  return [...member.roles.cache.keys()];
}

function asGuildMember(
  member: ButtonInteraction["member"] | ModalSubmitInteraction["member"],
): GuildMember | null {
  if (member && "roles" in member && member.roles && "cache" in member.roles) {
    return member as GuildMember;
  }
  return null;
}

async function reject(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  content: string,
): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content, ...EPHEMERAL });
    return;
  }
  await interaction.reply({ content, ...EPHEMERAL });
}

function questionCustomId(question: FormQuestion): string {
  return `${FORM_QUESTION_PREFIX}${question.id}`.slice(0, 100);
}

function buildQuestionLabel(question: FormQuestion): LabelBuilder {
  const customId = questionCustomId(question);
  const label = new LabelBuilder().setLabel(question.label.slice(0, 45));
  if (question.style === "STRING_SELECT") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setRequired(question.required)
      .setMinValues(question.required ? 1 : 0)
      .setMaxValues(1)
      .addOptions(
        question.options.slice(0, 25).map((opt) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(opt.label.slice(0, 100))
            .setValue(opt.value.slice(0, 100)),
        ),
      );
    label.setStringSelectMenuComponent(menu);
    return label;
  }
  if (question.style === "FILE_UPLOAD") {
    const upload = new FileUploadBuilder()
      .setCustomId(customId)
      .setRequired(question.required)
      .setMinValues(question.required ? 1 : 0)
      .setMaxValues(1);
    label.setFileUploadComponent(upload);
    return label;
  }
  const input = new TextInputBuilder()
    .setCustomId(customId)
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
  label.setTextInputComponent(input);
  return label;
}

function readAnswerValue(
  interaction: ModalSubmitInteraction,
  question: FormQuestion,
): string {
  const customId = questionCustomId(question);
  const fields = interaction.fields;
  if (question.style === "STRING_SELECT") {
    try {
      const values = fields.getStringSelectValues(customId);
      return values.join(", ");
    } catch {
      return "";
    }
  }
  if (question.style === "FILE_UPLOAD") {
    try {
      const files = fields.getUploadedFiles(customId);
      if (!files || files.size === 0) return "";
      return [...files.values()]
        .map((file) => file.url)
        .filter(Boolean)
        .join("\n");
    } catch {
      return "";
    }
  }
  try {
    return fields.getTextInputValue(customId);
  } catch {
    return "";
  }
}

async function assertCanSubmit(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  form: InteractiveForm,
): Promise<boolean> {
  if (!form.enabled) {
    await reject(interaction, "This form is closed.");
    return false;
  }
  const gate = formMemberGateReason({
    memberRoleIds: memberRoleIds(asGuildMember(interaction.member)),
    requiredRoleIds: form.requiredRoleIds,
    blockedRoleIds: form.blockedRoleIds,
  });
  if (gate) {
    await reject(interaction, gate);
    return false;
  }
  const remaining = await getUserCooldownRemainingMs(
    form.id,
    interaction.user.id,
    form.cooldownMinutes,
    form.submitMode,
  );
  if (remaining > 0) {
    await reject(
      interaction,
      form.submitMode === "once"
        ? "You already submitted this form."
        : `You must wait **${formatCooldown(remaining)}** before submitting this form again.`,
    );
    return false;
  }
  return true;
}

export async function onFormsOpenButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.customId.startsWith(FORM_OPEN_PREFIX)) {
    return;
  }

  const formId = parseFormNumericId(interaction.customId, FORM_OPEN_PREFIX);
  if (formId == null) {
    await reject(
      interaction,
      "This form is no longer active. An administrator must publish it again from the panel.",
    );
    return;
  }

  const form = await getFormById(formId);
  if (!form || form.guildId !== interaction.guildId) {
    await reject(interaction, "This form is inactive or was deleted.");
    return;
  }

  if (form.questions.length === 0) {
    await reject(
      interaction,
      "This form has no questions configured yet.",
    );
    return;
  }

  const selectMissingOptions = form.questions.some(
    (q) => q.style === "STRING_SELECT" && q.options.length === 0,
  );
  if (selectMissingOptions) {
    await reject(
      interaction,
      "This form has a dropdown with no options. Let an administrator know.",
    );
    return;
  }

  if (!(await assertCanSubmit(interaction, form))) return;

  const builder = new ModalBuilder()
    .setCustomId(`${FORM_SUBMIT_PREFIX}${form.id}`.slice(0, 100))
    .setTitle(form.modalTitle.slice(0, 45));

  for (const question of form.questions.slice(0, 5)) {
    builder.addLabelComponents(buildQuestionLabel(question));
  }

  await interaction.showModal(builder);
}

function isSendableTextChannel(
  channel: unknown,
): channel is TextBasedChannel & { send: (...args: unknown[]) => Promise<unknown> } {
  if (!channel || typeof channel !== "object") return false;
  if (!("isTextBased" in channel)) return false;
  const typed = channel as {
    isTextBased: () => boolean;
    type: ChannelType;
    send?: unknown;
  };
  return (
    typed.isTextBased() &&
    (typed.type === ChannelType.GuildText ||
      typed.type === ChannelType.GuildAnnouncement) &&
    typeof typed.send === "function"
  );
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

  const formId = parseFormNumericId(interaction.customId, FORM_SUBMIT_PREFIX);
  if (formId == null) {
    await reject(interaction, "Invalid form.");
    return;
  }

  const form = await getFormById(formId);
  if (!form || form.guildId !== interaction.guildId) {
    await reject(interaction, "This form is inactive or was deleted.");
    return;
  }

  if (!(await assertCanSubmit(interaction, form))) return;

  if (!form.receptionChannelId) {
    await reject(
      interaction,
      "The form has no reception channel configured. Let an administrator know.",
    );
    return;
  }

  const answers: FormAnswerEntry[] = [];
  for (const question of form.questions) {
    const value = readAnswerValue(interaction, question).trim();
    if (question.required && !value) {
      await reject(
        interaction,
        `The answer for «${question.label}» is missing.`,
      );
      return;
    }
    answers.push({
      questionId: question.id,
      label: question.label.slice(0, 256),
      value: (value || "—").slice(0, 1024),
    });
  }

  const member = asGuildMember(interaction.member);
  const displayName =
    member?.displayName ||
    interaction.user.globalName ||
    interaction.user.username;
  const avatarUrl = interaction.user.displayAvatarURL({
    size: 128,
    extension: "png",
    forceStatic: true,
  });

  let saved;
  try {
    saved = await insertFormResponse({
      formId: form.id,
      guildId: form.guildId,
      userId: interaction.user.id,
      username: interaction.user.username,
      displayName,
      avatarUrl,
      answers,
      submitMode: form.submitMode,
      cooldownMinutes: form.cooldownMinutes,
    });
  } catch (error) {
    if (error instanceof FormsError && error.code === "COOLDOWN") {
      await reject(
        interaction,
        form.submitMode === "once"
          ? "You already submitted this form."
          : "You must wait before submitting this form again.",
      );
      return;
    }
    throw error;
  }

  const channel = await bot.channels
    .fetch(form.receptionChannelId)
    .catch(() => null);

  if (!isSendableTextChannel(channel)) {
    await reject(
      interaction,
      "Your response was saved in the panel, but the reception channel is not valid. Let an administrator know.",
    );
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(embedColorInt(form.embedColor))
    .setTitle("New Forms response")
    .setDescription(
      `**User:** ${displayName} (@${interaction.user.username})\n**ID:** \`${interaction.user.id}\``,
    )
    .setThumbnail(avatarUrl)
    .setTimestamp(new Date())
    .setFooter({ text: form.modalTitle.slice(0, 100) });

  for (const answer of answers) {
    embed.addFields({
      name: answer.label.slice(0, 256),
      value: answer.value.slice(0, 1024) || "—",
    });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${FORM_ACCEPT_PREFIX}${saved.id}`.slice(0, 100))
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${FORM_DENY_PREFIX}${saved.id}`.slice(0, 100))
      .setLabel("Reject")
      .setStyle(ButtonStyle.Danger),
  );

  const ping = form.pingRoleId ? `<@&${form.pingRoleId}>` : null;
  const sent = await channel
    .send({
      content: ping ?? undefined,
      embeds: [embed],
      components: [row],
      allowedMentions: form.pingRoleId
        ? { roles: [form.pingRoleId] }
        : { parse: [] },
    })
    .catch(() => null);

  if (!sent) {
    await reject(
      interaction,
      "Your response was saved in the panel, but the reception channel couldn't be notified.",
    );
    return;
  }

  await interaction.reply({
    content: form.thankYouMessage,
    ...EPHEMERAL,
  });
}

function canReview(member: GuildMember | null): boolean {
  if (!member) return false;
  return member.permissions.has(
    PermissionFlagsBits.ManageGuild |
      PermissionFlagsBits.ManageRoles |
      PermissionFlagsBits.Administrator,
  );
}

export async function onFormsReviewButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const accept = interaction.customId.startsWith(FORM_ACCEPT_PREFIX);
  const prefix = accept ? FORM_ACCEPT_PREFIX : FORM_DENY_PREFIX;
  if (!interaction.guildId || (!accept && !interaction.customId.startsWith(FORM_DENY_PREFIX))) {
    return;
  }
  const responseId = parseFormNumericId(interaction.customId, prefix);
  if (responseId == null) {
    await reject(interaction, "Invalid response.");
    return;
  }

  const member = asGuildMember(interaction.member);
  if (!canReview(member)) {
    await reject(
      interaction,
      "You need the Manage Server or Manage Roles permission to review.",
    );
    return;
  }

  const response = await getFormResponseById(responseId);
  if (!response || response.guildId !== interaction.guildId) {
    await reject(interaction, "This response no longer exists.");
    return;
  }

  const form = await getFormById(response.formId);
  if (!form || form.guildId !== interaction.guildId) {
    await reject(interaction, "The form no longer exists.");
    return;
  }

  let reviewed;
  try {
    reviewed = await reviewFormResponse({
      responseId,
      guildId: interaction.guildId,
      status: accept ? "accepted" : "rejected",
      reviewerId: interaction.user.id,
    });
  } catch (error) {
    if (error instanceof FormsError) {
      await reject(interaction, error.message);
      return;
    }
    throw error;
  }

  if (accept && form.acceptRoleId && interaction.guild) {
    const target = await interaction.guild.members
      .fetch(response.userId)
      .catch(() => null);
    if (target) {
      await target.roles
        .add(form.acceptRoleId, `Forms accept by ${interaction.user.id}`)
        .catch(() => undefined);
    }
  }

  const color = accept ? 0x57f287 : 0xed4245;
  const statusLabel = accept ? "Accepted" : "Rejected";
  const original = EmbedBuilder.from(interaction.message.embeds[0] ?? {});
  original.setColor(color);
  original.setFooter({
    text: `${form.modalTitle.slice(0, 60)} · ${statusLabel} by ${interaction.user.username}`,
  });

  const disabled = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${FORM_ACCEPT_PREFIX}${reviewed.id}`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${FORM_DENY_PREFIX}${reviewed.id}`)
      .setLabel("Reject")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true),
  );

  await interaction.update({
    embeds: [original],
    components: [disabled],
  });
}
