/** Contratos Stream Alerts — anuncio al pasar de offline a en directo. */

export const STREAM_ALERT_PLATFORMS = ["twitch", "youtube", "kick"] as const;
export type StreamAlertPlatform = (typeof STREAM_ALERT_PLATFORMS)[number];

export const STREAM_ALERT_PLATFORM_LABEL: Record<StreamAlertPlatform, string> =
  {
    twitch: "Twitch",
    youtube: "YouTube",
    kick: "Kick",
  };

export const STREAM_ALERT_HANDLE_MAX = 128;
export const STREAM_ALERT_TEMPLATE_MAX = 500;
export const STREAM_ALERT_CONTENT_MAX = 2000;
export const STREAM_ALERT_DEFAULT_TEMPLATE =
  "{name} está en directo: {title}\n{url}";

/** Worker tick. Twitch y Kick se comprueban en cada tick. */
export const STREAM_ALERT_POLL_MS = 60_000;
/** YouTube Data API cobra ~100 unidades por search; 5 min por canal. */
export const STREAM_ALERT_YOUTUBE_POLL_MS = 300_000;

/** GuildText. */
export const STREAM_ALERT_TEXT_CHANNEL_TYPE = 0;
/** GuildAnnouncement. */
export const STREAM_ALERT_ANNOUNCE_CHANNEL_TYPE = 5;

export const STREAM_ALERT_EMBED_COLOR: Record<StreamAlertPlatform, number> = {
  twitch: 0x9146ff,
  youtube: 0xff0000,
  kick: 0x53fc18,
};

export interface StreamAlert {
  id: number;
  guildId: string;
  platform: StreamAlertPlatform;
  handle: string;
  displayName: string;
  discordChannelId: string;
  mentionRoleId: string | null;
  template: string;
  enabled: boolean;
  isLive: boolean;
  liveId: string | null;
  lastTitle: string | null;
  lastCheckedAt: string | null;
  lastLiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type StreamAlertCredentials = Record<StreamAlertPlatform, boolean>;

export interface StreamAlertsConfigResponse {
  alerts: StreamAlert[];
  credentials: StreamAlertCredentials;
}

export interface CreateStreamAlertRequest {
  platform: StreamAlertPlatform;
  handle: string;
  discordChannelId: string;
  mentionRoleId?: string | null;
  template?: string;
  enabled?: boolean;
}

export interface UpdateStreamAlertRequest {
  platform?: StreamAlertPlatform;
  handle?: string;
  discordChannelId?: string;
  mentionRoleId?: string | null;
  template?: string;
  enabled?: boolean;
}

export interface StreamLiveSnapshot {
  isLive: boolean;
  liveId: string | null;
  title: string | null;
  displayName: string | null;
  game: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  /** YouTube: channel id UC… resuelto desde @handle. */
  externalId?: string | null;
}

export function isStreamAlertPlatform(
  value: unknown,
): value is StreamAlertPlatform {
  return value === "twitch" || value === "youtube" || value === "kick";
}

export function isStreamAlertDestinationChannelType(type: number): boolean {
  return (
    type === STREAM_ALERT_TEXT_CHANNEL_TYPE ||
    type === STREAM_ALERT_ANNOUNCE_CHANNEL_TYPE
  );
}

export function shouldAnnounceLive(input: {
  isLive: boolean;
  previousLiveId: string | null;
  liveId: string | null;
}): boolean {
  if (!input.isLive || !input.liveId) return false;
  // Mismo liveId = mismo directo (un blip de la API no reanuncia).
  return input.previousLiveId !== input.liveId;
}

export function shouldPollStreamAlert(input: {
  platform: StreamAlertPlatform;
  lastCheckedAt: string | null;
  nowMs: number;
}): boolean {
  if (!input.lastCheckedAt) return true;
  const last = Date.parse(input.lastCheckedAt);
  if (!Number.isFinite(last)) return true;
  const minMs =
    input.platform === "youtube"
      ? STREAM_ALERT_YOUTUBE_POLL_MS
      : STREAM_ALERT_POLL_MS;
  return input.nowMs - last >= minMs * 0.9;
}

export function clampStreamAlertTemplate(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return STREAM_ALERT_DEFAULT_TEMPLATE;
  return text.slice(0, STREAM_ALERT_TEMPLATE_MAX);
}

export function renderStreamAlertTemplate(
  template: string,
  vars: {
    name: string;
    title: string;
    url: string;
    game: string;
    handle: string;
    platform: string;
  },
): string {
  const source = clampStreamAlertTemplate(template);
  const rendered = source
    .replaceAll("{name}", vars.name)
    .replaceAll("{title}", vars.title)
    .replaceAll("{url}", vars.url)
    .replaceAll("{game}", vars.game)
    .replaceAll("{handle}", vars.handle)
    .replaceAll("{platform}", vars.platform);
  return rendered.slice(0, STREAM_ALERT_CONTENT_MAX);
}

const TWITCH_LOGIN_RE = /^[a-z0-9_]{2,25}$/;
const KICK_SLUG_RE = /^[a-z0-9_-]{3,50}$/;
const YOUTUBE_CHANNEL_RE = /^UC[\w-]{20,}$/;
const YOUTUBE_HANDLE_RE = /^@[\w.-]{3,30}$/;

function parseHostPath(raw: string): { host: string; parts: string[] } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const match = withProto.match(/^https?:\/\/([^/?#]+)(\/[^?#]*)?/i);
  if (!match?.[1]) return null;
  const host = match[1].replace(/^www\./i, "").toLowerCase();
  const parts = (match[2] ?? "").split("/").filter(Boolean);
  return { host, parts };
}

export function normalizeStreamHandle(
  platform: StreamAlertPlatform,
  raw: string,
): { handle: string; displayName: string } | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > STREAM_ALERT_HANDLE_MAX) return null;

  if (platform === "twitch") {
    const looksUrl =
      /twitch\.tv/i.test(trimmed) || /^https?:\/\//i.test(trimmed);
    let login = trimmed;
    if (looksUrl) {
      const parsed = parseHostPath(trimmed);
      if (!parsed) return null;
      if (parsed.host !== "twitch.tv") return null;
      login = parsed.parts[0] ?? "";
    }
    login = login.replace(/^@/, "").toLowerCase();
    if (!TWITCH_LOGIN_RE.test(login)) return null;
    return { handle: login, displayName: login };
  }

  if (platform === "kick") {
    const looksUrl =
      /kick\.com/i.test(trimmed) || /^https?:\/\//i.test(trimmed);
    let slug = trimmed;
    if (looksUrl) {
      const parsed = parseHostPath(trimmed);
      if (!parsed) return null;
      if (parsed.host !== "kick.com") return null;
      slug = parsed.parts[0] ?? "";
    }
    slug = slug.replace(/^@/, "").toLowerCase();
    if (!KICK_SLUG_RE.test(slug)) return null;
    return { handle: slug, displayName: slug };
  }

  const looksUrl =
    /youtube\.com|youtu\.be/i.test(trimmed) || /^https?:\/\//i.test(trimmed);
  if (looksUrl) {
    const parsed = parseHostPath(trimmed);
    if (!parsed) return null;
    const host = parsed.host;
    if (host === "youtu.be") return null;
    if (host !== "youtube.com" && host !== "m.youtube.com") return null;
    const parts = parsed.parts;
    if (
      parts[0] === "channel" &&
      parts[1] &&
      YOUTUBE_CHANNEL_RE.test(parts[1])
    ) {
      return { handle: parts[1], displayName: parts[1] };
    }
    if (parts[0]?.startsWith("@")) {
      const handle = `@${parts[0].slice(1)}`;
      if (!YOUTUBE_HANDLE_RE.test(handle)) return null;
      return { handle, displayName: handle.slice(1) };
    }
    return null;
  }

  if (YOUTUBE_CHANNEL_RE.test(trimmed)) {
    return { handle: trimmed, displayName: trimmed };
  }
  const handle = trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
  if (!YOUTUBE_HANDLE_RE.test(handle)) return null;
  return { handle, displayName: handle.slice(1) };
}

export function streamAlertWatchUrl(
  platform: StreamAlertPlatform,
  handle: string,
  liveId?: string | null,
): string {
  if (platform === "twitch") return `https://www.twitch.tv/${handle}`;
  if (platform === "kick") return `https://kick.com/${handle}`;
  if (liveId) return `https://www.youtube.com/watch?v=${liveId}`;
  if (handle.startsWith("UC")) {
    return `https://www.youtube.com/channel/${handle}`;
  }
  const tag = handle.startsWith("@") ? handle : `@${handle}`;
  return `https://www.youtube.com/${tag}`;
}

export function streamAlertMentionPrefix(roleId: string | null): string {
  if (!roleId) return "";
  return `<@&${roleId}> `;
}
