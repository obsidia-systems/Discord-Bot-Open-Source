import type { StreamLiveSnapshot } from "@adobos/shared";
import { streamAlertWatchUrl } from "@adobos/shared";
import { logger } from "../../core/log.js";

const FETCH_MS = 8_000;
const UA =
  "Mozilla/5.0 (compatible; AdobosBot/0.1; +https://github.com)";

let twitchToken: { value: string; expiresAt: number } | null = null;
let twitchWarnAt = 0;
let youtubeWarnAt = 0;

function twitchConfigured(): boolean {
  return Boolean(
    process.env.TWITCH_CLIENT_ID?.trim() &&
      process.env.TWITCH_CLIENT_SECRET?.trim(),
  );
}

function youtubeKey(): string | null {
  return process.env.YOUTUBE_API_KEY?.trim() || null;
}

async function fetchJson(
  url: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": UA,
      ...init.headers,
    },
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!response.ok) {
    const err = new Error(`HTTP ${response.status}`) as Error & {
      status: number;
    };
    err.status = response.status;
    throw err;
  }
  return (await response.json()) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function twitchThumb(raw: string | null): string | null {
  if (!raw) return null;
  return raw.replace("{width}", "320").replace("{height}", "180");
}

export function parseTwitchStreamsPayload(
  json: unknown,
): Map<string, StreamLiveSnapshot> {
  const out = new Map<string, StreamLiveSnapshot>();
  const root = asRecord(json);
  const data = root?.data;
  if (!Array.isArray(data)) return out;
  for (const item of data) {
    const row = asRecord(item);
    if (!row) continue;
    const login = asString(row.user_login)?.toLowerCase();
    const liveId = asString(row.id);
    if (!login || !liveId) continue;
    const displayName = asString(row.user_name) ?? login;
    out.set(login, {
      isLive: true,
      liveId,
      title: asString(row.title),
      displayName,
      game: asString(row.game_name),
      url: streamAlertWatchUrl("twitch", login),
      thumbnailUrl: twitchThumb(asString(row.thumbnail_url)),
    });
  }
  return out;
}

export function parseKickChannelPayload(
  slug: string,
  json: unknown,
): StreamLiveSnapshot {
  const offline: StreamLiveSnapshot = {
    isLive: false,
    liveId: null,
    title: null,
    displayName: slug,
    game: null,
    url: streamAlertWatchUrl("kick", slug),
    thumbnailUrl: null,
  };
  const root = asRecord(json);
  if (!root) return offline;
  const user = asRecord(root.user);
  const displayName = asString(user?.username) ?? slug;
  const live = asRecord(root.livestream);
  if (!live) return { ...offline, displayName };
  const liveId =
    asString(live.id) ??
    (typeof live.id === "number" ? String(live.id) : null);
  if (!liveId) return { ...offline, displayName };
  const categories = live.categories;
  let game: string | null = null;
  if (Array.isArray(categories)) {
    const first = asRecord(categories[0]);
    game = asString(first?.name);
  }
  const thumb = asRecord(live.thumbnail);
  return {
    isLive: true,
    liveId,
    title: asString(live.session_title) ?? asString(live.title),
    displayName,
    game,
    url: streamAlertWatchUrl("kick", slug),
    thumbnailUrl: asString(thumb?.url) ?? asString(live.thumbnail),
  };
}

export function parseYouTubeSearchPayload(
  json: unknown,
  handle: string,
): StreamLiveSnapshot {
  const offline: StreamLiveSnapshot = {
    isLive: false,
    liveId: null,
    title: null,
    displayName: handle.startsWith("@") ? handle.slice(1) : handle,
    game: null,
    url: streamAlertWatchUrl("youtube", handle),
    thumbnailUrl: null,
  };
  const root = asRecord(json);
  const items = root?.items;
  if (!Array.isArray(items) || items.length === 0) return offline;
  const first = asRecord(items[0]);
  const id = asRecord(first?.id);
  const snippet = asRecord(first?.snippet);
  const liveId = asString(id?.videoId);
  if (!liveId || !snippet) return offline;
  const thumbs = asRecord(snippet.thumbnails);
  const high = asRecord(thumbs?.high) ?? asRecord(thumbs?.medium);
  return {
    isLive: true,
    liveId,
    title: asString(snippet.title),
    displayName: asString(snippet.channelTitle) ?? offline.displayName,
    game: null,
    url: streamAlertWatchUrl("youtube", handle, liveId),
    thumbnailUrl: asString(high?.url),
  };
}

export function parseYouTubeChannelId(json: unknown): string | null {
  const root = asRecord(json);
  const items = root?.items;
  if (!Array.isArray(items) || items.length === 0) return null;
  const first = asRecord(items[0]);
  return asString(first?.id);
}

async function twitchAppToken(): Promise<string | null> {
  const clientId = process.env.TWITCH_CLIENT_ID?.trim();
  const secret = process.env.TWITCH_CLIENT_SECRET?.trim();
  if (!clientId || !secret) return null;
  const now = Date.now();
  if (twitchToken && twitchToken.expiresAt > now + 60_000) {
    return twitchToken.value;
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: secret,
    grant_type: "client_credentials",
  });
  const json = asRecord(
    await fetchJson("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }),
  );
  const token = asString(json?.access_token);
  const expiresIn =
    typeof json?.expires_in === "number" ? json.expires_in : 3600;
  if (!token) return null;
  twitchToken = { value: token, expiresAt: now + expiresIn * 1000 };
  return token;
}

export async function fetchTwitchLiveMap(
  logins: string[],
): Promise<{ ok: true; map: Map<string, StreamLiveSnapshot> } | { ok: false }> {
  const empty = new Map<string, StreamLiveSnapshot>();
  if (logins.length === 0) return { ok: true, map: empty };
  if (!twitchConfigured()) return { ok: false };
  try {
    const token = await twitchAppToken();
    const clientId = process.env.TWITCH_CLIENT_ID?.trim();
    if (!token || !clientId) return { ok: false };
    const params = new URLSearchParams();
    for (const login of logins.slice(0, 100)) {
      params.append("user_login", login);
    }
    const json = await fetchJson(
      `https://api.twitch.tv/helix/streams?${params.toString()}`,
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return { ok: true, map: parseTwitchStreamsPayload(json) };
  } catch (error: unknown) {
    const now = Date.now();
    if (now - twitchWarnAt > 3_600_000) {
      twitchWarnAt = now;
      logger.warn({ err: error }, "stream-alerts: Twitch Helix failed");
    }
    return { ok: false };
  }
}

export async function fetchKickLive(
  slug: string,
): Promise<StreamLiveSnapshot | null> {
  try {
    const json = await fetchJson(
      `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`,
    );
    return parseKickChannelPayload(slug, json);
  } catch (error: unknown) {
    logger.warn({ err: error, slug }, "stream-alerts: Kick failed");
    return null;
  }
}

async function resolveYouTubeChannelId(handle: string): Promise<string | null> {
  const key = youtubeKey();
  if (!key) return null;
  if (handle.startsWith("UC")) return handle;
  const tag = handle.startsWith("@") ? handle.slice(1) : handle;
  const params = new URLSearchParams({
    part: "id",
    forHandle: tag,
    key,
  });
  const json = await fetchJson(
    `https://www.googleapis.com/youtube/v3/channels?${params.toString()}`,
  );
  return parseYouTubeChannelId(json);
}

export async function fetchYouTubeLive(
  handle: string,
): Promise<StreamLiveSnapshot | null> {
  const key = youtubeKey();
  if (!key) return null;
  try {
    const channelId = await resolveYouTubeChannelId(handle);
    if (!channelId) {
      return {
        isLive: false,
        liveId: null,
        title: null,
        displayName: handle.startsWith("@") ? handle.slice(1) : handle,
        game: null,
        url: streamAlertWatchUrl("youtube", handle),
        thumbnailUrl: null,
      };
    }
    const params = new URLSearchParams({
      part: "snippet",
      channelId,
      eventType: "live",
      type: "video",
      maxResults: "1",
      key,
    });
    const json = await fetchJson(
      `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
    );
    return parseYouTubeSearchPayload(json, handle);
  } catch (error: unknown) {
    const now = Date.now();
    if (now - youtubeWarnAt > 3_600_000) {
      youtubeWarnAt = now;
      logger.warn({ err: error, handle }, "stream-alerts: YouTube Data API failed");
    }
    return null;
  }
}

export function offlineSnapshot(
  platform: "twitch" | "youtube" | "kick",
  handle: string,
): StreamLiveSnapshot {
  return {
    isLive: false,
    liveId: null,
    title: null,
    displayName: handle,
    game: null,
    url: streamAlertWatchUrl(platform, handle),
    thumbnailUrl: null,
  };
}
