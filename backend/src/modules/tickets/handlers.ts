import {
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type GuildMember,
  type ModalSubmitInteraction,
  type TextChannel,
} from "discord.js";
import {
  TICKET_ADD_MODAL_PREFIX,
  TICKET_ADD_PREFIX,
  TICKET_CLAIM_PREFIX,
  TICKET_CLOSE_PREFIX,
  TICKET_OPEN_PREFIX,
  TICKET_REASON_PREFIX,
  TICKET_REMOVE_MODAL_PREFIX,
  TICKET_REMOVE_PREFIX,
  TICKET_UNCLAIM_PREFIX,
  TICKET_UNWAIT_PREFIX,
  TICKET_WAIT_PREFIX,
  canCloseTicket,
  isTicketStaff,
  normalizeTicketCloseReason,
  parseTicketOpenCustomId,
  parseTicketRecordId,
  parseTicketUserMention,
} from "@adobos/shared";
import { TicketsError, getTicketById, getTicketPanel, getTicketSettings } from "./service.js";
import {
  addUserToTicket,
  claimTicket,
  closeTicket,
  onTicketChannelDeleted,
  onTicketChannelMessage,
  openTicket,
  removeUserFromTicket,
  unclaimTicket,
  unwaitTicket,
  waitTicket,
} from "./actions.js";

const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const;

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

function memberRoleIds(member: GuildMember | null): string[] {
  if (!member) return [];
  return [...member.roles.cache.keys()];
}

async function staffOrReject(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  guildId: string,
): Promise<GuildMember | null> {
  const member = asGuildMember(interaction.member);
  if (!member) {
    await reject(interaction, "No pude leer tus roles.");
    return null;
  }
  const settings = await getTicketSettings(guildId);
  const ok = isTicketStaff({
    memberRoleIds: memberRoleIds(member),
    staffRoleIds: settings.staffRoleIds,
    manageGuild: member.permissions.has(PermissionFlagsBits.ManageGuild),
  });
  if (!ok) {
    await reject(interaction, "Solo el staff de tickets puede hacer eso.");
    return null;
  }
  return member;
}

function mapError(error: unknown): string {
  if (error instanceof TicketsError) return error.message;
  return "Ocurrió un error al procesar el ticket.";
}

function reasonModal(ticketId: number): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId("reason")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500)
    .setPlaceholder("Motivo de cierre");
  return new ModalBuilder()
    .setCustomId(`${TICKET_REASON_PREFIX}${ticketId}`.slice(0, 100))
    .setTitle("Cerrar ticket")
    .addLabelComponents(
      new LabelBuilder().setLabel("Motivo").setTextInputComponent(input),
    );
}

function userModal(ticketId: number, kind: "add" | "remove"): ModalBuilder {
  const prefix =
    kind === "add" ? TICKET_ADD_MODAL_PREFIX : TICKET_REMOVE_MODAL_PREFIX;
  const input = new TextInputBuilder()
    .setCustomId("user")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(40)
    .setPlaceholder("ID o @mención");
  return new ModalBuilder()
    .setCustomId(`${prefix}${ticketId}`.slice(0, 100))
    .setTitle(kind === "add" ? "Añadir usuario" : "Quitar usuario")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Usuario")
        .setTextInputComponent(input),
    );
}

export async function onTicketOpenButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.guild || !interaction.customId.startsWith(TICKET_OPEN_PREFIX)) {
    return;
  }
  const parsed = parseTicketOpenCustomId(interaction.customId);
  if (!parsed) {
    await reject(interaction, "Este panel ya no es válido. Vuelve a publicarlo.");
    return;
  }
  const panel = await getTicketPanel(parsed.panelId).catch(() => null);
  if (!panel || panel.guildId !== interaction.guildId) {
    await reject(interaction, "Este panel ya no existe.");
    return;
  }
  const typeOk = panel.buttons.some((btn) => btn.typeKey === parsed.typeKey);
  if (!typeOk) {
    await reject(interaction, "Este tipo de ticket ya no está en el panel.");
    return;
  }
  const member = asGuildMember(interaction.member);
  if (!member) {
    await reject(interaction, "No pude leerte como miembro del servidor.");
    return;
  }
  await interaction.deferReply(EPHEMERAL);
  try {
    const ticket = await openTicket({
      guild: interaction.guild,
      opener: member,
      typeKey: parsed.typeKey,
    });
    await interaction.editReply({
      content: ticket.channelId
        ? `Ticket #${ticket.number} creado: <#${ticket.channelId}>`
        : `Ticket #${ticket.number} creado.`,
    });
  } catch (error: unknown) {
    await interaction.editReply({ content: mapError(error) });
  }
}

export async function onTicketClaimButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.guild) return;
  const ticketId = parseTicketRecordId(interaction.customId, TICKET_CLAIM_PREFIX);
  if (ticketId == null) return;
  const member = await staffOrReject(interaction, interaction.guild.id);
  if (!member) return;
  await interaction.deferReply(EPHEMERAL);
  try {
    const ticket = await claimTicket({
      guild: interaction.guild,
      ticketId,
      actor: member,
    });
    await interaction.editReply({
      content: `Ticket #${ticket.number} reclamado.`,
    });
  } catch (error: unknown) {
    await interaction.editReply({ content: mapError(error) });
  }
}

export async function onTicketUnclaimButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.guild) return;
  const ticketId = parseTicketRecordId(
    interaction.customId,
    TICKET_UNCLAIM_PREFIX,
  );
  if (ticketId == null) return;
  const member = await staffOrReject(interaction, interaction.guild.id);
  if (!member) return;
  await interaction.deferReply(EPHEMERAL);
  try {
    const ticket = await unclaimTicket({
      guild: interaction.guild,
      ticketId,
      actorId: member.id,
    });
    await interaction.editReply({
      content: `Ticket #${ticket.number} liberado.`,
    });
  } catch (error: unknown) {
    await interaction.editReply({ content: mapError(error) });
  }
}

export async function onTicketWaitButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.guild) return;
  const ticketId = parseTicketRecordId(interaction.customId, TICKET_WAIT_PREFIX);
  if (ticketId == null) return;
  const member = await staffOrReject(interaction, interaction.guild.id);
  if (!member) return;
  await interaction.deferReply(EPHEMERAL);
  try {
    await waitTicket({
      guild: interaction.guild,
      ticketId,
      actorId: member.id,
    });
    await interaction.editReply({ content: "Esperando respuesta del usuario." });
  } catch (error: unknown) {
    await interaction.editReply({ content: mapError(error) });
  }
}

export async function onTicketUnwaitButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.guild) return;
  const ticketId = parseTicketRecordId(interaction.customId, TICKET_UNWAIT_PREFIX);
  if (ticketId == null) return;
  const member = await staffOrReject(interaction, interaction.guild.id);
  if (!member) return;
  await interaction.deferReply(EPHEMERAL);
  try {
    await unwaitTicket({
      guild: interaction.guild,
      ticketId,
      actorId: member.id,
    });
    await interaction.editReply({ content: "El ticket vuelve a reclamado." });
  } catch (error: unknown) {
    await interaction.editReply({ content: mapError(error) });
  }
}

export async function onTicketCloseButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.guild) return;
  const ticketId = parseTicketRecordId(interaction.customId, TICKET_CLOSE_PREFIX);
  if (ticketId == null) return;
  const member = asGuildMember(interaction.member);
  if (!member) {
    await reject(interaction, "No pude leerte como miembro.");
    return;
  }
  const [ticket, settings] = await Promise.all([
    getTicketById(ticketId, interaction.guild.id),
    getTicketSettings(interaction.guild.id),
  ]);
  const staff = isTicketStaff({
    memberRoleIds: memberRoleIds(member),
    staffRoleIds: settings.staffRoleIds,
    manageGuild: member.permissions.has(PermissionFlagsBits.ManageGuild),
  });
  if (
    !canCloseTicket({
      status: ticket.status,
      actorId: member.id,
      openerId: ticket.openerId,
      openerCanClose: settings.openerCanClose,
      isStaff: staff,
    })
  ) {
    await reject(interaction, "No puedes cerrar este ticket.");
    return;
  }
  await interaction.showModal(reasonModal(ticketId));
}

export async function onTicketAddButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.guild) return;
  const ticketId = parseTicketRecordId(interaction.customId, TICKET_ADD_PREFIX);
  if (ticketId == null) return;
  if (!(await staffOrReject(interaction, interaction.guild.id))) return;
  await interaction.showModal(userModal(ticketId, "add"));
}

export async function onTicketRemoveButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.guild) return;
  const ticketId = parseTicketRecordId(
    interaction.customId,
    TICKET_REMOVE_PREFIX,
  );
  if (ticketId == null) return;
  if (!(await staffOrReject(interaction, interaction.guild.id))) return;
  await interaction.showModal(userModal(ticketId, "remove"));
}

export async function onTicketReasonModal(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.guild) return;
  const ticketId = parseTicketRecordId(
    interaction.customId,
    TICKET_REASON_PREFIX,
  );
  if (ticketId == null) return;
  const reason = normalizeTicketCloseReason(
    interaction.fields.getTextInputValue("reason"),
  );
  if (!reason) {
    await reject(interaction, "El motivo de cierre es obligatorio.");
    return;
  }
  const member = asGuildMember(interaction.member);
  if (!member) {
    await reject(interaction, "No pude leerte como miembro.");
    return;
  }
  await interaction.deferReply(EPHEMERAL);
  try {
    const ticket = await closeTicket({
      guild: interaction.guild,
      ticketId,
      actorId: member.id,
      reason,
    });
    await interaction.editReply({
      content: `Ticket #${ticket.number} cerrado.`,
    });
  } catch (error: unknown) {
    await interaction.editReply({ content: mapError(error) });
  }
}

export async function onTicketAddModal(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.guild) return;
  const ticketId = parseTicketRecordId(
    interaction.customId,
    TICKET_ADD_MODAL_PREFIX,
  );
  if (ticketId == null) return;
  const member = await staffOrReject(interaction, interaction.guild.id);
  if (!member) return;
  const userId = parseTicketUserMention(
    interaction.fields.getTextInputValue("user"),
  );
  if (!userId) {
    await reject(interaction, "Indica un ID o una mención válida.");
    return;
  }
  await interaction.deferReply(EPHEMERAL);
  try {
    await addUserToTicket({
      guild: interaction.guild,
      ticketId,
      actorId: member.id,
      userId,
    });
    await interaction.editReply({ content: `<@${userId}> añadido al ticket.` });
  } catch (error: unknown) {
    await interaction.editReply({ content: mapError(error) });
  }
}

export async function onTicketRemoveModal(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.guild) return;
  const ticketId = parseTicketRecordId(
    interaction.customId,
    TICKET_REMOVE_MODAL_PREFIX,
  );
  if (ticketId == null) return;
  const member = await staffOrReject(interaction, interaction.guild.id);
  if (!member) return;
  const userId = parseTicketUserMention(
    interaction.fields.getTextInputValue("user"),
  );
  if (!userId) {
    await reject(interaction, "Indica un ID o una mención válida.");
    return;
  }
  await interaction.deferReply(EPHEMERAL);
  try {
    await removeUserFromTicket({
      guild: interaction.guild,
      ticketId,
      actorId: member.id,
      userId,
    });
    await interaction.editReply({ content: `<@${userId}> quitado del ticket.` });
  } catch (error: unknown) {
    await interaction.editReply({ content: mapError(error) });
  }
}

export async function onTicketsChannelDelete(
  channelId: string,
): Promise<void> {
  await onTicketChannelDeleted(channelId);
}

export async function onTicketsMessageCreate(input: {
  channel: TextChannel;
  authorId: string;
  bot: boolean;
}): Promise<void> {
  await onTicketChannelMessage(input);
}
