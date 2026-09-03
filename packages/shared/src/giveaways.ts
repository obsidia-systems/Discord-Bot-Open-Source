/** Contratos Giveaways — la urna es Postgres; el mensaje de Discord es el anuncio. */

export const GIVEAWAY_STATUSES = [
  "scheduled",
  "running",
  "ended",
  "cancelled",
] as const;
export type GiveawayStatus = (typeof GIVEAWAY_STATUSES)[number];

export const GIVEAWAY_ACTIONS = ["start", "end", "cancel", "reroll"] as const;
export type GiveawayAction = (typeof GIVEAWAY_ACTIONS)[number];

export const GIVEAWAY_STATUS_LABEL: Record<GiveawayStatus, string> = {
  scheduled: "Programado",
  running: "En curso",
  ended: "Terminado",
  cancelled: "Cancelado",
};

export const GIVEAWAYS_MAX_RUNNING = 25;
export const GIVEAWAYS_MAX_WINNERS = 20;
export const GIVEAWAYS_DEFAULT_WINNERS = 1;
export const GIVEAWAYS_PRIZE_MAX = 256;
export const GIVEAWAYS_DESCRIPTION_MAX = 1024;
export const GIVEAWAYS_LIST_MAX = 100;
export const GIVEAWAYS_MAX_ROLES = 20;
export const GIVEAWAYS_AGE_DAYS_MAX = 365;
export const GIVEAWAY_DURATION_MIN_MS = 60_000;
export const GIVEAWAY_DURATION_MAX_MS = 30 * 24 * 60 * 60 * 1000;
export const GIVEAWAY_DURATION_DEFAULT_MS = 60 * 60 * 1000;

export const GIVEAWAY_JOIN_PREFIX = "giveaway_join_";

const SNOWFLAKE_RE = /^\d{17,20}$/;

export interface GiveawaySettings {
  guildId: string;
  managerRoleIds: string[];
  dmWinners: boolean;
  pingRoleId: string | null;
  updatedAt: string;
}

export interface Giveaway {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string | null;
  prize: string;
  description: string;
  winnerCount: number;
  status: GiveawayStatus;
  startsAt: string;
  endsAt: string;
  endedAt: string | null;
  createdBy: string;
  requiredRoleIds: string[];
  blockedRoleIds: string[];
  minGuildAgeDays: number;
  minAccountAgeDays: number;
  winnerIds: string[];
  pastWinnerIds: string[];
  entryCount: number;
  createdAt: string;
}

export interface GiveawayDetail extends Giveaway {
  entries: GiveawayEntry[];
}

export interface GiveawayEntry {
  userId: string;
  enteredAt: string;
}

export interface GiveawaySettingsResponse {
  settings: GiveawaySettings;
}

export interface GiveawayListResponse {
  giveaways: Giveaway[];
}

export interface GiveawayDetailResponse {
  giveaway: GiveawayDetail;
}

export interface UpdateGiveawaySettingsRequest {
  managerRoleIds?: string[];
  dmWinners?: boolean;
  pingRoleId?: string | null;
}

export interface CreateGiveawayRequest {
  channelId: string;
  prize: string;
  description?: string;
  winnerCount?: number;
  durationMinutes?: number;
  startsAt?: string | null;
  requiredRoleIds?: string[];
  blockedRoleIds?: string[];
  minGuildAgeDays?: number;
  minAccountAgeDays?: number;
}

export type GiveawayRandomInt = (maxExclusive: number) => number;

export function defaultGiveawaySettings(guildId = ""): GiveawaySettings {
  return {
    guildId,
    managerRoleIds: [],
    dmWinners: true,
    pingRoleId: null,
    updatedAt: new Date(0).toISOString(),
  };
}

export function isGiveawayStatus(value: unknown): value is GiveawayStatus {
  return (
    value === "scheduled" ||
    value === "running" ||
    value === "ended" ||
    value === "cancelled"
  );
}

export function isGiveawayAction(value: unknown): value is GiveawayAction {
  return (
    value === "start" ||
    value === "end" ||
    value === "cancel" ||
    value === "reroll"
  );
}

export function canEnterGiveaway(status: GiveawayStatus): boolean {
  return status === "running";
}

/**
 * Transición. reroll se queda en ended. Devuelve null si es ilegal.
 */
export function giveawayStatusAfter(
  status: GiveawayStatus,
  action: GiveawayAction,
): GiveawayStatus | null {
  switch (action) {
    case "start":
      return status === "scheduled" ? "running" : null;
    case "end":
      return status === "running" ? "ended" : null;
    case "cancel":
      return status === "scheduled" || status === "running"
        ? "cancelled"
        : null;
    case "reroll":
      return status === "ended" ? "ended" : null;
    default:
      return null;
  }
}

export function canApplyGiveawayAction(
  status: GiveawayStatus,
  action: GiveawayAction,
): boolean {
  return giveawayStatusAfter(status, action) !== null;
}

export function clampGiveawayWinnerCount(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : Number.NaN;
  if (!Number.isFinite(n) || n < 1) return GIVEAWAYS_DEFAULT_WINNERS;
  return Math.min(GIVEAWAYS_MAX_WINNERS, Math.trunc(n));
}

export function clampGiveawayAgeDays(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(GIVEAWAYS_AGE_DAYS_MAX, Math.trunc(n));
}

export function clampGiveawayDurationMs(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : Number.NaN;
  if (!Number.isFinite(n) || n < GIVEAWAY_DURATION_MIN_MS) {
    return GIVEAWAY_DURATION_MIN_MS;
  }
  return Math.min(GIVEAWAY_DURATION_MAX_MS, Math.trunc(n));
}

export function durationMsFromMinutes(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : Number.NaN;
  if (!Number.isFinite(n) || n < 1) {
    return GIVEAWAY_DURATION_DEFAULT_MS;
  }
  return clampGiveawayDurationMs(Math.trunc(n) * 60_000);
}

export function giveawayRunningBlocked(runningCount: number): boolean {
  return runningCount >= GIVEAWAYS_MAX_RUNNING;
}

export function isGiveawayManager(input: {
  memberRoleIds: readonly string[];
  managerRoleIds: readonly string[];
  manageGuild: boolean;
}): boolean {
  if (input.manageGuild) return true;
  if (input.managerRoleIds.length === 0) return false;
  const staff = new Set(input.managerRoleIds);
  return input.memberRoleIds.some((id) => staff.has(id));
}

export function giveawayEntryGateReason(input: {
  memberRoleIds: readonly string[];
  requiredRoleIds: readonly string[];
  blockedRoleIds: readonly string[];
  accountCreatedAt: Date | null;
  guildJoinedAt: Date | null;
  minAccountAgeDays: number;
  minGuildAgeDays: number;
  now?: Date;
}): string | null {
  const now = input.now ?? new Date();
  const blocked = new Set(input.blockedRoleIds);
  if (input.memberRoleIds.some((id) => blocked.has(id))) {
    return "Your role can't enter this giveaway.";
  }
  if (input.requiredRoleIds.length > 0) {
    const have = new Set(input.memberRoleIds);
    const missing = input.requiredRoleIds.some((id) => !have.has(id));
    if (missing) {
      return "You don't have the required role to enter.";
    }
  }
  const accountDays = clampGiveawayAgeDays(input.minAccountAgeDays);
  if (accountDays > 0) {
    if (!input.accountCreatedAt) {
      return "I couldn't check your account age.";
    }
    const ageMs = now.getTime() - input.accountCreatedAt.getTime();
    if (ageMs < accountDays * 86_400_000) {
      return `Your account must be at least ${accountDays} day(s) old.`;
    }
  }
  const guildDays = clampGiveawayAgeDays(input.minGuildAgeDays);
  if (guildDays > 0) {
    if (!input.guildJoinedAt) {
      return "I couldn't check when you joined the server.";
    }
    const ageMs = now.getTime() - input.guildJoinedAt.getTime();
    if (ageMs < guildDays * 86_400_000) {
      return `You must have been in the server for at least ${guildDays} day(s).`;
    }
  }
  return null;
}

function webCryptoRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  const cryptoObj = (
    globalThis as {
      crypto?: { getRandomValues: (arr: Uint32Array) => Uint32Array };
    }
  ).crypto;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== "function") {
    throw new Error("No CSPRNG available.");
  }
  const limit = 0x1_0000_0000;
  const threshold = limit - (limit % maxExclusive);
  const buf = new Uint32Array(1);
  let x = 0;
  do {
    cryptoObj.getRandomValues(buf);
    x = buf[0] ?? 0;
  } while (x >= threshold);
  return x % maxExclusive;
}

/**
 * Fisher-Yates parcial. `randomInt(n)` debe devolver [0, n).
 * Por defecto usa Web Crypto (sin sesgo de módulo).
 */
export function pickGiveawayWinners(
  entryIds: readonly string[],
  count: number,
  exclude: readonly string[] = [],
  randomInt: GiveawayRandomInt = webCryptoRandomInt,
): string[] {
  const banned = new Set(exclude);
  const seen = new Set<string>();
  const pool: string[] = [];
  for (const id of entryIds) {
    if (!id || banned.has(id) || seen.has(id)) continue;
    seen.add(id);
    pool.push(id);
  }
  const n = Math.min(clampGiveawayWinnerCount(count), pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + randomInt(pool.length - i);
    const a = pool[i];
    const b = pool[j];
    if (a === undefined || b === undefined) break;
    pool[i] = b;
    pool[j] = a;
  }
  return pool.slice(0, n);
}

export function normalizeGiveawayPrize(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const prize = value.trim().slice(0, GIVEAWAYS_PRIZE_MAX);
  return prize.length > 0 ? prize : null;
}

export function normalizeGiveawayDescription(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, GIVEAWAYS_DESCRIPTION_MAX);
}

export function normalizeGiveawaySnowflake(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const id = String(value).trim();
  if (!SNOWFLAKE_RE.test(id)) return null;
  return id;
}

export function normalizeGiveawaySnowflakeList(
  value: unknown,
  max = GIVEAWAYS_MAX_ROLES,
): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const id = normalizeGiveawaySnowflake(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

export function parseGiveawayRecordId(
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

export function parseGiveawayWinnerIds(raw: unknown): string[] {
  if (typeof raw === "string") {
    try {
      return normalizeGiveawaySnowflakeList(JSON.parse(raw) as unknown, 100);
    } catch {
      return [];
    }
  }
  return normalizeGiveawaySnowflakeList(raw, 100);
}
