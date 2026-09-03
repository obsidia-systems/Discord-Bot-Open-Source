import { STREAM_ALERT_POLL_MS } from "@adobos/shared";
import { describe, expect, it } from "vitest";
import { streamAlertsModule } from "./module.js";
import {
  parseKickChannelPayload,
  parseTwitchStreamsPayload,
  parseYouTubeChannelId,
  parseYouTubeSearchPayload,
} from "./providers.js";

describe("stream-alerts module", () => {
  it("is named Stream Alerts, no slash, and registers poller + API", () => {
    expect(streamAlertsModule.id).toBe("stream-alerts");
    expect(streamAlertsModule.name).toBe("Stream Alerts");
    expect(STREAM_ALERT_POLL_MS).toBe(60_000);
    const commands: string[] = [];
    const routes: string[] = [];
    const once: string[] = [];
    streamAlertsModule.register({
      client: {} as never,
      on: () => undefined,
      once: (event) => {
        once.push(String(event));
      },
      route: (path) => {
        routes.push(path);
      },
      rawRoute: () => undefined,
      command: (def) => {
        commands.push(def.name);
      },
      autocomplete: () => undefined,
      fallbackChat: () => undefined,
      button: () => undefined,
      select: () => undefined,
      modal: () => undefined,
    });
    expect(commands).toEqual([]);
    expect(routes).toEqual(["/api/stream-alerts"]);
    expect(once).toContain("ready");
  });
});

describe("providers", () => {
  it("parses Helix streams by login", () => {
    const map = parseTwitchStreamsPayload({
      data: [
        {
          id: "42",
          user_login: "Ada",
          user_name: "Ada",
          title: "Speedrun",
          game_name: "Celeste",
          thumbnail_url: "https://cdn.example/{width}x{height}.jpg",
        },
      ],
    });
    expect(map.get("ada")).toMatchObject({
      isLive: true,
      liveId: "42",
      title: "Speedrun",
      game: "Celeste",
      thumbnailUrl: "https://cdn.example/320x180.jpg",
    });
    expect(parseTwitchStreamsPayload({ data: [] }).size).toBe(0);
  });

  it("Kick livestream null = offline; object = live", () => {
    expect(
      parseKickChannelPayload("ada", {
        user: { username: "Ada" },
        livestream: null,
      }),
    ).toMatchObject({ isLive: false, displayName: "Ada" });
    expect(
      parseKickChannelPayload("ada", {
        user: { username: "Ada" },
        livestream: {
          id: 99,
          session_title: "Ranked",
          categories: [{ name: "Valorant" }],
          thumbnail: { url: "https://img" },
        },
      }),
    ).toMatchObject({
      isLive: true,
      liveId: "99",
      title: "Ranked",
      game: "Valorant",
    });
  });

  it("YouTube empty search = offline; videoId = live", () => {
    expect(parseYouTubeSearchPayload({ items: [] }, "@ada")).toMatchObject({
      isLive: false,
    });
    expect(
      parseYouTubeSearchPayload(
        {
          items: [
            {
              id: { videoId: "vid1" },
              snippet: {
                title: "Live now",
                channelTitle: "Ada",
                thumbnails: { high: { url: "https://i.ytimg" } },
              },
            },
          ],
        },
        "@ada",
      ),
    ).toMatchObject({
      isLive: true,
      liveId: "vid1",
      title: "Live now",
      displayName: "Ada",
    });
    expect(parseYouTubeChannelId({ items: [{ id: "UCabc" }] })).toBe("UCabc");
  });
});
