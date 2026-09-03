import {
  ACTION_LOG_EVENT_KEYS,
  type ActionLogsConfig,
  defaultActionLogChannelsMapping,
  defaultActionLogEnabledEvents,
} from "@adobos/shared";
import { describe, expect, it } from "vitest";
import {
  configPassesFilters,
  getEventMeta,
  resolveLogChannelId,
} from "./service.js";

function cfg(overrides: Partial<ActionLogsConfig> = {}): ActionLogsConfig {
  return {
    guildId: "g1",
    enabled: true,
    routingMode: "SIMPLE",
    globalChannelId: "global",
    channelsMapping: defaultActionLogChannelsMapping(),
    ignoredChannels: [],
    ignoredRoles: [],
    ignoreBots: true,
    enabledEvents: defaultActionLogEnabledEvents(),
    dataRetentionDays: 14,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("resolveLogChannelId", () => {
  it("SIMPLE always uses the global channel", () => {
    const config = cfg({
      routingMode: "SIMPLE",
      channelsMapping: {
        ...defaultActionLogChannelsMapping(),
        messages: "msg",
        invites: "inv",
      },
    });
    expect(resolveLogChannelId(config, "MESSAGES")).toBe("global");
    expect(resolveLogChannelId(config, "INVITES")).toBe("global");
  });

  it("ADVANCED routes invites to their own channel", () => {
    const config = cfg({
      routingMode: "ADVANCED",
      channelsMapping: {
        ...defaultActionLogChannelsMapping(),
        channels: "ch",
        invites: "inv",
      },
    });
    expect(resolveLogChannelId(config, "INVITES")).toBe("inv");
    expect(resolveLogChannelId(config, "CHANNELS")).toBe("ch");
  });

  it("ADVANCED without invites falls back to channels (compat)", () => {
    const config = cfg({
      routingMode: "ADVANCED",
      globalChannelId: "global",
      channelsMapping: {
        ...defaultActionLogChannelsMapping(),
        channels: "ch",
      },
    });
    expect(resolveLogChannelId(config, "INVITES")).toBe("ch");
  });

  it("ADVANCED without mapping falls back to global", () => {
    const config = cfg({ routingMode: "ADVANCED" });
    expect(resolveLogChannelId(config, "VOICE")).toBe("global");
    expect(resolveLogChannelId(config, "INVITES")).toBe("global");
  });
});

describe("configPassesFilters", () => {
  it("ignores bots when ignoreBots is enabled", () => {
    expect(
      configPassesFilters(cfg(), "messageDelete", { actorIsBot: true }),
    ).toBe(false);
    expect(
      configPassesFilters(cfg({ ignoreBots: false }), "messageDelete", {
        actorIsBot: true,
      }),
    ).toBe(true);
  });

  it("ignores channel and parent category", () => {
    const config = cfg({ ignoredChannels: ["chan", "cat"] });
    expect(
      configPassesFilters(config, "messageDelete", { channelId: "chan" }),
    ).toBe(false);
    expect(
      configPassesFilters(config, "messageDelete", {
        channelId: "other",
        parentId: "cat",
      }),
    ).toBe(false);
    expect(
      configPassesFilters(config, "messageDelete", { channelId: "ok" }),
    ).toBe(true);
  });

  it("respects the event switch", () => {
    const config = cfg({
      enabledEvents: {
        ...defaultActionLogEnabledEvents(),
        memberKick: false,
      },
    });
    expect(configPassesFilters(config, "memberKick")).toBe(false);
    expect(configPassesFilters(config, "memberLeave")).toBe(true);
  });

  it("disabled module aborts everything", () => {
    expect(configPassesFilters(cfg({ enabled: false }), "memberJoin")).toBe(
      false,
    );
  });
});

describe("getEventMeta", () => {
  it("covers all catalog keys", () => {
    for (const key of ACTION_LOG_EVENT_KEYS) {
      expect(getEventMeta(key).eventType).toBeTruthy();
      expect(getEventMeta(key).category).toBeTruthy();
    }
  });
});
