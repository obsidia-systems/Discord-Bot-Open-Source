import type {
  CreateTicketPanelRequest,
  TicketAction,
  TicketDetail,
  TicketEvent,
  TicketEventType,
  TicketListResponse,
  TicketPanel,
  TicketParticipant,
  TicketSettings,
  TicketStatus,
  TicketSummary,
  UpdateTicketPanelRequest,
  UpdateTicketSettingsRequest,
} from "@adobos/shared";
import {
  canApplyTicketAction,
  clampTicketOpenPerUser,
  isTicketEventType,
  isTicketStatus,
  normalizeTicketEmbedColor,
  normalizeTicketNameTemplate,
  normalizeTicketPanelButtons,
  normalizeTicketSnowflake,
  normalizeTicketSnowflakeList,
  TICKET_LIVE_STATUSES,
  TICKETS_LIST_MAX,
  TICKETS_MAX_PANELS,
  ticketOpenBlocked,
  ticketStatusAfter,
} from "@adobos/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import { BoundedTtlMap } from "#core/cache/boundedTtlMap.js";
import { getDb, one } from "#db/client.js";
import {
  guildSettings,
  type TicketEventRow,
  type TicketPanelRow,
  type TicketParticipantRow,
  type TicketRow,
  type TicketSettingsRow,
  ticketEvents,
  ticketPanels,
  ticketParticipants,
  ticketSettings,
  tickets,
} from "#db/schema.js";

export class TicketsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "TicketsError";
  }
}

const settingsCache = new BoundedTtlMap<string, TicketSettings>(2_000, 60_000);
const panelsCache = new BoundedTtlMap<string, TicketPanel[]>(2_000, 60_000);

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new TicketsError("Missing guildId.", 400, "MISSING_GUILD_ID");
  }
  return id;
}

async function ensureGuildRow(guildId: string): Promise<void> {
  const existing = await one(
    getDb()
      .select({ guildId: guildSettings.guildId })
      .from(guildSettings)
      .where(eq(guildSettings.guildId, guildId))
      .limit(1),
  );
  if (!existing) {
    await getDb().insert(guildSettings).values({
      guildId,
      prefix: "!",
      welcomeEnabled: false,
      updatedAt: new Date(),
    });
  }
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mapSettings(row: TicketSettingsRow): TicketSettings {
  return {
    guildId: row.guildId,
    categoryId: row.categoryId,
    staffRoleIds: normalizeTicketSnowflakeList(
      parseJson<unknown>(row.staffRoleIds, []),
    ),
    nameTemplate: normalizeTicketNameTemplate(row.nameTemplate),
    maxOpenPerUser: clampTicketOpenPerUser(row.maxOpenPerUser),
    logChannelId: row.logChannelId,
    nextNumber: row.nextNumber,
    openerCanClose: row.openerCanClose,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapPanel(row: TicketPanelRow): TicketPanel {
  return {
    id: row.id,
    guildId: row.guildId,
    channelId: row.channelId,
    messageId: row.messageId,
    embedTitle: row.embedTitle,
    embedDescription: row.embedDescription,
    embedColor: normalizeTicketEmbedColor(row.embedColor),
    buttons: normalizeTicketPanelButtons(parseJson<unknown>(row.buttons, [])),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapTicket(row: TicketRow): TicketSummary {
  return {
    id: row.id,
    guildId: row.guildId,
    number: row.number,
    openerId: row.openerId,
    channelId: row.channelId,
    typeKey: row.typeKey,
    status: isTicketStatus(row.status) ? row.status : "open",
    claimedBy: row.claimedBy,
    reason: row.reason,
    closeReason: row.closeReason,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    claimedAt: row.claimedAt?.toISOString() ?? null,
  };
}

function mapEvent(row: TicketEventRow): TicketEvent {
  return {
    id: row.id,
    ticketId: row.ticketId,
    guildId: row.guildId,
    type: isTicketEventType(row.type) ? row.type : "opened",
    actorId: row.actorId,
    payload: parseJson<Record<string, unknown>>(row.payload, {}),
    createdAt: row.createdAt.toISOString(),
  };
}

function mapParticipant(row: TicketParticipantRow): TicketParticipant {
  const kind =
    row.kind === "opener" || row.kind === "claimer" ? row.kind : "added";
  return { ticketId: row.ticketId, userId: row.userId, kind };
}

function invalidate(guildId: string): void {
  settingsCache.delete(guildId);
  panelsCache.delete(guildId);
}

async function loadSettingsRow(guildId: string): Promise<TicketSettingsRow> {
  await ensureGuildRow(guildId);
  const existing = await one(
    getDb()
      .select()
      .from(ticketSettings)
      .where(eq(ticketSettings.guildId, guildId))
      .limit(1),
  );
  if (existing) return existing;
  const now = new Date();
  const [inserted] = await getDb()
    .insert(ticketSettings)
    .values({
      guildId,
      staffRoleIds: "[]",
      nameTemplate: "ticket-{n}-{user}",
      maxOpenPerUser: 1,
      nextNumber: 1,
      openerCanClose: true,
      updatedAt: now,
    })
    .returning();
  if (!inserted) {
    throw new TicketsError(
      "Couldn't create the Tickets settings.",
      500,
      "SETTINGS_INSERT_FAILED",
    );
  }
  return inserted;
}

export async function getTicketSettings(
  guildId?: string,
): Promise<TicketSettings> {
  const id = resolveGuildId(guildId);
  const hit = settingsCache.get(id);
  if (hit) return hit;
  const mapped = mapSettings(await loadSettingsRow(id));
  settingsCache.set(id, mapped);
  return mapped;
}

export async function updateTicketSettings(
  input: UpdateTicketSettingsRequest,
  guildId?: string,
): Promise<TicketSettings> {
  const id = resolveGuildId(guildId);
  await loadSettingsRow(id);
  const now = new Date();
  const patch: Partial<TicketSettingsRow> = { updatedAt: now };
  if (input.categoryId !== undefined) {
    patch.categoryId = input.categoryId
      ? normalizeTicketSnowflake(input.categoryId)
      : null;
  }
  if (input.logChannelId !== undefined) {
    patch.logChannelId = input.logChannelId
      ? normalizeTicketSnowflake(input.logChannelId)
      : null;
  }
  if (input.staffRoleIds !== undefined) {
    patch.staffRoleIds = JSON.stringify(
      normalizeTicketSnowflakeList(input.staffRoleIds),
    );
  }
  if (input.nameTemplate !== undefined) {
    patch.nameTemplate = normalizeTicketNameTemplate(input.nameTemplate);
  }
  if (input.maxOpenPerUser !== undefined) {
    patch.maxOpenPerUser = clampTicketOpenPerUser(input.maxOpenPerUser);
  }
  if (input.openerCanClose !== undefined) {
    patch.openerCanClose = input.openerCanClose;
  }
  await getDb()
    .update(ticketSettings)
    .set(patch)
    .where(eq(ticketSettings.guildId, id));
  invalidate(id);
  return getTicketSettings(id);
}

export async function listTicketPanels(
  guildId?: string,
): Promise<TicketPanel[]> {
  const id = resolveGuildId(guildId);
  const hit = panelsCache.get(id);
  if (hit) return hit;
  const rows = await getDb()
    .select()
    .from(ticketPanels)
    .where(eq(ticketPanels.guildId, id))
    .orderBy(ticketPanels.id);
  const list = rows.map(mapPanel);
  panelsCache.set(id, list);
  return list;
}

export async function getTicketPanel(
  panelId: number,
  guildId?: string,
): Promise<TicketPanel> {
  const row = await one(
    getDb()
      .select()
      .from(ticketPanels)
      .where(eq(ticketPanels.id, panelId))
      .limit(1),
  );
  if (!row) {
    throw new TicketsError("Panel not found.", 404, "PANEL_NOT_FOUND");
  }
  if (guildId && row.guildId !== guildId) {
    throw new TicketsError("Panel not found.", 404, "PANEL_NOT_FOUND");
  }
  return mapPanel(row);
}

export async function createTicketPanel(
  input: CreateTicketPanelRequest,
  guildId?: string,
): Promise<TicketPanel> {
  const id = resolveGuildId(guildId);
  await ensureGuildRow(id);
  const existing = await getDb()
    .select({ id: ticketPanels.id })
    .from(ticketPanels)
    .where(eq(ticketPanels.guildId, id));
  if (existing.length >= TICKETS_MAX_PANELS) {
    throw new TicketsError(
      `At most ${TICKETS_MAX_PANELS} panels per server.`,
      400,
      "PANEL_LIMIT",
    );
  }
  const now = new Date();
  const [row] = await getDb()
    .insert(ticketPanels)
    .values({
      guildId: id,
      channelId: input.channelId
        ? normalizeTicketSnowflake(input.channelId)
        : null,
      embedTitle:
        (input.embedTitle ?? "Tickets").trim().slice(0, 256) || "Tickets",
      embedDescription:
        (input.embedDescription ?? "Press a button to open a ticket.")
          .trim()
          .slice(0, 4096) || "Press a button to open a ticket.",
      embedColor: normalizeTicketEmbedColor(input.embedColor),
      buttons: JSON.stringify(normalizeTicketPanelButtons(input.buttons)),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) {
    throw new TicketsError(
      "Couldn't create the panel.",
      500,
      "PANEL_INSERT_FAILED",
    );
  }
  invalidate(id);
  return mapPanel(row);
}

export async function updateTicketPanel(
  panelId: number,
  input: UpdateTicketPanelRequest,
  guildId?: string,
): Promise<TicketPanel> {
  const current = await getTicketPanel(panelId, guildId);
  const now = new Date();
  const patch: Partial<TicketPanelRow> = { updatedAt: now };
  if (input.channelId !== undefined) {
    patch.channelId = input.channelId
      ? normalizeTicketSnowflake(input.channelId)
      : null;
  }
  if (input.embedTitle !== undefined) {
    patch.embedTitle = input.embedTitle.trim().slice(0, 256) || "Tickets";
  }
  if (input.embedDescription !== undefined) {
    patch.embedDescription =
      input.embedDescription.trim().slice(0, 4096) ||
      "Press a button to open a ticket.";
  }
  if (input.embedColor !== undefined) {
    patch.embedColor = normalizeTicketEmbedColor(input.embedColor);
  }
  if (input.buttons !== undefined) {
    patch.buttons = JSON.stringify(normalizeTicketPanelButtons(input.buttons));
  }
  await getDb()
    .update(ticketPanels)
    .set(patch)
    .where(eq(ticketPanels.id, current.id));
  invalidate(current.guildId);
  return getTicketPanel(current.id, current.guildId);
}

export async function setPanelPublishedMessage(
  panelId: number,
  channelId: string,
  messageId: string,
): Promise<TicketPanel> {
  const now = new Date();
  await getDb()
    .update(ticketPanels)
    .set({ channelId, messageId, updatedAt: now })
    .where(eq(ticketPanels.id, panelId));
  const panel = await getTicketPanel(panelId);
  invalidate(panel.guildId);
  return panel;
}

export async function deleteTicketPanel(
  panelId: number,
  guildId?: string,
): Promise<void> {
  const current = await getTicketPanel(panelId, guildId);
  await getDb().delete(ticketPanels).where(eq(ticketPanels.id, current.id));
  invalidate(current.guildId);
}

export async function countLiveTickets(
  guildId: string,
  openerId?: string,
): Promise<number> {
  const filters = [
    eq(tickets.guildId, guildId),
    inArray(tickets.status, [...TICKET_LIVE_STATUSES]),
  ];
  if (openerId) filters.push(eq(tickets.openerId, openerId));
  const rows = await getDb()
    .select({ id: tickets.id })
    .from(tickets)
    .where(and(...filters));
  return rows.length;
}

export async function assertCanOpenTicket(
  guildId: string,
  openerId: string,
): Promise<TicketSettings> {
  const settings = await getTicketSettings(guildId);
  const [guildOpen, userOpen] = await Promise.all([
    countLiveTickets(guildId),
    countLiveTickets(guildId, openerId),
  ]);
  const blocked = ticketOpenBlocked({
    guildOpenCount: guildOpen,
    openerOpenCount: userOpen,
    maxOpenPerUser: settings.maxOpenPerUser,
  });
  if (blocked === "guild") {
    throw new TicketsError(
      "This server already has 50 open tickets. Close one before opening another.",
      400,
      "GUILD_OPEN_CAP",
    );
  }
  if (blocked === "user") {
    throw new TicketsError(
      "You already have an open ticket. Close it before opening another.",
      400,
      "USER_OPEN_CAP",
    );
  }
  if (!settings.categoryId) {
    throw new TicketsError(
      "Configure a ticket category in the panel.",
      400,
      "MISSING_CATEGORY",
    );
  }
  if (settings.staffRoleIds.length === 0) {
    throw new TicketsError(
      "Configure at least one staff role in Settings.",
      400,
      "MISSING_STAFF_ROLES",
    );
  }
  return settings;
}

export async function insertOpenedTicket(input: {
  guildId: string;
  openerId: string;
  typeKey: string;
  reason: string | null;
}): Promise<TicketSummary> {
  const now = new Date();
  const inserted = await getDb().transaction(async (tx) => {
    const settings = await one(
      tx
        .select()
        .from(ticketSettings)
        .where(eq(ticketSettings.guildId, input.guildId))
        .limit(1)
        .for("update"),
    );
    if (!settings) {
      throw new TicketsError(
        "The Tickets settings are missing.",
        400,
        "MISSING_SETTINGS",
      );
    }
    const number = settings.nextNumber;
    await tx
      .update(ticketSettings)
      .set({ nextNumber: number + 1, updatedAt: now })
      .where(eq(ticketSettings.guildId, input.guildId));

    const [row] = await tx
      .insert(tickets)
      .values({
        guildId: input.guildId,
        number,
        openerId: input.openerId,
        typeKey: input.typeKey,
        status: "open",
        reason: input.reason,
        openedAt: now,
      })
      .returning();
    if (!row) {
      throw new TicketsError(
        "Couldn't create the ticket.",
        500,
        "INSERT_FAILED",
      );
    }
    await tx.insert(ticketEvents).values({
      ticketId: row.id,
      guildId: input.guildId,
      type: "opened",
      actorId: input.openerId,
      payload: JSON.stringify({
        number,
        typeKey: input.typeKey,
        reason: input.reason,
      }),
      createdAt: now,
    });
    await tx.insert(ticketParticipants).values({
      ticketId: row.id,
      userId: input.openerId,
      kind: "opener",
    });
    return row;
  });
  invalidate(input.guildId);
  return mapTicket(inserted);
}

export async function setTicketChannelId(
  ticketId: number,
  channelId: string | null,
): Promise<void> {
  await getDb()
    .update(tickets)
    .set({ channelId })
    .where(eq(tickets.id, ticketId));
}

export async function getTicketById(
  ticketId: number,
  guildId?: string,
): Promise<TicketSummary> {
  const row = await one(
    getDb().select().from(tickets).where(eq(tickets.id, ticketId)).limit(1),
  );
  if (!row) {
    throw new TicketsError("Ticket not found.", 404, "TICKET_NOT_FOUND");
  }
  if (guildId && row.guildId !== guildId) {
    throw new TicketsError("Ticket not found.", 404, "TICKET_NOT_FOUND");
  }
  return mapTicket(row);
}

export async function getTicketByChannelId(
  channelId: string,
): Promise<TicketSummary | null> {
  const row = await one(
    getDb()
      .select()
      .from(tickets)
      .where(eq(tickets.channelId, channelId))
      .limit(1),
  );
  return row ? mapTicket(row) : null;
}

export async function listTickets(
  guildId: string,
  filters: {
    status?: TicketStatus;
    typeKey?: string;
    openerId?: string;
    claimedBy?: string;
  } = {},
): Promise<TicketListResponse> {
  const id = resolveGuildId(guildId);
  const clauses = [eq(tickets.guildId, id)];
  if (filters.status) clauses.push(eq(tickets.status, filters.status));
  if (filters.typeKey) clauses.push(eq(tickets.typeKey, filters.typeKey));
  if (filters.openerId) clauses.push(eq(tickets.openerId, filters.openerId));
  if (filters.claimedBy) clauses.push(eq(tickets.claimedBy, filters.claimedBy));
  const rows = await getDb()
    .select()
    .from(tickets)
    .where(and(...clauses))
    .orderBy(desc(tickets.openedAt))
    .limit(TICKETS_LIST_MAX);
  return { tickets: rows.map(mapTicket) };
}

export async function getTicketDetail(
  ticketId: number,
  guildId?: string,
): Promise<TicketDetail> {
  const summary = await getTicketById(ticketId, guildId);
  const row = await one(
    getDb().select().from(tickets).where(eq(tickets.id, ticketId)).limit(1),
  );
  const [eventRows, participantRows] = await Promise.all([
    getDb()
      .select()
      .from(ticketEvents)
      .where(eq(ticketEvents.ticketId, ticketId))
      .orderBy(ticketEvents.createdAt),
    getDb()
      .select()
      .from(ticketParticipants)
      .where(eq(ticketParticipants.ticketId, ticketId)),
  ]);
  return {
    ...summary,
    transcriptText: row?.transcriptText ?? null,
    events: eventRows.map(mapEvent),
    participants: participantRows.map(mapParticipant),
  };
}

export async function listTicketParticipants(
  ticketId: number,
): Promise<TicketParticipant[]> {
  const rows = await getDb()
    .select()
    .from(ticketParticipants)
    .where(eq(ticketParticipants.ticketId, ticketId));
  return rows.map(mapParticipant);
}

async function appendEvent(input: {
  ticketId: number;
  guildId: string;
  type: TicketEventType;
  actorId: string | null;
  payload?: Record<string, unknown>;
  createdAt?: Date;
}): Promise<void> {
  await getDb()
    .insert(ticketEvents)
    .values({
      ticketId: input.ticketId,
      guildId: input.guildId,
      type: input.type,
      actorId: input.actorId,
      payload: JSON.stringify(input.payload ?? {}),
      createdAt: input.createdAt ?? new Date(),
    });
}

export async function applyTicketAction(input: {
  ticketId: number;
  guildId: string;
  action: TicketAction;
  actorId: string;
  claimedBy?: string | null;
  closeReason?: string | null;
  transcriptText?: string | null;
  channelId?: string | null;
  targetUserId?: string;
  eventType?: TicketEventType;
  payload?: Record<string, unknown>;
}): Promise<TicketSummary> {
  const current = await getTicketById(input.ticketId, input.guildId);
  const nextStatus = ticketStatusAfter(current.status, input.action);
  if (!nextStatus || !canApplyTicketAction(current.status, input.action)) {
    throw new TicketsError(
      "That action is not valid in the ticket's current state.",
      409,
      "ILLEGAL_TRANSITION",
    );
  }

  const now = new Date();
  const patch: Partial<TicketRow> = {};
  let eventType: TicketEventType = input.eventType ?? "claimed";

  patch.status = nextStatus;
  if (input.action === "claim") {
    patch.claimedBy = input.actorId;
    patch.claimedAt = now;
    eventType = "claimed";
  } else if (input.action === "transfer") {
    patch.claimedBy = input.claimedBy ?? input.actorId;
    patch.claimedAt = now;
    patch.status = "claimed";
    eventType = "transferred";
  } else if (input.action === "unclaim") {
    patch.claimedBy = null;
    patch.claimedAt = null;
    eventType = "unclaimed";
  } else if (input.action === "wait") {
    eventType = "waiting";
  } else if (input.action === "unwait") {
    eventType = "unwaiting";
  } else if (input.action === "close") {
    patch.closedAt = now;
    patch.closeReason = input.closeReason ?? null;
    if (input.transcriptText !== undefined) {
      patch.transcriptText = input.transcriptText;
    }
    if (input.channelId !== undefined) patch.channelId = input.channelId;
    eventType = input.eventType ?? "closed";
  } else if (input.action === "reopen") {
    patch.closedAt = null;
    patch.closeReason = null;
    patch.claimedBy = null;
    patch.claimedAt = null;
    patch.channelId = input.channelId ?? null;
    eventType = "reopened";
  }

  if (input.channelId !== undefined && input.action !== "close") {
    patch.channelId = input.channelId;
  }

  await getDb()
    .update(tickets)
    .set(patch)
    .where(eq(tickets.id, input.ticketId));

  if (input.action === "claim" || input.action === "transfer") {
    const claimerId = input.claimedBy ?? input.actorId;
    await getDb()
      .delete(ticketParticipants)
      .where(
        and(
          eq(ticketParticipants.ticketId, input.ticketId),
          eq(ticketParticipants.kind, "claimer"),
        ),
      );
    await getDb()
      .insert(ticketParticipants)
      .values({
        ticketId: input.ticketId,
        userId: claimerId,
        kind: "claimer",
      })
      .onConflictDoNothing({
        target: [ticketParticipants.ticketId, ticketParticipants.userId],
      });
  }
  if (input.action === "unclaim") {
    await getDb()
      .delete(ticketParticipants)
      .where(
        and(
          eq(ticketParticipants.ticketId, input.ticketId),
          eq(ticketParticipants.kind, "claimer"),
        ),
      );
  }

  await appendEvent({
    ticketId: input.ticketId,
    guildId: input.guildId,
    type: eventType,
    actorId: input.actorId,
    payload: {
      from: current.status,
      to: nextStatus,
      ...(input.payload ?? {}),
      ...(input.closeReason ? { closeReason: input.closeReason } : {}),
      ...(input.targetUserId ? { targetUserId: input.targetUserId } : {}),
    },
  });
  invalidate(input.guildId);
  return getTicketById(input.ticketId, input.guildId);
}

export async function addTicketParticipant(
  ticketId: number,
  guildId: string,
  userId: string,
  actorId: string,
): Promise<TicketSummary> {
  const ticket = await getTicketById(ticketId, guildId);
  if (!isTicketStatus(ticket.status) || ticket.status === "closed") {
    throw new TicketsError(
      "You can't add users to a closed ticket.",
      409,
      "TICKET_CLOSED",
    );
  }
  await getDb()
    .insert(ticketParticipants)
    .values({ ticketId, userId, kind: "added" })
    .onConflictDoNothing({
      target: [ticketParticipants.ticketId, ticketParticipants.userId],
    });
  await appendEvent({
    ticketId,
    guildId,
    type: "user_added",
    actorId,
    payload: { targetUserId: userId },
  });
  return ticket;
}

export async function removeTicketParticipant(
  ticketId: number,
  guildId: string,
  userId: string,
  actorId: string,
): Promise<TicketSummary> {
  const ticket = await getTicketById(ticketId, guildId);
  if (userId === ticket.openerId) {
    throw new TicketsError(
      "You can't remove the person who opened the ticket.",
      400,
      "CANNOT_REMOVE_OPENER",
    );
  }
  await getDb()
    .delete(ticketParticipants)
    .where(
      and(
        eq(ticketParticipants.ticketId, ticketId),
        eq(ticketParticipants.userId, userId),
        eq(ticketParticipants.kind, "added"),
      ),
    );
  await appendEvent({
    ticketId,
    guildId,
    type: "user_removed",
    actorId,
    payload: { targetUserId: userId },
  });
  return ticket;
}

export async function appendChannelDeletedEvent(
  ticket: TicketSummary,
): Promise<TicketSummary> {
  return applyTicketAction({
    ticketId: ticket.id,
    guildId: ticket.guildId,
    action: "close",
    actorId: "system",
    closeReason: "Channel deleted in Discord",
    channelId: null,
    eventType: "channel_deleted",
    payload: { channelId: ticket.channelId },
  });
}
