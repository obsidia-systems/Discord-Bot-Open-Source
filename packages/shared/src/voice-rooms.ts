/** Contratos Voice Rooms — salas de voz temporales (join to create). */

export const VOICE_ROOM_NAME_MAX = 100;
export const VOICE_ROOM_USER_LIMIT_MAX = 99;
export const VOICE_ROOM_EMPTY_GRACE_MS = 5_000;
export const VOICE_ROOM_GENERATORS_MAX = 25;
export const VOICE_ROOM_STATUS_MAX = 500;
export const VOICE_ROOM_BITRATE_MIN_KBPS = 8;

/** GuildVoice. */
export const VOICE_HUB_CHANNEL_TYPE = 2;
/** GuildCategory. */
export const VOICE_CATEGORY_CHANNEL_TYPE = 4;

export const VOICE_ROOM_DEFAULT_TEMPLATE = "{user}'s room";

export const VOICE_ROOM_ACTIONS = [
  "name",
  "limit",
  "lock",
  "claim",
  "permit",
  "reject",
  "transfer",
  "ghost",
  "bitrate",
  "text",
  "invite",
  "status",
] as const;

export type VoiceRoomAction = (typeof VOICE_ROOM_ACTIONS)[number];

export type VoiceRoomActionMap = Record<VoiceRoomAction, boolean>;

export const VOICE_ROOM_ACTION_LABELS: Record<VoiceRoomAction, string> = {
  name: "Name",
  limit: "Limit",
  lock: "Lock / unlock",
  claim: "Claim",
  permit: "Permit",
  reject: "Reject",
  transfer: "Transfer owner",
  ghost: "Ghost / unghost",
  bitrate: "Bitrate",
  text: "Text channel",
  invite: "Invite",
  status: "Status",
};

export function defaultVoiceRoomActions(): VoiceRoomActionMap {
  return {
    name: true,
    limit: true,
    lock: true,
    claim: true,
    permit: true,
    reject: true,
    transfer: true,
    ghost: true,
    bitrate: true,
    text: true,
    invite: true,
    status: true,
  };
}

export function normalizeVoiceRoomActions(raw: unknown): VoiceRoomActionMap {
  const defaults = defaultVoiceRoomActions();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;
  const obj = raw as Record<string, unknown>;
  const next = { ...defaults };
  for (const key of VOICE_ROOM_ACTIONS) {
    if (typeof obj[key] === "boolean") next[key] = obj[key];
  }
  return next;
}

export function isVoiceRoomActionAllowed(
  allowed: VoiceRoomActionMap,
  action: VoiceRoomAction,
): boolean {
  return allowed[action] !== false;
}

export function sanitizeVoiceRoomName(raw: string): string {
  const cleaned = raw
    .replace(/[\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const sliced = cleaned.slice(0, VOICE_ROOM_NAME_MAX);
  return sliced.length > 0 ? sliced : "room";
}

export function applyVoiceRoomNameTemplate(
  template: string,
  ctx: { displayName: string; username: string },
): string {
  const user = (ctx.displayName.trim() || ctx.username.trim() || "room").slice(
    0,
    80,
  );
  const source =
    template.trim().length > 0 ? template : VOICE_ROOM_DEFAULT_TEMPLATE;
  const rendered = source
    .replaceAll("{user}", user)
    .replaceAll("{username}", ctx.username.trim() || user);
  return sanitizeVoiceRoomName(rendered);
}

export function isVoiceRoomHub(
  channelId: string,
  hubChannelIds: readonly string[],
): boolean {
  return hubChannelIds.includes(channelId);
}

/** Si el dueño ya tiene sala, no se crea otra. */
export function existingOwnerRoomId(
  ownerId: string,
  rooms: ReadonlyArray<{ ownerId: string; channelId: string }>,
): string | null {
  return rooms.find((row) => row.ownerId === ownerId)?.channelId ?? null;
}

export function canClaimVoiceRoom(input: {
  ownerId: string;
  actorId: string;
  ownerInChannel: boolean;
}): boolean {
  if (input.actorId === input.ownerId) return false;
  return !input.ownerInChannel;
}

export function clampVoiceUserLimit(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  const n = Math.trunc(raw);
  if (n <= 0) return 0;
  return Math.min(VOICE_ROOM_USER_LIMIT_MAX, n);
}

/** `guildMaxBps` es Guild#maximumBitrate (bits/s). Devuelve kbps. */
export function clampVoiceBitrateKbps(
  requestedKbps: number,
  guildMaxBps: number,
): number {
  const maxKbps = Math.max(
    VOICE_ROOM_BITRATE_MIN_KBPS,
    Math.floor(guildMaxBps / 1000),
  );
  if (!Number.isFinite(requestedKbps)) {
    return Math.min(64, maxKbps);
  }
  const n = Math.trunc(requestedKbps);
  return Math.min(maxKbps, Math.max(VOICE_ROOM_BITRATE_MIN_KBPS, n));
}

export function isVoiceHubChannelType(type: number): boolean {
  return type === VOICE_HUB_CHANNEL_TYPE;
}

export function isVoiceCategoryChannelType(type: number): boolean {
  return type === VOICE_CATEGORY_CHANNEL_TYPE;
}

/** Prefijo de select in-channel. */
export const VOICE_ROOM_SELECT_PREFIX = "vr_act_";

export interface VoiceRoomGenerator {
  id: number;
  guildId: string;
  hubChannelId: string;
  categoryId: string | null;
  nameTemplate: string;
  defaultUserLimit: number;
  defaultBitrate: number;
  autoText: boolean;
  enabled: boolean;
  allowedActions: VoiceRoomActionMap;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceRoomLive {
  channelId: string;
  guildId: string;
  generatorId: number;
  ownerId: string;
  textChannelId: string | null;
  locked: boolean;
  ghosted: boolean;
  createdAt: string;
}

export interface VoiceRoomsConfigResponse {
  generators: VoiceRoomGenerator[];
  rooms: VoiceRoomLive[];
}

export interface UpsertVoiceRoomGeneratorRequest {
  hubChannelId: string;
  categoryId?: string | null;
  nameTemplate?: string;
  defaultUserLimit?: number;
  defaultBitrate?: number;
  autoText?: boolean;
  enabled?: boolean;
  allowedActions?: Partial<VoiceRoomActionMap>;
}

export interface UpdateVoiceRoomGeneratorRequest {
  hubChannelId?: string;
  categoryId?: string | null;
  nameTemplate?: string;
  defaultUserLimit?: number;
  defaultBitrate?: number;
  autoText?: boolean;
  enabled?: boolean;
  allowedActions?: Partial<VoiceRoomActionMap>;
}

const SUB = 1;
const STRING = 3;
const INTEGER = 4;
const USER = 6;
const ROLE = 8;

function sub(
  name: string,
  description: string,
  options: Array<Record<string, unknown>> = [],
): Record<string, unknown> {
  return {
    type: SUB,
    name,
    description: description.slice(0, 100),
    ...(options.length ? { options } : {}),
  };
}

/** Cuerpo REST de `/voice` (subcomandos). El PUT global lo incluye. */
export function voiceRoomsSlashCommandBody(): {
  name: string;
  description: string;
  options: Array<Record<string, unknown>>;
} {
  return {
    name: "voice",
    description: "Manage your temporary voice room (Voice Rooms).",
    options: [
      sub("name", "Change your room's name.", [
        {
          type: STRING,
          name: "nombre",
          description: "New name.",
          required: true,
          max_length: VOICE_ROOM_NAME_MAX,
        },
      ]),
      sub("limit", "User limit (0 = no limit).", [
        {
          type: INTEGER,
          name: "limite",
          description: "0–99.",
          required: true,
          min_value: 0,
          max_value: VOICE_ROOM_USER_LIMIT_MAX,
        },
      ]),
      sub("lock", "Close the room to new people."),
      sub("unlock", "Open the room again."),
      sub("claim", "Take ownership if the previous owner left."),
      sub("permit", "Let a user or role in.", [
        {
          type: USER,
          name: "usuario",
          description: "Member to permit.",
          required: false,
        },
        {
          type: ROLE,
          name: "rol",
          description: "Role to permit.",
          required: false,
        },
      ]),
      sub("reject", "Block and remove a user or role.", [
        {
          type: USER,
          name: "usuario",
          description: "Member to reject.",
          required: false,
        },
        {
          type: ROLE,
          name: "rol",
          description: "Role to reject.",
          required: false,
        },
      ]),
      sub("transfer", "Pass ownership to another member.", [
        {
          type: USER,
          name: "usuario",
          description: "New owner.",
          required: true,
        },
      ]),
      sub("ghost", "Hide the room from the list."),
      sub("unghost", "Show the room again."),
      sub("bitrate", "Audio quality (kbps).", [
        {
          type: INTEGER,
          name: "kbps",
          description: "8 to server maximum.",
          required: true,
          min_value: VOICE_ROOM_BITRATE_MIN_KBPS,
          max_value: 384,
        },
      ]),
      sub("text", "Create a text channel linked to the room."),
      sub("invite", "Invite someone with a link.", [
        {
          type: USER,
          name: "usuario",
          description: "Who to invite.",
          required: true,
        },
        {
          type: STRING,
          name: "mensaje",
          description: "Extra text (optional).",
          required: false,
          max_length: 200,
        },
      ]),
      sub("status", "Visible room status.", [
        {
          type: STRING,
          name: "texto",
          description: "What is happening.",
          required: true,
          max_length: VOICE_ROOM_STATUS_MAX,
        },
      ]),
    ],
  };
}
