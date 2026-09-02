import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  OverwriteType,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildMember,
  type Message,
  type TextChannel,
} from "discord.js";
import type { TicketSettings, TicketSummary } from "@adobos/shared";
import {
  TICKET_ADD_PREFIX,
  TICKET_CLAIM_PREFIX,
  TICKET_CLOSE_PREFIX,
  TICKET_REMOVE_PREFIX,
  TICKET_UNCLAIM_PREFIX,
  TICKET_UNWAIT_PREFIX,
  TICKET_WAIT_PREFIX,
  TICKET_STATUS_LABEL,
  applyTicketNameTemplate,
  clampTicketTranscript,
} from "@adobos/shared";
import { logger } from "../../core/log.js";
import {
  TicketsError,
  addTicketParticipant,
  appendChannelDeletedEvent,
  applyTicketAction,
  assertCanOpenTicket,
  getTicketByChannelId,
  getTicketById,
  getTicketSettings,
  insertOpenedTicket,
  removeTicketParticipant,
  setTicketChannelId,
} from "./service.js";

const TICKET_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
];

const BOT_ALLOW = [
  ...TICKET_ALLOW,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageMessages,
];

function embedColorInt(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(n) ? n : 0x5865f2;
}

function asTextChannel(channel: unknown): TextChannel | null {
  if (
    channel &&
    typeof channel === "object" &&
    "type" in channel &&
    (channel as { type: number }).type === ChannelType.GuildText &&
    "send" in channel
  ) {
    return channel as TextChannel;
  }
  return null;
}

export async function requireGuild(
  bot: Client,
  guildId: string,
): Promise<Guild> {
  const cached = bot.guilds.cache.get(guildId);
  if (cached) return cached;
  try {
    return await bot.guilds.fetch(guildId);
  } catch {
    throw new TicketsError(
      "El bot no está en este servidor.",
      400,
      "GUILD_NOT_FOUND",
    );
  }
}

async function fetchTextInGuild(
  guild: Guild,
  channelId: string,
): Promise<TextChannel | null> {
  const cached = asTextChannel(guild.channels.cache.get(channelId));
  if (cached) return cached;
  try {
    return asTextChannel(await guild.channels.fetch(channelId));
  } catch {
    return null;
  }
}

function controlRows(ticket: TicketSummary): ActionRowBuilder<ButtonBuilder>[] {
  const id = String(ticket.id);
  const row1 = new ActionRowBuilder<ButtonBuilder>();
  if (ticket.status === "open") {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`${TICKET_CLAIM_PREFIX}${id}`)
        .setLabel("Claim")
        .setStyle(ButtonStyle.Success),
    );
  }
  if (ticket.status === "claimed") {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`${TICKET_UNCLAIM_PREFIX}${id}`)
        .setLabel("Unclaim")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${TICKET_WAIT_PREFIX}${id}`)
        .setLabel("Waiting")
        .setStyle(ButtonStyle.Primary),
    );
  }
  if (ticket.status === "waiting") {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`${TICKET_UNWAIT_PREFIX}${id}`)
        .setLabel("Unwait")
        .setStyle(ButtonStyle.Primary),
    );
  }
  if (ticket.status !== "closed") {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`${TICKET_CLOSE_PREFIX}${id}`)
        .setLabel("Cerrar")
        .setStyle(ButtonStyle.Danger),
    );
  }
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${TICKET_ADD_PREFIX}${id}`)
      .setLabel("Añadir")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${TICKET_REMOVE_PREFIX}${id}`)
      .setLabel("Quitar")
      .setStyle(ButtonStyle.Secondary),
  );
  return ticket.status === "closed" ? [] : [row1, row2];
}

function ticketEmbed(ticket: TicketSummary): EmbedBuilder {
  const staff = ticket.claimedBy
    ? `<@${ticket.claimedBy}>`
    : "Nadie todavía";
  return new EmbedBuilder()
    .setColor(embedColorInt("#5865F2"))
    .setTitle(`Ticket #${ticket.number}`)
    .setDescription(
      [
        `Estado: **${TICKET_STATUS_LABEL[ticket.status]}**`,
        `Tipo: \`${ticket.typeKey}\``,
        `Abierto por: <@${ticket.openerId}>`,
        `Staff: ${staff}`,
      ].join("\n"),
    );
}

export async function upsertControlMessage(
  channel: TextChannel,
  ticket: TicketSummary,
): Promise<void> {
  const payload = {
    embeds: [ticketEmbed(ticket)],
    components: controlRows(ticket),
  };
  try {
    const recent = await channel.messages.fetch({ limit: 20 });
    const mine = recent.find(
      (msg) =>
        msg.author.id === channel.client.user?.id && msg.components.length > 0,
    );
    if (mine) {
      await mine.edit(payload);
      return;
    }
  } catch {
    // sin historial o sin permiso: enviamos uno nuevo
  }
  const sent = await channel.send(payload);
  await sent.pin().catch(() => undefined);
}

async function createTicketChannel(
  guild: Guild,
  settings: TicketSettings,
  ticket: TicketSummary,
  opener: GuildMember,
): Promise<TextChannel> {
  const botId = guild.members.me?.id ?? guild.client.user?.id;
  if (!botId) {
    throw new TicketsError(
      "El bot no está en este servidor.",
      500,
      "BOT_NOT_IN_GUILD",
    );
  }
  if (!settings.categoryId) {
    throw new TicketsError(
      "Configura una categoría de tickets en el panel.",
      400,
      "MISSING_CATEGORY",
    );
  }
  const name = applyTicketNameTemplate(settings.nameTemplate, {
    n: ticket.number,
    user: opener.displayName || opener.user.username,
    typeKey: ticket.typeKey,
  });
  try {
    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: settings.categoryId,
      permissionOverwrites: [
        {
          id: guild.id,
          type: OverwriteType.Role,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: botId,
          type: OverwriteType.Member,
          allow: BOT_ALLOW,
        },
        {
          id: opener.id,
          type: OverwriteType.Member,
          allow: TICKET_ALLOW,
        },
        ...settings.staffRoleIds.map((roleId) => ({
          id: roleId,
          type: OverwriteType.Role,
          allow: TICKET_ALLOW,
        })),
      ],
      reason: `Tickets: #${ticket.number}`,
    });
    return channel;
  } catch (error: unknown) {
    logger.warn({ err: error, guildId: guild.id }, "No se pudo crear el canal de ticket");
    throw new TicketsError(
      "No pude crear el canal. Revisa que el bot tenga Permiso de gestionar canales en esa categoría.",
      400,
      "CHANNEL_CREATE_FAILED",
    );
  }
}

async function collectTranscript(channel: TextChannel): Promise<string> {
  const collected: Message[] = [];
  let before: string | undefined;
  for (let i = 0; i < 10; i++) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;
    const arr = [...batch.values()];
    collected.push(...arr);
    before = arr[arr.length - 1]?.id;
    if (batch.size < 100) break;
  }
  collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const lines = collected.map((msg) => {
    const when = msg.createdAt.toISOString();
    const name = msg.author.tag;
    const extra = msg.attachments.size
      ? ` [${msg.attachments.size} adjunto(s)]`
      : "";
    const body = msg.content?.trim() ? msg.content : extra ? "" : "(sin texto)";
    return `[${when}] ${name}: ${body}${extra}`;
  });
  return clampTicketTranscript(lines.join("\n"));
}

async function postTicketLog(
  guild: Guild,
  settings: TicketSettings,
  ticket: TicketSummary,
  title: string,
  body: string,
  file?: { name: string; text: string },
): Promise<void> {
  if (!settings.logChannelId) return;
  const channel = await fetchTextInGuild(guild, settings.logChannelId);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor(embedColorInt("#5865F2"))
    .setTitle(title)
    .setDescription(body.slice(0, 4096))
    .setFooter({ text: `Ticket #${ticket.number}` })
    .setTimestamp(new Date());
  const files = file
    ? [new AttachmentBuilder(Buffer.from(file.text, "utf8"), { name: file.name })]
    : [];
  await channel
    .send({ embeds: [embed], files })
    .catch((error: unknown) => {
      logger.warn({ err: error }, "No se pudo enviar el log de ticket");
    });
}

async function dmTranscript(
  guild: Guild,
  openerId: string,
  ticket: TicketSummary,
  text: string,
): Promise<void> {
  try {
    const user = await guild.client.users.fetch(openerId);
    await user.send({
      content: `Transcript del ticket #${ticket.number} (${ticket.typeKey}).`,
      files: [
        new AttachmentBuilder(Buffer.from(text, "utf8"), {
          name: `ticket-${ticket.number}.txt`,
        }),
      ],
    });
  } catch {
    // DMs cerrados: el expediente sigue en el panel
  }
}

export async function openTicket(input: {
  guild: Guild;
  opener: GuildMember;
  typeKey: string;
  reason?: string | null;
}): Promise<TicketSummary> {
  const settings = await assertCanOpenTicket(input.guild.id, input.opener.id);
  const ticket = await insertOpenedTicket({
    guildId: input.guild.id,
    openerId: input.opener.id,
    typeKey: input.typeKey,
    reason: input.reason ?? null,
  });
  let channel: TextChannel;
  try {
    channel = await createTicketChannel(
      input.guild,
      settings,
      ticket,
      input.opener,
    );
  } catch (error: unknown) {
    await applyTicketAction({
      ticketId: ticket.id,
      guildId: ticket.guildId,
      action: "close",
      actorId: "system",
      closeReason: "No se pudo crear el canal",
      channelId: null,
    }).catch(() => undefined);
    throw error;
  }
  await setTicketChannelId(ticket.id, channel.id);
  const live = { ...ticket, channelId: channel.id };
  await channel.send({
    content: `<@${input.opener.id}>`,
    embeds: [
      new EmbedBuilder()
        .setColor(embedColorInt("#5865F2"))
        .setTitle(`Ticket #${ticket.number}`)
        .setDescription(
          `Tipo: \`${ticket.typeKey}\`\nUn miembro del staff te atenderá aquí.`,
        ),
    ],
  });
  await upsertControlMessage(channel, live);
  await postTicketLog(
    input.guild,
    settings,
    live,
    `Ticket #${ticket.number} abierto`,
    `Tipo \`${ticket.typeKey}\` · <@${input.opener.id}> · ${channel}`,
  );
  return live;
}

async function requireLiveChannel(
  guild: Guild,
  ticket: TicketSummary,
): Promise<TextChannel> {
  if (!ticket.channelId) {
    throw new TicketsError(
      "Este ticket ya no tiene canal de Discord.",
      409,
      "NO_CHANNEL",
    );
  }
  const channel = await fetchTextInGuild(guild, ticket.channelId);
  if (!channel) {
    throw new TicketsError(
      "No encuentro el canal de este ticket.",
      404,
      "CHANNEL_NOT_FOUND",
    );
  }
  return channel;
}

export async function claimTicket(input: {
  guild: Guild;
  ticketId: number;
  actor: GuildMember;
}): Promise<TicketSummary> {
  const current = await getTicketById(input.ticketId, input.guild.id);
  if (current.claimedBy === input.actor.id && current.status === "claimed") {
    throw new TicketsError("Ya tienes este ticket.", 409, "ALREADY_CLAIMER");
  }
  const action =
    current.status === "claimed" || current.status === "waiting"
      ? "transfer"
      : "claim";
  const ticket = await applyTicketAction({
    ticketId: current.id,
    guildId: current.guildId,
    action,
    actorId: input.actor.id,
    claimedBy: input.actor.id,
    payload: { fromStaff: current.claimedBy, toStaff: input.actor.id },
  });
  const channel = await requireLiveChannel(input.guild, ticket);
  await channel.permissionOverwrites
    .edit(input.actor.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      EmbedLinks: true,
    })
    .catch(() => undefined);
  await upsertControlMessage(channel, ticket);
  const settings = await getTicketSettings(input.guild.id);
  await postTicketLog(
    input.guild,
    settings,
    ticket,
    `Ticket #${ticket.number} ${action === "transfer" ? "transferido" : "reclamado"}`,
    `<@${input.actor.id}> atiende este ticket.`,
  );
  return ticket;
}

export async function unclaimTicket(input: {
  guild: Guild;
  ticketId: number;
  actorId: string;
}): Promise<TicketSummary> {
  const ticket = await applyTicketAction({
    ticketId: input.ticketId,
    guildId: input.guild.id,
    action: "unclaim",
    actorId: input.actorId,
  });
  if (ticket.channelId) {
    const channel = await fetchTextInGuild(input.guild, ticket.channelId);
    if (channel) await upsertControlMessage(channel, ticket);
  }
  return ticket;
}

export async function waitTicket(input: {
  guild: Guild;
  ticketId: number;
  actorId: string;
}): Promise<TicketSummary> {
  const ticket = await applyTicketAction({
    ticketId: input.ticketId,
    guildId: input.guild.id,
    action: "wait",
    actorId: input.actorId,
  });
  if (ticket.channelId) {
    const channel = await fetchTextInGuild(input.guild, ticket.channelId);
    if (channel) await upsertControlMessage(channel, ticket);
  }
  return ticket;
}

export async function unwaitTicket(input: {
  guild: Guild;
  ticketId: number;
  actorId: string;
}): Promise<TicketSummary> {
  const ticket = await applyTicketAction({
    ticketId: input.ticketId,
    guildId: input.guild.id,
    action: "unwait",
    actorId: input.actorId,
  });
  if (ticket.channelId) {
    const channel = await fetchTextInGuild(input.guild, ticket.channelId);
    if (channel) await upsertControlMessage(channel, ticket);
  }
  return ticket;
}

export async function closeTicket(input: {
  guild: Guild;
  ticketId: number;
  actorId: string;
  reason: string;
}): Promise<TicketSummary> {
  const current = await getTicketById(input.ticketId, input.guild.id);
  let transcript = "";
  let channel: TextChannel | null = null;
  if (current.channelId) {
    channel = await fetchTextInGuild(input.guild, current.channelId);
    if (channel) {
      transcript = await collectTranscript(channel).catch(() => "");
    }
  }
  const ticket = await applyTicketAction({
    ticketId: current.id,
    guildId: current.guildId,
    action: "close",
    actorId: input.actorId,
    closeReason: input.reason,
    transcriptText: transcript || null,
    channelId: null,
  });
  const settings = await getTicketSettings(input.guild.id);
  await postTicketLog(
    input.guild,
    settings,
    ticket,
    `Ticket #${ticket.number} cerrado`,
    `Motivo: ${input.reason}\nPor: <@${input.actorId}>`,
    transcript
      ? { name: `ticket-${ticket.number}.txt`, text: transcript }
      : undefined,
  );
  if (transcript) {
    await dmTranscript(input.guild, current.openerId, ticket, transcript);
  }
  if (channel) {
    await channel
      .delete(`Tickets: cierre #${ticket.number}`)
      .catch((error: unknown) => {
        logger.warn({ err: error }, "No se pudo borrar el canal del ticket");
      });
  }
  return ticket;
}

export async function reopenTicket(input: {
  guild: Guild;
  ticketId: number;
  actor: GuildMember;
}): Promise<TicketSummary> {
  const current = await getTicketById(input.ticketId, input.guild.id);
  const settings = await getTicketSettings(input.guild.id);
  if (!settings.categoryId || settings.staffRoleIds.length === 0) {
    throw new TicketsError(
      "Configura categoría y roles de staff antes de reabrir.",
      400,
      "MISSING_SETTINGS",
    );
  }
  const opener =
    (await input.guild.members.fetch(current.openerId).catch(() => null)) ??
    input.actor;
  const placeholder = await applyTicketAction({
    ticketId: current.id,
    guildId: current.guildId,
    action: "reopen",
    actorId: input.actor.id,
    channelId: null,
    payload: { previousChannelId: current.channelId },
  });
  const channel = await createTicketChannel(
    input.guild,
    settings,
    placeholder,
    opener,
  );
  await setTicketChannelId(placeholder.id, channel.id);
  const live = { ...placeholder, channelId: channel.id, status: "open" as const };
  await channel.send({
    content: `<@${current.openerId}>`,
    embeds: [
      new EmbedBuilder()
        .setColor(embedColorInt("#5865F2"))
        .setTitle(`Ticket #${current.number} reabierto`)
        .setDescription(`Tipo: \`${current.typeKey}\``),
    ],
  });
  await upsertControlMessage(channel, live);
  await postTicketLog(
    input.guild,
    settings,
    live,
    `Ticket #${current.number} reabierto`,
    `<@${input.actor.id}> · ${channel}`,
  );
  return live;
}

export async function addUserToTicket(input: {
  guild: Guild;
  ticketId: number;
  actorId: string;
  userId: string;
}): Promise<TicketSummary> {
  const ticket = await addTicketParticipant(
    input.ticketId,
    input.guild.id,
    input.userId,
    input.actorId,
  );
  const channel = await requireLiveChannel(input.guild, ticket);
  await channel.permissionOverwrites.edit(input.userId, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
    EmbedLinks: true,
  });
  await channel.send(`<@${input.userId}> fue añadido al ticket.`);
  return ticket;
}

export async function removeUserFromTicket(input: {
  guild: Guild;
  ticketId: number;
  actorId: string;
  userId: string;
}): Promise<TicketSummary> {
  const ticket = await removeTicketParticipant(
    input.ticketId,
    input.guild.id,
    input.userId,
    input.actorId,
  );
  if (ticket.channelId) {
    const channel = await fetchTextInGuild(input.guild, ticket.channelId);
    if (channel) {
      await channel.permissionOverwrites.delete(input.userId).catch(() => undefined);
    }
  }
  return ticket;
}

export async function onTicketChannelDeleted(channelId: string): Promise<void> {
  const ticket = await getTicketByChannelId(channelId);
  if (!ticket) return;
  if (ticket.status === "closed") return;
  await appendChannelDeletedEvent(ticket);
}

export async function onTicketChannelMessage(input: {
  channel: TextChannel;
  authorId: string;
  bot: boolean;
}): Promise<void> {
  if (input.bot) return;
  const ticket = await getTicketByChannelId(input.channel.id);
  if (!ticket || ticket.status !== "waiting") return;
  if (ticket.openerId !== input.authorId) return;
  const updated = await applyTicketAction({
    ticketId: ticket.id,
    guildId: ticket.guildId,
    action: "unwait",
    actorId: input.authorId,
  });
  await upsertControlMessage(input.channel, updated).catch(() => undefined);
}
