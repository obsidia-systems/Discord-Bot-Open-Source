import { describe, expect, it } from "vitest";
import {
  defaultActionLogChannelsMapping,
  defaultActionLogEnabledEvents,
  type ActionLogsConfig,
} from "@adobos/shared";
import { ACTION_LOG_EVENT_KEYS } from "@adobos/shared";
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
  it("SIMPLE siempre usa el canal global", () => {
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

  it("ADVANCED enruta invites al canal propio", () => {
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

  it("ADVANCED sin invites cae a channels (compat)", () => {
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

  it("ADVANCED sin mapping cae al global", () => {
    const config = cfg({ routingMode: "ADVANCED" });
    expect(resolveLogChannelId(config, "VOICE")).toBe("global");
    expect(resolveLogChannelId(config, "INVITES")).toBe("global");
  });
});

describe("configPassesFilters", () => {
  it("ignora bots cuando ignoreBots está activo", () => {
    expect(
      configPassesFilters(cfg(), "messageDelete", { actorIsBot: true }),
    ).toBe(false);
    expect(
      configPassesFilters(cfg({ ignoreBots: false }), "messageDelete", {
        actorIsBot: true,
      }),
    ).toBe(true);
  });

  it("ignora canal y categoría padre", () => {
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

  it("respeta el switch del evento", () => {
    const config = cfg({
      enabledEvents: {
        ...defaultActionLogEnabledEvents(),
        memberKick: false,
      },
    });
    expect(configPassesFilters(config, "memberKick")).toBe(false);
    expect(configPassesFilters(config, "memberLeave")).toBe(true);
  });

  it("módulo deshabilitado aborta todo", () => {
    expect(configPassesFilters(cfg({ enabled: false }), "memberJoin")).toBe(
      false,
    );
  });
});

describe("getEventMeta", () => {
  it("cubre todas las keys del catálogo", () => {
    for (const key of ACTION_LOG_EVENT_KEYS) {
      expect(getEventMeta(key).eventType).toBeTruthy();
      expect(getEventMeta(key).category).toBeTruthy();
    }
  });
});
