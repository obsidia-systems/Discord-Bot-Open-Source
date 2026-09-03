/** Contratos Auto-Replies — respuesta a un mensaje por palabra clave. */

export const AUTO_REPLY_MATCH_MODES = [
  "exact",
  "contains",
  "starts_with",
] as const;
export type AutoReplyMatchMode = (typeof AUTO_REPLY_MATCH_MODES)[number];

export const AUTO_REPLY_MATCH_LABEL: Record<AutoReplyMatchMode, string> = {
  exact: "Exact message",
  contains: "Contains",
  starts_with: "Starts with",
};

export const AUTO_REPLY_TRIGGER_MAX = 200;
export const AUTO_REPLY_RESPONSE_MAX = 2000;
export const AUTO_REPLY_CHANNELS_MAX = 50;
export const AUTO_REPLY_COOLDOWN_MAX = 3600;

export interface AutoReply {
  id: number;
  guildId: string;
  trigger: string;
  matchMode: AutoReplyMatchMode;
  response: string;
  enabled: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  useReply: boolean;
  cooldownSeconds: number;
  allowedChannelIds: string[];
  ignoredChannelIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AutoRepliesConfigResponse {
  replies: AutoReply[];
}

export interface CreateAutoReplyRequest {
  trigger: string;
  matchMode?: AutoReplyMatchMode;
  response: string;
  enabled?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  useReply?: boolean;
  cooldownSeconds?: number;
  allowedChannelIds?: string[];
  ignoredChannelIds?: string[];
}

export type UpdateAutoReplyRequest = Partial<CreateAutoReplyRequest>;

export function isAutoReplyMatchMode(
  value: unknown,
): value is AutoReplyMatchMode {
  return value === "exact" || value === "contains" || value === "starts_with";
}

export function clampAutoReplyCooldown(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(AUTO_REPLY_COOLDOWN_MAX, Math.trunc(n));
}

export function normalizeAutoReplyTrigger(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trigger = raw.trim();
  if (!trigger || trigger.length > AUTO_REPLY_TRIGGER_MAX) return null;
  return trigger;
}

export function clampAutoReplyResponse(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text || text.length > AUTO_REPLY_RESPONSE_MAX) return null;
  return text.slice(0, AUTO_REPLY_RESPONSE_MAX);
}

const SNOWFLAKE_RE = /^\d{17,20}$/;

export function normalizeAutoReplyChannelIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!SNOWFLAKE_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= AUTO_REPLY_CHANNELS_MAX) break;
  }
  return out;
}

export function isAutoReplyChannelAllowed(
  channelId: string,
  allowedChannelIds: string[],
  ignoredChannelIds: string[],
): boolean {
  if (ignoredChannelIds.includes(channelId)) return false;
  if (allowedChannelIds.length > 0 && !allowedChannelIds.includes(channelId)) {
    return false;
  }
  return true;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function withCase(text: string, caseSensitive: boolean): string {
  return caseSensitive ? text : text.toLowerCase();
}

/** Palabra completa: no coincide dentro de otra (hola ≠ holanda). */
function containsWholeWord(haystack: string, needle: string): boolean {
  const re = new RegExp(
    `(^|[^\\p{L}\\p{N}_])${escapeRegExp(needle)}([^\\p{L}\\p{N}_]|$)`,
    "u",
  );
  return re.test(haystack);
}

function startsWithWholeWord(haystack: string, needle: string): boolean {
  if (!haystack.startsWith(needle)) return false;
  const rest = haystack.slice(needle.length);
  if (!rest) return true;
  return /^[^\p{L}\p{N}_]/u.test(rest);
}

export function messageMatchesTrigger(input: {
  content: string;
  trigger: string;
  matchMode: AutoReplyMatchMode;
  caseSensitive: boolean;
  wholeWord: boolean;
}): boolean {
  const trigger = withCase(input.trigger.trim(), input.caseSensitive);
  if (!trigger) return false;
  const content = withCase(input.content, input.caseSensitive);

  if (input.matchMode === "exact") {
    return content.trim() === trigger;
  }

  if (input.matchMode === "starts_with") {
    const start = content.trimStart();
    return input.wholeWord
      ? startsWithWholeWord(start, trigger)
      : start.startsWith(trigger);
  }

  if (input.wholeWord) return containsWholeWord(content, trigger);
  return content.includes(trigger);
}

const MATCH_RANK: Record<AutoReplyMatchMode, number> = {
  exact: 0,
  starts_with: 1,
  contains: 2,
};

export function pickMatchingAutoReply(
  replies: readonly AutoReply[],
  content: string,
  channelId: string,
): AutoReply | null {
  const matches: AutoReply[] = [];
  for (const reply of replies) {
    if (!reply.enabled) continue;
    if (
      !isAutoReplyChannelAllowed(
        channelId,
        reply.allowedChannelIds,
        reply.ignoredChannelIds,
      )
    ) {
      continue;
    }
    if (
      !messageMatchesTrigger({
        content,
        trigger: reply.trigger,
        matchMode: reply.matchMode,
        caseSensitive: reply.caseSensitive,
        wholeWord: reply.wholeWord,
      })
    ) {
      continue;
    }
    matches.push(reply);
  }
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const rank = MATCH_RANK[a.matchMode] - MATCH_RANK[b.matchMode];
    if (rank !== 0) return rank;
    const longer = b.trigger.length - a.trigger.length;
    if (longer !== 0) return longer;
    return a.id - b.id;
  });
  return matches[0] ?? null;
}

export function isAutoReplyOnCooldown(
  lastFiredAtMs: number | null | undefined,
  cooldownSeconds: number,
  nowMs: number,
): boolean {
  if (cooldownSeconds <= 0) return false;
  if (lastFiredAtMs == null) return false;
  return nowMs - lastFiredAtMs < cooldownSeconds * 1000;
}

export function applyAutoReplyTokens(
  template: string,
  vars: {
    user: string;
    username: string;
    server: string;
    channel: string;
  },
): string {
  return template
    .split("{username}")
    .join(vars.username)
    .split("{user}")
    .join(vars.user)
    .split("{server}")
    .join(vars.server)
    .split("{channel}")
    .join(vars.channel)
    .slice(0, AUTO_REPLY_RESPONSE_MAX);
}
