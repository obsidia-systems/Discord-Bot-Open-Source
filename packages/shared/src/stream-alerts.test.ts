import { describe, expect, it } from "vitest";
import {
  clampStreamAlertTemplate,
  isStreamAlertDestinationChannelType,
  isStreamAlertPlatform,
  normalizeStreamHandle,
  renderStreamAlertTemplate,
  STREAM_ALERT_DEFAULT_TEMPLATE,
  STREAM_ALERT_POLL_MS,
  STREAM_ALERT_TEMPLATE_MAX,
  STREAM_ALERT_YOUTUBE_POLL_MS,
  shouldAnnounceLive,
  shouldPollStreamAlert,
  streamAlertMentionPrefix,
  streamAlertWatchUrl,
} from "./stream-alerts.js";

describe("plataforma y canal", () => {
  it("acepta twitch, youtube y kick", () => {
    expect(isStreamAlertPlatform("twitch")).toBe(true);
    expect(isStreamAlertPlatform("youtube")).toBe(true);
    expect(isStreamAlertPlatform("kick")).toBe(true);
    expect(isStreamAlertPlatform("tiktok")).toBe(false);
  });

  it("solo texto y anuncios como destino Discord", () => {
    expect(isStreamAlertDestinationChannelType(0)).toBe(true);
    expect(isStreamAlertDestinationChannelType(5)).toBe(true);
    expect(isStreamAlertDestinationChannelType(2)).toBe(false);
    expect(isStreamAlertDestinationChannelType(15)).toBe(false);
  });
});

describe("normalizeStreamHandle", () => {
  it("twitch: login, URL y mayúsculas", () => {
    expect(normalizeStreamHandle("twitch", "xQc")).toEqual({
      handle: "xqc",
      displayName: "xqc",
    });
    expect(
      normalizeStreamHandle("twitch", "https://www.twitch.tv/xqc/"),
    ).toEqual({ handle: "xqc", displayName: "xqc" });
    expect(normalizeStreamHandle("twitch", "twitch.tv/Foo_Bar")).toEqual({
      handle: "foo_bar",
      displayName: "foo_bar",
    });
    expect(normalizeStreamHandle("twitch", "")).toBeNull();
    expect(normalizeStreamHandle("twitch", "https://kick.com/xqc")).toBeNull();
  });

  it("kick: slug y URL", () => {
    expect(normalizeStreamHandle("kick", "https://kick.com/xqc")).toEqual({
      handle: "xqc",
      displayName: "xqc",
    });
    expect(normalizeStreamHandle("kick", "My-Slug")).toEqual({
      handle: "my-slug",
      displayName: "my-slug",
    });
    expect(normalizeStreamHandle("kick", "ab")).toBeNull();
  });

  it("youtube: UC, @handle y URL de canal", () => {
    const uc = "UCsXVk37bltHxD1rDPwtNM8Q";
    expect(normalizeStreamHandle("youtube", uc)).toEqual({
      handle: uc,
      displayName: uc,
    });
    expect(
      normalizeStreamHandle("youtube", `https://www.youtube.com/channel/${uc}`),
    ).toEqual({ handle: uc, displayName: uc });
    expect(normalizeStreamHandle("youtube", "@mkbhd")).toEqual({
      handle: "@mkbhd",
      displayName: "mkbhd",
    });
    expect(
      normalizeStreamHandle("youtube", "https://www.youtube.com/@mkbhd/live"),
    ).toEqual({ handle: "@mkbhd", displayName: "mkbhd" });
    expect(normalizeStreamHandle("youtube", "mkbhd")).toEqual({
      handle: "@mkbhd",
      displayName: "mkbhd",
    });
    expect(
      normalizeStreamHandle("youtube", "https://youtu.be/dQw4w9WgXcQ"),
    ).toBeNull();
  });
});

describe("transición live", () => {
  it("offline → live anuncia una vez; live → live no; nuevo liveId sí", () => {
    expect(
      shouldAnnounceLive({
        isLive: true,
        previousLiveId: null,
        liveId: "s1",
      }),
    ).toBe(true);
    expect(
      shouldAnnounceLive({
        isLive: true,
        previousLiveId: "s1",
        liveId: "s1",
      }),
    ).toBe(false);
    expect(
      shouldAnnounceLive({
        isLive: true,
        previousLiveId: "s1",
        liveId: "s2",
      }),
    ).toBe(true);
    expect(
      shouldAnnounceLive({
        isLive: false,
        previousLiveId: "s1",
        liveId: null,
      }),
    ).toBe(false);
    expect(
      shouldAnnounceLive({
        isLive: true,
        previousLiveId: null,
        liveId: null,
      }),
    ).toBe(false);
  });
});

describe("poll throttle", () => {
  it("YouTube espera ~5 min; Twitch/Kick el tick de 60 s", () => {
    const now = 1_000_000;
    expect(
      shouldPollStreamAlert({
        platform: "youtube",
        lastCheckedAt: null,
        nowMs: now,
      }),
    ).toBe(true);
    expect(
      shouldPollStreamAlert({
        platform: "youtube",
        lastCheckedAt: new Date(now - 60_000).toISOString(),
        nowMs: now,
      }),
    ).toBe(false);
    expect(
      shouldPollStreamAlert({
        platform: "youtube",
        lastCheckedAt: new Date(
          now - STREAM_ALERT_YOUTUBE_POLL_MS,
        ).toISOString(),
        nowMs: now,
      }),
    ).toBe(true);
    expect(
      shouldPollStreamAlert({
        platform: "twitch",
        lastCheckedAt: new Date(now - STREAM_ALERT_POLL_MS).toISOString(),
        nowMs: now,
      }),
    ).toBe(true);
    expect(
      shouldPollStreamAlert({
        platform: "kick",
        lastCheckedAt: new Date(now - 10_000).toISOString(),
        nowMs: now,
      }),
    ).toBe(false);
  });
});

describe("plantilla", () => {
  it("vacío → default; recorta; sustituye placeholders", () => {
    expect(clampStreamAlertTemplate("")).toBe(STREAM_ALERT_DEFAULT_TEMPLATE);
    expect(clampStreamAlertTemplate("  hola  ")).toBe("hola");
    expect(clampStreamAlertTemplate("x".repeat(600)).length).toBe(
      STREAM_ALERT_TEMPLATE_MAX,
    );
    expect(
      renderStreamAlertTemplate("{name} | {title} {url} {game}", {
        name: "Ada",
        title: "Speedrun",
        url: "https://twitch.tv/ada",
        game: "Celeste",
        handle: "ada",
        platform: "Twitch",
      }),
    ).toBe("Ada | Speedrun https://twitch.tv/ada Celeste");
  });

  it("arma URL y mención de rol", () => {
    expect(streamAlertWatchUrl("twitch", "ada")).toBe(
      "https://www.twitch.tv/ada",
    );
    expect(streamAlertWatchUrl("kick", "ada")).toBe("https://kick.com/ada");
    expect(streamAlertWatchUrl("youtube", "@ada", "vid")).toBe(
      "https://www.youtube.com/watch?v=vid",
    );
    expect(streamAlertMentionPrefix("123")).toBe("<@&123> ");
    expect(streamAlertMentionPrefix(null)).toBe("");
  });
});
