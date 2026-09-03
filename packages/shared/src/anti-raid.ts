/** Contratos Anti-Raid — joins masivos y lockdown. Anti-Nuke es Pro. */

export const ANTI_RAID_JOIN_COUNT_MIN = 3;
export const ANTI_RAID_JOIN_COUNT_MAX = 50;
export const ANTI_RAID_JOIN_COUNT_DEFAULT = 10;
export const ANTI_RAID_WINDOW_MIN = 3;
export const ANTI_RAID_WINDOW_MAX = 120;
export const ANTI_RAID_WINDOW_DEFAULT = 10;
export const ANTI_RAID_AGE_DAYS_MIN = 1;
export const ANTI_RAID_AGE_DAYS_MAX = 365;
export const ANTI_RAID_AGE_DAYS_DEFAULT = 7;
export const ANTI_RAID_TIMEOUT_MIN = 60;
export const ANTI_RAID_TIMEOUT_MAX = 28 * 24 * 60 * 60;
export const ANTI_RAID_TIMEOUT_DEFAULT = 3600;
export const ANTI_RAID_WHITELIST_MAX = 50;
export const ANTI_RAID_NUKE_THRESHOLD_MIN = 1;
export const ANTI_RAID_NUKE_THRESHOLD_MAX = 50;
export const ANTI_RAID_NUKE_WINDOW_DEFAULT = 10;

export const RAID_JOIN_ACTIONS = ["kick", "ban", "lockdown"] as const;
export type RaidJoinAction = (typeof RAID_JOIN_ACTIONS)[number];

export const RAID_AGE_ACTIONS = ["kick", "timeout"] as const;
export type RaidAgeAction = (typeof RAID_AGE_ACTIONS)[number];

export const RAID_LOCKDOWN_JOIN_ACTIONS = ["kick", "timeout", "none"] as const;
export type RaidLockdownJoinAction =
  (typeof RAID_LOCKDOWN_JOIN_ACTIONS)[number];

export const NUKE_PUNISHMENTS = ["strip", "kick", "ban"] as const;
export type NukePunishment = (typeof NUKE_PUNISHMENTS)[number];

export const NUKE_ACTIONS = [
  "channelCreate",
  "channelDelete",
  "roleCreate",
  "roleDelete",
  "memberBan",
  "memberKick",
  "botAdd",
  "webhookCreate",
] as const;
export type NukeAction = (typeof NUKE_ACTIONS)[number];

export type NukeThresholds = Record<NukeAction, number>;

export type NewMemberVerdict =
  | "allow"
  | "kick"
  | "ban"
  | "timeout"
  | "lockdown";

export interface AntiRaidSettings {
  guildId: string;
  enabled: boolean;
  alertChannelId: string | null;
  joinFloodEnabled: boolean;
  joinCount: number;
  joinWindowSeconds: number;
  joinAction: RaidJoinAction;
  accountAgeEnabled: boolean;
  accountAgeDays: number;
  accountAgeAction: RaidAgeAction;
  lockdownJoinAction: RaidLockdownJoinAction;
  timeoutSeconds: number;
  whitelistRoleIds: string[];
  nukeEnabled: boolean;
  nukeWindowSeconds: number;
  nukePunishment: NukePunishment;
  nukeThresholds: NukeThresholds;
  nukeWhitelistUserIds: string[];
  nukeWhitelistRoleIds: string[];
  lockdownActive: boolean;
  lockdownStartedAt: string | null;
  updatedAt: string;
}

export interface AntiRaidConfigResponse {
  settings: AntiRaidSettings;
  nukeAvailable: boolean;
}

export interface UpdateAntiRaidSettingsRequest {
  enabled?: boolean;
  alertChannelId?: string | null;
  joinFloodEnabled?: boolean;
  joinCount?: number;
  joinWindowSeconds?: number;
  joinAction?: RaidJoinAction;
  accountAgeEnabled?: boolean;
  accountAgeDays?: number;
  accountAgeAction?: RaidAgeAction;
  lockdownJoinAction?: RaidLockdownJoinAction;
  timeoutSeconds?: number;
  whitelistRoleIds?: string[];
  nukeEnabled?: boolean;
  nukeWindowSeconds?: number;
  nukePunishment?: NukePunishment;
  nukeThresholds?: Partial<NukeThresholds>;
  nukeWhitelistUserIds?: string[];
  nukeWhitelistRoleIds?: string[];
}

export interface LockdownOverwriteSnapshot {
  channelId: string;
  existed: boolean;
  allow: string;
  deny: string;
}

export function defaultNukeThresholds(): NukeThresholds {
  return {
    channelCreate: 3,
    channelDelete: 3,
    roleCreate: 3,
    roleDelete: 3,
    memberBan: 5,
    memberKick: 5,
    botAdd: 2,
    webhookCreate: 3,
  };
}

function clampInt(
  raw: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function clampJoinCount(raw: unknown): number {
  return clampInt(
    raw,
    ANTI_RAID_JOIN_COUNT_MIN,
    ANTI_RAID_JOIN_COUNT_MAX,
    ANTI_RAID_JOIN_COUNT_DEFAULT,
  );
}

export function clampRaidWindowSeconds(raw: unknown): number {
  return clampInt(
    raw,
    ANTI_RAID_WINDOW_MIN,
    ANTI_RAID_WINDOW_MAX,
    ANTI_RAID_WINDOW_DEFAULT,
  );
}

export function clampAccountAgeDays(raw: unknown): number {
  return clampInt(
    raw,
    ANTI_RAID_AGE_DAYS_MIN,
    ANTI_RAID_AGE_DAYS_MAX,
    ANTI_RAID_AGE_DAYS_DEFAULT,
  );
}

export function clampRaidTimeoutSeconds(raw: unknown): number {
  return clampInt(
    raw,
    ANTI_RAID_TIMEOUT_MIN,
    ANTI_RAID_TIMEOUT_MAX,
    ANTI_RAID_TIMEOUT_DEFAULT,
  );
}

export function clampNukeThreshold(raw: unknown, fallback: number): number {
  return clampInt(
    raw,
    ANTI_RAID_NUKE_THRESHOLD_MIN,
    ANTI_RAID_NUKE_THRESHOLD_MAX,
    fallback,
  );
}

export function isRaidJoinAction(value: unknown): value is RaidJoinAction {
  return (
    typeof value === "string" &&
    (RAID_JOIN_ACTIONS as readonly string[]).includes(value)
  );
}

export function isRaidAgeAction(value: unknown): value is RaidAgeAction {
  return (
    typeof value === "string" &&
    (RAID_AGE_ACTIONS as readonly string[]).includes(value)
  );
}

export function isRaidLockdownJoinAction(
  value: unknown,
): value is RaidLockdownJoinAction {
  return (
    typeof value === "string" &&
    (RAID_LOCKDOWN_JOIN_ACTIONS as readonly string[]).includes(value)
  );
}

export function isNukePunishment(value: unknown): value is NukePunishment {
  return (
    typeof value === "string" &&
    (NUKE_PUNISHMENTS as readonly string[]).includes(value)
  );
}

export function normalizeNukeThresholds(raw: unknown): NukeThresholds {
  const defaults = defaultNukeThresholds();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;
  const obj = raw as Record<string, unknown>;
  const next = { ...defaults };
  for (const key of NUKE_ACTIONS) {
    if (obj[key] !== undefined)
      next[key] = clampNukeThreshold(obj[key], defaults[key]);
  }
  return next;
}

export function normalizeIdList(
  raw: unknown,
  max = ANTI_RAID_WHITELIST_MAX,
): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!/^\d{17,20}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

export function parseUserIdList(raw: string): string[] {
  return normalizeIdList(raw.split(/[\s,;]+/));
}

export function defaultAntiRaidSettings(guildId: string): AntiRaidSettings {
  return {
    guildId,
    enabled: false,
    alertChannelId: null,
    joinFloodEnabled: true,
    joinCount: ANTI_RAID_JOIN_COUNT_DEFAULT,
    joinWindowSeconds: ANTI_RAID_WINDOW_DEFAULT,
    joinAction: "kick",
    accountAgeEnabled: false,
    accountAgeDays: ANTI_RAID_AGE_DAYS_DEFAULT,
    accountAgeAction: "kick",
    lockdownJoinAction: "timeout",
    timeoutSeconds: ANTI_RAID_TIMEOUT_DEFAULT,
    whitelistRoleIds: [],
    nukeEnabled: false,
    nukeWindowSeconds: ANTI_RAID_NUKE_WINDOW_DEFAULT,
    nukePunishment: "strip",
    nukeThresholds: defaultNukeThresholds(),
    nukeWhitelistUserIds: [],
    nukeWhitelistRoleIds: [],
    lockdownActive: false,
    lockdownStartedAt: null,
    updatedAt: new Date(0).toISOString(),
  };
}

export function accountAgeTooNew(
  createdTimestamp: number,
  minDays: number,
  now: number,
): boolean {
  const days = clampAccountAgeDays(minDays);
  return now - createdTimestamp < days * 86_400_000;
}

export function pruneJoinTimestamps(
  timestamps: readonly number[],
  now: number,
  windowMs: number,
): number[] {
  return timestamps.filter((stamp) => now - stamp <= windowMs);
}

export function joinFloodTriggered(
  timestamps: readonly number[],
  threshold: number,
  windowMs: number,
  now: number,
): boolean {
  const recent = pruneJoinTimestamps(timestamps, now, windowMs);
  return recent.length >= clampJoinCount(threshold);
}

export function recordAndCount(
  timestamps: readonly number[],
  now: number,
  windowMs: number,
): { next: number[]; count: number } {
  const next = [...pruneJoinTimestamps(timestamps, now, windowMs), now];
  return { next, count: next.length };
}

export function isAntiRaidImmune(input: {
  userId: string;
  ownerId: string;
  botId: string | null;
  memberRoleIds: readonly string[];
  whitelistUserIds: readonly string[];
  whitelistRoleIds: readonly string[];
}): boolean {
  if (input.userId === input.ownerId) return true;
  if (input.botId && input.userId === input.botId) return true;
  if (input.whitelistUserIds.includes(input.userId)) return true;
  return input.memberRoleIds.some((id) => input.whitelistRoleIds.includes(id));
}

export function decideNewMemberAction(input: {
  enabled: boolean;
  immune: boolean;
  lockdownActive: boolean;
  lockdownJoinAction: RaidLockdownJoinAction;
  accountAgeEnabled: boolean;
  accountTooNew: boolean;
  accountAgeAction: RaidAgeAction;
  joinFloodEnabled: boolean;
  flood: boolean;
  joinAction: RaidJoinAction;
}): NewMemberVerdict {
  if (!input.enabled || input.immune) return "allow";
  if (input.lockdownActive) {
    if (input.lockdownJoinAction === "none") return "allow";
    return input.lockdownJoinAction;
  }
  if (input.accountAgeEnabled && input.accountTooNew)
    return input.accountAgeAction;
  if (input.joinFloodEnabled && input.flood) return input.joinAction;
  return "allow";
}

export function nukeThresholdExceeded(
  count: number,
  threshold: number,
): boolean {
  return count >= clampNukeThreshold(threshold, threshold);
}

const SUB = 1;
const STRING = 3;

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

/** Cuerpo REST de `/lockdown`. Manage Guild. El PUT global lo incluye. */
export function antiRaidLockdownSlashCommandBody(): {
  name: string;
  description: string;
  default_member_permissions: string;
  options: Array<Record<string, unknown>>;
} {
  return {
    name: "lockdown",
    description: "Locks down the server during a raid (Anti-Raid).",
    default_member_permissions: "32",
    options: [
      sub("on", "Enable the emergency lockdown.", [
        {
          type: STRING,
          name: "razon",
          description: "Reason for the audit log.",
          required: false,
          max_length: 200,
        },
      ]),
      sub("off", "Remove the lockdown and restore @everyone."),
      sub("status", "Tells whether the lockdown is active."),
    ],
  };
}
