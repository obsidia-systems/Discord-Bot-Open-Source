/** Contratos Tickets — expediente en Postgres; el canal de Discord es la sala. */

export const TICKET_STATUSES = [
  "open",
  "claimed",
  "waiting",
  "closed",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_LIVE_STATUSES = ["open", "claimed", "waiting"] as const;
export type TicketLiveStatus = (typeof TICKET_LIVE_STATUSES)[number];

export const TICKET_ACTIONS = [
  "claim",
  "unclaim",
  "transfer",
  "wait",
  "unwait",
  "close",
  "reopen",
] as const;
export type TicketAction = (typeof TICKET_ACTIONS)[number];

export const TICKET_EVENT_TYPES = [
  "opened",
  "claimed",
  "unclaimed",
  "transferred",
  "waiting",
  "unwaiting",
  "user_added",
  "user_removed",
  "closed",
  "reopened",
  "channel_deleted",
] as const;
export type TicketEventType = (typeof TICKET_EVENT_TYPES)[number];

export const TICKET_BUTTON_STYLES = [
  "Primary",
  "Secondary",
  "Success",
  "Danger",
] as const;
export type TicketButtonStyle = (typeof TICKET_BUTTON_STYLES)[number];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  claimed: "Claimed",
  waiting: "Waiting",
  closed: "Closed",
};

export const TICKET_EVENT_LABEL: Record<TicketEventType, string> = {
  opened: "Opened",
  claimed: "Claimed",
  unclaimed: "Unclaimed",
  transferred: "Transferred",
  waiting: "Waiting",
  unwaiting: "No longer waiting",
  user_added: "User added",
  user_removed: "User removed",
  closed: "Closed",
  reopened: "Reopened",
  channel_deleted: "Channel deleted",
};

export const TICKETS_MAX_OPEN_GUILD = 50;
export const TICKETS_MAX_OPEN_PER_USER = 5;
export const TICKETS_DEFAULT_OPEN_PER_USER = 1;
export const TICKETS_MAX_PANELS = 10;
export const TICKETS_MAX_BUTTONS = 5;
export const TICKETS_MAX_STAFF_ROLES = 20;
export const TICKETS_TRANSCRIPT_MAX = 100_000;
export const TICKETS_CLOSE_REASON_MAX = 500;
export const TICKETS_TYPE_KEY_MAX = 32;
export const TICKETS_TYPE_LABEL_MAX = 80;
export const TICKETS_NAME_TEMPLATE_MAX = 80;
export const TICKETS_CHANNEL_NAME_MAX = 100;
export const TICKETS_EMBED_TITLE_MAX = 256;
export const TICKETS_EMBED_DESCRIPTION_MAX = 4096;
export const TICKETS_LIST_MAX = 100;

export const TICKET_DEFAULT_NAME_TEMPLATE = "ticket-{n}-{user}";
export const TICKET_DEFAULT_EMBED_COLOR = "#5865F2";

export const TICKET_OPEN_PREFIX = "ticket_open_";
export const TICKET_CLAIM_PREFIX = "ticket_claim_";
export const TICKET_UNCLAIM_PREFIX = "ticket_unclaim_";
export const TICKET_WAIT_PREFIX = "ticket_wait_";
export const TICKET_UNWAIT_PREFIX = "ticket_unwait_";
export const TICKET_CLOSE_PREFIX = "ticket_close_";
export const TICKET_ADD_PREFIX = "ticket_add_";
export const TICKET_REMOVE_PREFIX = "ticket_remove_";
export const TICKET_REASON_PREFIX = "ticket_reason_";
export const TICKET_ADD_MODAL_PREFIX = "ticket_addm_";
export const TICKET_REMOVE_MODAL_PREFIX = "ticket_remm_";

const SNOWFLAKE_RE = /^\d{17,20}$/;
const TYPE_KEY_RE = /^[a-z0-9-]{1,32}$/;

export interface TicketSettings {
  guildId: string;
  categoryId: string | null;
  staffRoleIds: string[];
  nameTemplate: string;
  maxOpenPerUser: number;
  logChannelId: string | null;
  nextNumber: number;
  openerCanClose: boolean;
  updatedAt: string;
}

export interface TicketPanelButton {
  typeKey: string;
  label: string;
  style: TicketButtonStyle;
}

export interface TicketPanel {
  id: number;
  guildId: string;
  channelId: string | null;
  messageId: string | null;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  buttons: TicketPanelButton[];
  createdAt: string;
  updatedAt: string;
}

export interface TicketSummary {
  id: number;
  guildId: string;
  number: number;
  openerId: string;
  channelId: string | null;
  typeKey: string;
  status: TicketStatus;
  claimedBy: string | null;
  reason: string | null;
  closeReason: string | null;
  openedAt: string;
  closedAt: string | null;
  claimedAt: string | null;
}

export interface TicketEvent {
  id: number;
  ticketId: number;
  guildId: string;
  type: TicketEventType;
  actorId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface TicketParticipant {
  ticketId: number;
  userId: string;
  kind: "opener" | "claimer" | "added";
}

export interface TicketDetail extends TicketSummary {
  transcriptText: string | null;
  events: TicketEvent[];
  participants: TicketParticipant[];
}

export interface TicketSettingsResponse {
  settings: TicketSettings;
}

export interface TicketPanelsResponse {
  panels: TicketPanel[];
}

export interface TicketListResponse {
  tickets: TicketSummary[];
}

export interface TicketDetailResponse {
  ticket: TicketDetail;
}

export interface UpdateTicketSettingsRequest {
  categoryId?: string | null;
  staffRoleIds?: string[];
  nameTemplate?: string;
  maxOpenPerUser?: number;
  logChannelId?: string | null;
  openerCanClose?: boolean;
}

export interface CreateTicketPanelRequest {
  channelId?: string | null;
  embedTitle?: string;
  embedDescription?: string;
  embedColor?: string;
  buttons?: TicketPanelButton[];
}

export type UpdateTicketPanelRequest = Partial<CreateTicketPanelRequest>;

export interface PublishTicketPanelResponse {
  panel: TicketPanel;
  messageId: string;
  channelId: string;
}

export interface CloseTicketRequest {
  reason: string;
}

export interface TicketUserRequest {
  userId: string;
}

export function defaultTicketSettings(guildId = ""): TicketSettings {
  return {
    guildId,
    categoryId: null,
    staffRoleIds: [],
    nameTemplate: TICKET_DEFAULT_NAME_TEMPLATE,
    maxOpenPerUser: TICKETS_DEFAULT_OPEN_PER_USER,
    logChannelId: null,
    nextNumber: 1,
    openerCanClose: true,
    updatedAt: new Date(0).toISOString(),
  };
}

export function defaultTicketPanelButton(): TicketPanelButton {
  return {
    typeKey: "support",
    label: "Abrir ticket",
    style: "Primary",
  };
}

export function isTicketStatus(value: unknown): value is TicketStatus {
  return (
    value === "open" ||
    value === "claimed" ||
    value === "waiting" ||
    value === "closed"
  );
}

export function isTicketLiveStatus(status: TicketStatus): boolean {
  return status !== "closed";
}

export function isTicketEventType(value: unknown): value is TicketEventType {
  return (TICKET_EVENT_TYPES as readonly string[]).includes(String(value));
}

export function isTicketAction(value: unknown): value is TicketAction {
  return (TICKET_ACTIONS as readonly string[]).includes(String(value));
}

export function isTicketButtonStyle(
  value: unknown,
): value is TicketButtonStyle {
  return (
    value === "Primary" ||
    value === "Secondary" ||
    value === "Success" ||
    value === "Danger"
  );
}

/**
 * Transición de estado. Transfer no cambia el status (sigue claimed).
 * Devuelve null si la acción es ilegal.
 */
export function ticketStatusAfter(
  status: TicketStatus,
  action: TicketAction,
): TicketStatus | null {
  switch (action) {
    case "claim":
      if (status === "open") return "claimed";
      return null;
    case "transfer":
      if (status === "claimed" || status === "waiting") return "claimed";
      return null;
    case "unclaim":
      if (status === "claimed") return "open";
      return null;
    case "wait":
      if (status === "claimed") return "waiting";
      return null;
    case "unwait":
      if (status === "waiting") return "claimed";
      return null;
    case "close":
      if (status === "open" || status === "claimed" || status === "waiting") {
        return "closed";
      }
      return null;
    case "reopen":
      if (status === "closed") return "open";
      return null;
    default:
      return null;
  }
}

export function canApplyTicketAction(
  status: TicketStatus,
  action: TicketAction,
): boolean {
  return ticketStatusAfter(status, action) !== null;
}

export function clampTicketOpenPerUser(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : Number.NaN;
  if (!Number.isFinite(n) || n < 1) return TICKETS_DEFAULT_OPEN_PER_USER;
  return Math.min(TICKETS_MAX_OPEN_PER_USER, Math.trunc(n));
}

export function ticketOpenBlocked(input: {
  guildOpenCount: number;
  openerOpenCount: number;
  maxOpenPerUser: number;
}): "guild" | "user" | null {
  if (input.guildOpenCount >= TICKETS_MAX_OPEN_GUILD) return "guild";
  const cap = clampTicketOpenPerUser(input.maxOpenPerUser);
  if (input.openerOpenCount >= cap) return "user";
  return null;
}

export function isTicketStaff(input: {
  memberRoleIds: readonly string[];
  staffRoleIds: readonly string[];
  manageGuild: boolean;
}): boolean {
  if (input.manageGuild) return true;
  if (input.staffRoleIds.length === 0) return false;
  const staff = new Set(input.staffRoleIds);
  return input.memberRoleIds.some((id) => staff.has(id));
}

export function canCloseTicket(input: {
  status: TicketStatus;
  actorId: string;
  openerId: string;
  openerCanClose: boolean;
  isStaff: boolean;
}): boolean {
  if (!canApplyTicketAction(input.status, "close")) return false;
  if (input.isStaff) return true;
  return input.openerCanClose && input.actorId === input.openerId;
}

export function normalizeTicketTypeKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!TYPE_KEY_RE.test(key)) return null;
  return key;
}

export function normalizeTicketNameTemplate(value: unknown): string {
  if (typeof value !== "string") return TICKET_DEFAULT_NAME_TEMPLATE;
  const trimmed = value.trim().slice(0, TICKETS_NAME_TEMPLATE_MAX);
  return trimmed.length > 0 ? trimmed : TICKET_DEFAULT_NAME_TEMPLATE;
}

export function sanitizeTicketChannelName(raw: string): string {
  const s = raw
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, TICKETS_CHANNEL_NAME_MAX);
  return s.length > 0 ? s : "ticket";
}

export function applyTicketNameTemplate(
  template: string,
  ctx: { n: number; user: string; typeKey: string },
): string {
  const user = sanitizeTicketChannelName(ctx.user || "user").slice(0, 32);
  const typeKey = sanitizeTicketChannelName(ctx.typeKey || "ticket").slice(
    0,
    TICKETS_TYPE_KEY_MAX,
  );
  const source = normalizeTicketNameTemplate(template);
  const rendered = source
    .replaceAll("{n}", String(ctx.n))
    .replaceAll("{user}", user)
    .replaceAll("{type}", typeKey);
  return sanitizeTicketChannelName(rendered);
}

export function normalizeTicketCloseReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reason = value.trim().slice(0, TICKETS_CLOSE_REASON_MAX);
  return reason.length > 0 ? reason : null;
}

export function clampTicketTranscript(text: string): string {
  if (text.length <= TICKETS_TRANSCRIPT_MAX) return text;
  return `${text.slice(0, TICKETS_TRANSCRIPT_MAX - 20)}\n… [truncado]`;
}

export function parseTicketRecordId(
  customId: string,
  prefix: string,
): number | null {
  if (!customId.startsWith(prefix)) return null;
  const raw = customId.slice(prefix.length);
  if (!/^\d{1,9}$/.test(raw)) return null;
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id) || id < 1) return null;
  return id;
}

/** customId: ticket_open_{panelId}_{typeKey} */
export function parseTicketOpenCustomId(
  customId: string,
): { panelId: number; typeKey: string } | null {
  if (!customId.startsWith(TICKET_OPEN_PREFIX)) return null;
  const rest = customId.slice(TICKET_OPEN_PREFIX.length);
  const sep = rest.indexOf("_");
  if (sep < 1) return null;
  const panelRaw = rest.slice(0, sep);
  const typeKey = normalizeTicketTypeKey(rest.slice(sep + 1));
  if (!/^\d{1,9}$/.test(panelRaw) || !typeKey) return null;
  const panelId = Number.parseInt(panelRaw, 10);
  if (!Number.isFinite(panelId) || panelId < 1) return null;
  return { panelId, typeKey };
}

export function ticketOpenCustomId(panelId: number, typeKey: string): string {
  return `${TICKET_OPEN_PREFIX}${panelId}_${typeKey}`.slice(0, 100);
}

export function parseTicketUserMention(raw: string): string | null {
  const trimmed = raw.trim();
  const mention = trimmed.match(/^<@!?(\d{17,20})>$/);
  if (mention) return mention[1];
  if (SNOWFLAKE_RE.test(trimmed)) return trimmed;
  return null;
}

export function normalizeTicketSnowflake(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return parseTicketUserMention(String(value));
}

export function normalizeTicketSnowflakeList(
  value: unknown,
  max = TICKETS_MAX_STAFF_ROLES,
): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const id = normalizeTicketSnowflake(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

export function normalizeTicketPanelButtons(raw: unknown): TicketPanelButton[] {
  if (!Array.isArray(raw)) return [defaultTicketPanelButton()];
  const out: TicketPanelButton[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const typeKey = normalizeTicketTypeKey(obj.typeKey);
    const label =
      typeof obj.label === "string"
        ? obj.label.trim().slice(0, TICKETS_TYPE_LABEL_MAX)
        : "";
    const style = isTicketButtonStyle(obj.style) ? obj.style : "Primary";
    if (!typeKey || !label || seen.has(typeKey)) continue;
    seen.add(typeKey);
    out.push({ typeKey, label, style });
    if (out.length >= TICKETS_MAX_BUTTONS) break;
  }
  return out.length > 0 ? out : [defaultTicketPanelButton()];
}

export function normalizeTicketEmbedColor(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw.toUpperCase();
  if (/^[0-9A-Fa-f]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;
  return TICKET_DEFAULT_EMBED_COLOR;
}
